import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MovieService } from '../../shared/services/movie.service';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { HeaderComponent } from '../../core/components/header/header.component';
import { IVideoContent } from '../../shared/models/video-content.interface';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PaymentModalComponent } from '../../shared/components/payment-modal/payment-modal.component';
import { PaymentService } from '../../core/services/payment.service';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FooterComponent, VideoPlayerComponent, PaymentModalComponent],
  templateUrl: './movie-detail.component.html',
  styleUrls: ['./movie-detail.component.scss']
})
export class MovieDetailComponent implements OnInit {
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly movieService   = inject(MovieService);
  private readonly paymentService = inject(PaymentService);

  movie            = signal<any>(null);
  cast             = signal<any[]>([]);
  similarMovies    = signal<IVideoContent[]>([]);
  videoSrc         = signal<string>('');
  isPlaying        = signal(false);
  showPaymentModal = signal(false);
  purchased        = signal(false);

  private fullVideoUrl = '';

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      this.loadMovie(id);
    });
  }

  private loadMovie(id: number) {
    forkJoin({
      details: this.movieService.getMovieDetails(id),
      credits: this.movieService.getMovieCredits(id),
      similar: this.movieService.getSimilarMovies(id)
    }).subscribe(({ details, credits, similar }) => {
      this.movie.set(details);
      this.cast.set(credits.cast?.slice(0, 10) || []);
      this.similarMovies.set(similar.results?.slice(0, 6) || []);
      this.fullVideoUrl = details.video_url || '';
      this.videoSrc.set(details.trailer_url || details.video_url || '');
      this.purchased.set(this.paymentService.hasPurchased(id));
    });
  }

  playTrailer() {
    const src = this.movie()?.trailer_url || this.videoSrc();
    if (src) {
      this.videoSrc.set(src);
      this.isPlaying.set(true);
    }
  }

  watchFullMovie() {
    if (this.purchased()) {
      this.videoSrc.set(this.fullVideoUrl);
      this.isPlaying.set(true);
    } else {
      this.showPaymentModal.set(true);
    }
  }

  onPaymentSuccess() {
    this.purchased.set(true);
    this.showPaymentModal.set(false);
    const id = this.movie()?.id;
    if (!id) return;
    this.movieService.getMovieStream(id).subscribe({
      next: (res) => {
        this.videoSrc.set(res.hls_url || res.video_url || this.fullVideoUrl);
        this.isPlaying.set(true);
      },
      error: () => {
        this.videoSrc.set(this.fullVideoUrl);
        this.isPlaying.set(true);
      }
    });
  }

  closePlayer() {
    this.isPlaying.set(false);
  }

  goToMovie(id: number) {
    this.isPlaying.set(false);
    this.router.navigate(['/movie', id]);
  }

  goBack() {
    this.router.navigate(['/']);
  }

  getRatingPercent(vote: number): number {
    return Math.round(vote * 10);
  }
}
