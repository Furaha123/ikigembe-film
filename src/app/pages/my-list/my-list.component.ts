import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { MovieService, MyListMovie } from '../../shared/services/movie.service';

@Component({
  selector: 'app-my-list',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FooterComponent, VideoPlayerComponent],
  templateUrl: './my-list.component.html',
  styleUrls: ['./my-list.component.scss']
})
export class MyListComponent implements OnInit {
  private readonly movieService = inject(MovieService);

  movies        = signal<MyListMovie[]>([]);
  loading       = signal(true);
  error         = signal('');

  // Player state
  playerOpen    = signal(false);
  playerSrc     = signal('');
  playerPoster  = signal('');
  playerTitle   = signal('');
  playerStartAt = signal(0);
  playerMovieId = signal<number | null>(null);
  playerLoading = signal(false);

  ngOnInit() {
    this.loadList();
  }

  private loadList() {
    this.movieService.getMyList().subscribe({
      next: (list) => { this.movies.set(list); this.loading.set(false); },
      error: () => { this.error.set('Could not load your list. Please try again.'); this.loading.set(false); }
    });
  }

  watchMovie(movie: MyListMovie) {
    this.playerLoading.set(true);
    this.movieService.getMovieDetails(movie.id).subscribe({
      next: (details: any) => {
        const src = details.video_url || details.hls_url || '';
        this.playerSrc.set(src);
        this.playerPoster.set(movie.thumbnail_url);
        this.playerTitle.set(movie.title);
        this.playerStartAt.set(parseInt(movie.progress_seconds, 10) || 0);
        this.playerMovieId.set(movie.id);
        this.playerLoading.set(false);
        this.playerOpen.set(true);
      },
      error: () => {
        this.playerLoading.set(false);
      }
    });
  }

  onProgressUpdate(seconds: number) {
    const id = this.playerMovieId();
    if (!id || seconds < 5) return;
    this.movieService.saveProgress(id, seconds, false).subscribe();
  }

  onVideoEnded() {
    const id = this.playerMovieId();
    if (id) {
      this.movieService.saveProgress(id, 0, true).subscribe({
        next: () => this.refreshMovie(id)
      });
    }
    this.closePlayer();
  }

  closePlayer() {
    const id = this.playerMovieId();
    if (id) this.refreshMovie(id);
    this.playerOpen.set(false);
    this.playerSrc.set('');
    this.playerMovieId.set(null);
  }

  private refreshMovie(id: number) {
    // Refresh just this movie in the list from the server
    this.movieService.getMyList().subscribe({
      next: (list) => this.movies.set(list)
    });
  }

  progressPercent(movie: MyListMovie): number {
    const progress = parseInt(movie.progress_seconds, 10) || 0;
    const duration = parseInt(movie.duration_seconds, 10) || 0;
    if (!duration) return 0;
    return Math.min(Math.round((progress / duration) * 100), 100);
  }
}
