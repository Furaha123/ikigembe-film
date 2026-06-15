import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MovieService } from '../../core/services/movie.service';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { MoviePreview } from '../../shared/models/movie-api.interface';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule, RouterLink, VideoPlayerComponent],
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
})
export class PreviewComponent implements OnInit {
  private readonly route       = inject(ActivatedRoute);
  private readonly movieService= inject(MovieService);
  private readonly platformId  = inject(PLATFORM_ID);

  movie      = signal<MoviePreview | null>(null);
  isLoading  = signal(true);
  notFound   = signal(false);
  videoSrc   = signal('');
  isPlaying  = signal(false);

  ngOnInit() {
    const id = +this.route.snapshot.paramMap.get('id')!;
    this.movieService.getMoviePreview(id).subscribe({
      next: (data) => { this.movie.set(data); this.isLoading.set(false); },
      error: () => { this.notFound.set(true); this.isLoading.set(false); },
    });
  }

  playTrailer() {
    const url = this.movie()?.trailer_url;
    if (!url) return;
    this.videoSrc.set(url);
    this.isPlaying.set(true);
  }

  closePlayer() { this.isPlaying.set(false); }

  fmtDuration(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  isBrowser(): boolean { return isPlatformBrowser(this.platformId); }
}
