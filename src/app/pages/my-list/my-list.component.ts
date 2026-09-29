import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { MovieService, MyListMovie, toPlaybackSource } from '../../shared/services/movie.service';
import { PlaybackSource } from '../../shared/models/movie-api.interface';
import { apiErrorMessage, UiError } from '../../shared/utils/api-error';

@Component({
  selector: 'app-my-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe, HeaderComponent, FooterComponent, VideoPlayerComponent],
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
  playerSource  = signal<PlaybackSource | null>(null); // from /stream/ — never persisted
  playerPoster  = signal('');
  playerTitle   = signal('');
  playerStartAt = signal(0);
  playerMovieId = signal<number | null>(null);
  playerLoading = signal(false);
  playError     = signal<UiError | null>(null);

  /** Handed to the player so it can re-request /stream/ once when the token expires. */
  readonly refreshStream = () =>
    this.movieService.getStream(this.playerMovieId() ?? 0).pipe(map(toPlaybackSource));

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
    if (this.playerLoading()) return;
    this.playerLoading.set(true);
    this.playError.set(null);
    this.movieService.getStream(movie.id).subscribe({
      next: (res) => {
        this.playerSource.set(toPlaybackSource(res));
        this.playerPoster.set(movie.thumbnail_url);
        this.playerTitle.set(movie.title);
        this.playerStartAt.set(parseInt(movie.progress_seconds, 10) || 0);
        this.playerMovieId.set(movie.id);
        this.playerLoading.set(false);
        this.playerOpen.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.playerLoading.set(false);
        this.playError.set({
          text: apiErrorMessage(err),
          key: err.status === 403 ? 'viewer.stream.purchaseRequired' : 'viewer.stream.failed',
        });
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
    this.playerSource.set(null);
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
