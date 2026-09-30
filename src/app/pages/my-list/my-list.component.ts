import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PaymentModalComponent } from '../../shared/components/payment-modal/payment-modal.component';
import { MovieService, MyListMovie, toPlaybackSource } from '../../shared/services/movie.service';
import { WatchProgressService } from '../../shared/services/watch-progress.service';
import { PlaybackProgress, PlaybackSource } from '../../shared/models/movie-api.interface';
import { classifyStreamError, StreamDenial } from '../../shared/utils/stream-error';

@Component({
  selector: 'app-my-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe, HeaderComponent, FooterComponent, VideoPlayerComponent, PaymentModalComponent],
  templateUrl: './my-list.component.html',
  styleUrls: ['./my-list.component.scss']
})
export class MyListComponent implements OnInit {
  private readonly movieService  = inject(MovieService);
  private readonly watchProgress = inject(WatchProgressService);

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
  playError     = signal<StreamDenial | null>(null);
  buyAgainMovie = signal<MyListMovie | null>(null); // movie whose used-up view is being re-bought

  /** Movie the current playError refers to (for "Buy again"). */
  private errorMovie: MyListMovie | null = null;

  /** Handed to the player so it can re-request /stream/ once when the token expires. */
  readonly refreshStream = () =>
    this.movieService.getStream(this.playerMovieId() ?? 0).pipe(map(toPlaybackSource));

  ngOnInit() {
    this.loadList();
  }

  private loadList() {
    this.movieService.getMyList().subscribe({
      next: (list) => { this.movies.set(list); this.loading.set(false); },
      error: () => { this.error.set('myList.loadError'); this.loading.set(false); }
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
        this.playerStartAt.set(movie.completed ? 0 : movie.progress_seconds || 0);
        this.playerMovieId.set(movie.id);
        this.playerLoading.set(false);
        this.playerOpen.set(true);
      },
      error: (err: unknown) => {
        this.playerLoading.set(false);
        this.errorMovie = movie;
        this.playError.set(classifyStreamError(err));
        this.refreshList();
      }
    });
  }

  buyAgain() {
    if (this.errorMovie) this.buyAgainMovie.set(this.errorMovie);
  }

  onPaymentSuccess() {
    const movie = this.buyAgainMovie();
    this.buyAgainMovie.set(null);
    this.playError.set(null);
    if (movie) this.watchMovie(movie);
  }

  onPlaybackProgress(p: PlaybackProgress) {
    // playerMovieId is kept after close so the player's final 'close' report still lands.
    const id = this.playerMovieId();
    if (!id) return;
    const done = this.watchProgress.report(id, p);
    if (p.reason === 'close') done.then(() => this.refreshList());
  }

  onVideoEnded() {
    this.closePlayer();
  }

  closePlayer() {
    this.playerOpen.set(false);
    this.playerSource.set(null);
  }

  private refreshList() {
    this.movieService.getMyList().subscribe({
      next: (list) => this.movies.set(list),
      error: () => { /* keep the current list */ },
    });
  }

  progressPercent(movie: MyListMovie): number {
    const progress = movie.progress_seconds || 0;
    const duration = movie.duration_seconds || 0;
    if (!duration) return 0;
    return Math.min(Math.round((progress / duration) * 100), 100);
  }
}
