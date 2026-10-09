import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MovieService } from '../../shared/services/movie.service';
import { DataSaverService } from '../../core/services/data-saver.service';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { MoviePreview } from '../../shared/models/movie-api.interface';
import { SeoService } from '../../core/services/seo.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AnalyticsService } from '../../core/services/analytics.service';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule, RouterLink, VideoPlayerComponent, TranslatePipe],
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
})
export class PreviewComponent implements OnInit {
  private readonly route        = inject(ActivatedRoute);
  private readonly movieService = inject(MovieService);
  private readonly seo          = inject(SeoService);
  private readonly analytics    = inject(AnalyticsService);
  private readonly platformId   = inject(PLATFORM_ID);
  private readonly translate    = inject(TranslateService);
  readonly dataSaver            = inject(DataSaverService);

  movie      = signal<MoviePreview | null>(null);
  isLoading  = signal(true);
  notFound   = signal(false);
  videoSrc   = signal('');
  isPlaying  = signal(false);

  ngOnInit() {
    const id = +this.route.snapshot.paramMap.get('id')!;
    this.movieService.getMoviePreview(id).subscribe({
      next: (data) => {
        this.movie.set(data);
        this.isLoading.set(false);
        this.seo.set({
          title: data.title,
          description: data.overview || this.translate.instant('preview.seoDescription', { title: data.title }),
          image: data.thumbnail_url ?? undefined,
          type: 'video.movie',
        });
        this.seo.setMovieJsonLd(data);
      },
      error: () => {
        this.notFound.set(true);
        this.isLoading.set(false);
        this.seo.setTranslated({ titleKey: 'preview.notFoundTitle', noIndex: true });
      },
    });
  }

  playTrailer() {
    const url = this.movie()?.trailer_url;
    if (!url) return;
    this.videoSrc.set(url);
    this.isPlaying.set(true);
    this.analytics.track('trailer_play', { movie_id: this.movie()?.id, props: { source: 'preview' } });
  }

  closePlayer() { this.isPlaying.set(false); }

  fmtDuration(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0
      ? this.translate.instant('preview.durationHoursMinutes', { h, m })
      : this.translate.instant('preview.durationMinutes', { m });
  }

  isBrowser(): boolean { return isPlatformBrowser(this.platformId); }
}
