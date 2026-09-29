import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../core/services/seo.service';
import { forkJoin, map } from 'rxjs';
import { MovieService, toPlaybackSource } from '../../shared/services/movie.service';
import { WatchProgressService } from '../../shared/services/watch-progress.service';
import { PlaybackProgress, PlaybackSource } from '../../shared/models/movie-api.interface';
import { classifyStreamError, StreamDenial } from '../../shared/utils/stream-error';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { HeaderComponent } from '../../core/components/header/header.component';
import { IVideoContent } from '../../shared/models/video-content.interface';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PaymentModalComponent } from '../../shared/components/payment-modal/payment-modal.component';
import { PaymentService } from '../../core/services/payment.service';
import { DataSaverService } from '../../core/services/data-saver.service';
import { AdSlotComponent } from '../../shared/components/ad-slot/ad-slot.component';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, VideoPlayerComponent, PaymentModalComponent, AdSlotComponent],
  templateUrl: './movie-detail.component.html',
  styleUrls: ['./movie-detail.component.scss']
})
export class MovieDetailComponent implements OnInit, OnDestroy {
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly movieService   = inject(MovieService);
  private readonly paymentService = inject(PaymentService);
  private readonly seo            = inject(SeoService);
  private readonly watchProgress  = inject(WatchProgressService);
  readonly dataSaver              = inject(DataSaverService);

  movie            = signal<any>(null);
  cast             = signal<any[]>([]);
  similarMovies    = signal<IVideoContent[]>([]);
  moreFromProducer = signal<IVideoContent[]>([]);
  videoSrc         = signal<string>('');   // trailer only
  playback         = signal<PlaybackSource | null>(null); // full movie, from /stream/ — never persisted
  isPlaying        = signal(false);
  showPaymentModal = signal(false);
  purchased        = signal(false);
  streamLoading    = signal(false);
  streamError      = signal<StreamDenial | null>(null);

  /** Film whose playback progress is reported; outlives playback() so the player's final 'close' report lands. */
  private progressMovieId: number | null = null;

  /** Handed to the player so it can re-request /stream/ once when the token expires. */
  readonly refreshStream = () =>
    this.movieService.getStream(this.movie()?.id).pipe(map(toPlaybackSource));

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      this.loadMovie(id);
    });
  }

  private loadMovie(id: number) {
    this.resetPlayer();
    this.streamError.set(null);
    forkJoin({
      details: this.movieService.getMovieDetails(id),
      credits: this.movieService.getMovieCredits(id),
      similar: this.movieService.getSimilarMovies(id)
    }).subscribe(({ details, credits, similar }) => {
      this.movie.set(details);
      this.cast.set(credits.cast?.slice(0, 10) || []);
      this.similarMovies.set(similar.results?.slice(0, 6) || []);
      this.moreFromProducer.set([]);
      this.videoSrc.set(details.trailer_url || '');
      // The server's has_purchased is authoritative (it turns false once a view is used);
      // the local hint only covers a backend that doesn't send it.
      this.purchased.set(details.has_purchased ?? this.paymentService.hasPurchased(id));
      this.seo.set({
        title: details.title,
        description: details.overview || `Watch ${details.title} on Ikigembe.`,
        image: details.thumbnail_url ?? undefined,
        type: 'video.movie',
        noIndex: true,
      });
      this.seo.setMovieJsonLd(details);

      const producerId = details.producer_profile?.id;
      if (producerId) {
        this.movieService.getMoviesByProducer(producerId).subscribe({
          next: (res) => this.moreFromProducer.set(
            res.results.filter((m: IVideoContent) => m.id !== id).slice(0, 8)
          ),
          error: () => {},
        });
      }
    });
  }

  playTrailer() {
    const trailerUrl = this.movie()?.trailer_url;
    if (!trailerUrl) return;
    this.progressMovieId = null;
    this.playback.set(null);
    this.videoSrc.set(trailerUrl);
    this.isPlaying.set(true);
  }

  watchFullMovie() {
    if (this.purchased()) {
      this.startStream();
    } else {
      this.openPayment();
    }
  }

  openPayment() {
    this.streamError.set(null);
    this.showPaymentModal.set(true);
  }

  onPaymentSuccess() {
    this.purchased.set(true);
    this.showPaymentModal.set(false);
    this.startStream();
  }

  private startStream() {
    const id = this.movie()?.id;
    if (!id || this.streamLoading()) return;
    this.streamLoading.set(true);
    this.streamError.set(null);
    this.movieService.getStream(id).subscribe({
      next: (res) => {
        this.streamLoading.set(false);
        this.progressMovieId = id;
        this.playback.set(toPlaybackSource(res));
        this.isPlaying.set(true);
      },
      error: (err: unknown) => {
        this.streamLoading.set(false);
        const denial = classifyStreamError(err);
        this.streamError.set(denial);
        if (denial.canBuy) {
          // Not (or no longer) entitled — offer the purchase again.
          this.purchased.set(false);
          this.paymentService.forgetPurchase(id);
        }
        this.refreshEntitlement(id);
      },
    });
  }

  onPlaybackProgress(p: PlaybackProgress) {
    if (this.progressMovieId) this.watchProgress.report(this.progressMovieId, p);
  }

  /** has_purchased can flip back to false (view used) — re-read it after playback or a refused stream. */
  private refreshEntitlement(id: number) {
    this.movieService.getMovieDetails(id).subscribe({
      next: (details) => {
        if (this.movie()?.id !== id) return;
        this.movie.set(details);
        if (details.has_purchased !== undefined) this.purchased.set(details.has_purchased);
      },
      error: () => { /* keep current state */ },
    });
  }

  closePlayer() {
    const id = this.movie()?.id;
    const wasFullMovie = !!this.playback();
    this.resetPlayer();
    if (id && wasFullMovie) this.refreshEntitlement(id);
  }

  private resetPlayer() {
    this.isPlaying.set(false);
    this.playback.set(null);
  }

  goToMovie(id: number) {
    this.closePlayer();
    this.router.navigate(['/movie', id]);
  }

  ngOnDestroy() { this.seo.removeJsonLd(); }

  goBack() {
    this.router.navigate(['/']);
  }

  getRatingPercent(vote: number): number {
    return Math.round(vote * 10);
  }
}
