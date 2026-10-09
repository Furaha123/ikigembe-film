import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SeoService } from '../../core/services/seo.service';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, map, of } from 'rxjs';
import { MovieService, toPlaybackSource } from '../../shared/services/movie.service';
import { WatchProgressService } from '../../shared/services/watch-progress.service';
import { MovieDetailResponse, PlaybackProgress, PlaybackSource } from '../../shared/models/movie-api.interface';
import { classifyStreamError, StreamDenial } from '../../shared/utils/stream-error';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { HeaderComponent } from '../../core/components/header/header.component';
import { IVideoContent } from '../../shared/models/video-content.interface';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PaymentModalComponent } from '../../shared/components/payment-modal/payment-modal.component';
import { PaymentService } from '../../core/services/payment.service';
import { DataSaverService } from '../../core/services/data-saver.service';
import { AdSlotComponent } from '../../shared/components/ad-slot/ad-slot.component';
import { ViewingAccessComponent } from '../../shared/components/viewing-access/viewing-access.component';
import { AuthService } from '../../core/services/auth.service';
import { ShareButtonComponent } from '../../shared/components/share-button/share-button.component';
import { RETURN_URL_PARAM } from '../../shared/utils/safe-redirect';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ReportButtonComponent } from '../../shared/components/report-button/report-button.component';

import { ModalBackdropDirective } from '../../shared/directives/modal-backdrop.directive';
@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [ModalBackdropDirective, CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, VideoPlayerComponent, PaymentModalComponent, AdSlotComponent, ViewingAccessComponent, ShareButtonComponent, ReportButtonComponent],
  templateUrl: './movie-detail.component.html',
  styleUrls: ['./movie-detail.component.scss']
})
export class MovieDetailComponent implements OnInit, OnDestroy {
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly movieService   = inject(MovieService);
  private readonly paymentService = inject(PaymentService);
  private readonly seo            = inject(SeoService);
  private readonly analytics      = inject(AnalyticsService);
  private readonly watchProgress  = inject(WatchProgressService);
  private readonly translate      = inject(TranslateService);
  readonly dataSaver              = inject(DataSaverService);
  private readonly auth           = inject(AuthService);

  movie            = signal<MovieDetailResponse | null>(null);
  similarMovies    = signal<IVideoContent[]>([]);
  moreFromProducer = signal<IVideoContent[]>([]);
  videoSrc         = signal<string>('');   // trailer only
  playback         = signal<PlaybackSource | null>(null); // full movie, from /stream/ — never persisted
  isPlaying        = signal(false);
  showPaymentModal = signal(false);
  purchased        = signal(false);
  streamLoading    = signal(false);
  streamError      = signal<StreamDenial | null>(null);
  /** Page load state: the template shows a skeleton, the film, or a recoverable error. */
  loadState        = signal<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  /** A payment for this film was started and not confirmed yet (remembered across reloads). */
  pendingPayment   = signal(false);
  private currentId: number | null = null;
  /**
   * Set by /payment/return's "Watch now" (navigation state, never the URL), so playback starts
   * from the buyer's click — a reload or a shared link never consumes the view on page load.
   */
  private startPlaybackRequested = !!this.router.getCurrentNavigation()?.extras.state?.['startPlayback'];

  /** Film whose playback progress is reported; outlives playback() so the player's final 'close' report lands. */
  private progressMovieId: number | null = null;

  /** Handed to the player so it can re-request /stream/ once when the token expires. */
  readonly refreshStream = () =>
    this.movieService.getStream(this.movie()?.id as number).pipe(map(toPlaybackSource));

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      this.loadMovie(id);
    });
  }

  private loadMovie(id: number) {
    this.currentId = id;
    this.resetPlayer();
    this.streamError.set(null);
    this.movie.set(null);
    this.loadState.set('loading');
    this.pendingPayment.set(!!this.paymentService.pendingDeposit(`movie:${id}`));
    forkJoin({
      details: this.movieService.getMovieDetails(id),
      // Secondary data must not take the page down with it.
      similar: this.movieService.getRelatedMovies(id).pipe(catchError(() => of({ results: [] as IVideoContent[] }))),
    }).subscribe({
      error: (err: unknown) => {
        if (this.currentId !== id) return;
        this.loadState.set(err instanceof HttpErrorResponse && err.status === 404 ? 'not_found' : 'error');
      },
      next: ({ details, similar }) => {
      this.loadState.set('ready');
      this.movie.set(details);
      this.similarMovies.set(similar.results?.slice(0, 6) || []);
      this.moreFromProducer.set([]);
      this.videoSrc.set(details.trailer_url || '');
      // The server's has_purchased is authoritative (it turns false once a view is used);
      // the local hint only covers a backend that doesn't send it.
      this.purchased.set(details.has_purchased ?? this.paymentService.hasPurchased(id));
      if (this.startPlaybackRequested) {
        this.startPlaybackRequested = false;
        if (this.purchased()) this.startStream();
      }
      this.seo.set({
        title: details.title,
        description: details.overview || this.translate.instant('movieDetailPage.seoDescription', { title: details.title }),
        image: details.thumbnail_url ?? undefined,
        type: 'video.movie',
        // Film pages are public; private data (entitlement, links) is never part of the page metadata.
        noIndex: details.release_state === 'unavailable',
      });
      this.seo.setMovieJsonLd(details);

      const producerId = details.producer_profile?.id;
      if (producerId) {
        this.movieService.getMoviesByProducer(producerId).subscribe({
          next: (res) => this.moreFromProducer.set(
            res.results.filter((m: IVideoContent) => m.id !== id).slice(0, 8)
          ),
          error: () => { /* the "more from this producer" row stays hidden */ },
        });
      }
    }});
  }

  retryLoad() {
    if (this.currentId != null) this.loadMovie(this.currentId);
  }

  playTrailer() {
    const trailerUrl = this.movie()?.trailer_url;
    if (!trailerUrl) return;
    this.progressMovieId = null;
    this.playback.set(null);
    this.videoSrc.set(trailerUrl);
    this.isPlaying.set(true);
    this.analytics.track('trailer_play', { movie_id: this.movie()?.id, props: { source: 'detail' } });
  }

  watchFullMovie() {
    if (!this.auth.isLoggedIn()) {
      // Visitors can read the page and watch the trailer; buying or watching needs an account.
      this.router.navigate(['/login'], { queryParams: { [RETURN_URL_PARAM]: this.router.url } });
      return;
    }
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

  /** Closed without the success hand-off: the server decides whether the film is now owned. */
  onPaymentClosed() {
    this.showPaymentModal.set(false);
    const id = this.movie()?.id;
    if (id) {
      this.pendingPayment.set(!!this.paymentService.pendingDeposit(`movie:${id}`));
      this.refreshEntitlement(id);
    }
  }

  onPaymentSuccess() {
    this.pendingPayment.set(false);
    this.purchased.set(true);
    this.movie.update(movie => movie && { ...movie, has_purchased: true });
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
          this.movie.update(movie => movie && { ...movie, has_purchased: false });
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
    this.router.navigate(['/browse']);
  }

  /** release_date is a plain YYYY-MM-DD date; compare as dates in the viewer's day. */
  /** Server-decided: a coming-soon film shows its trailer but can't be bought or streamed yet. */
  isComingSoon(movie: IVideoContent): boolean {
    return movie.release_state === 'coming_soon';
  }

  /** When the full film becomes available (exact time when the API sends it). */
  releaseMoment(movie: IVideoContent): string {
    return movie.release_at ?? movie.release_date;
  }


  getRatingPercent(vote: number): number {
    return Math.round(vote * 10);
  }
}
