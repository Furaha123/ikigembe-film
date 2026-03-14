import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { MovieService } from '../../shared/services/movie.service';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { HeaderComponent } from '../../core/components/header/header.component';
import { IVideoContent } from '../../shared/models/video-content.interface';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FooterComponent],
  templateUrl: './movie-detail.component.html',
  styleUrls: ['./movie-detail.component.scss']
})
export class MovieDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly movieService = inject(MovieService);
  private readonly sanitizer = inject(DomSanitizer);

  movie = signal<any>(null);
  cast = signal<any[]>([]);
  similarMovies = signal<IVideoContent[]>([]);
  trailerUrl = signal<SafeResourceUrl | null>(null);
  isPlaying = signal(false);

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

      if (details.trailer_url) {
        this.trailerUrl.set(
          this.sanitizer.bypassSecurityTrustResourceUrl(details.trailer_url)
        );
      }
    });
  }

  playTrailer() {
    if (this.trailerUrl()) {
      this.isPlaying.set(true);
    }
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
