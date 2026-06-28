import { Component, OnInit, inject } from '@angular/core';
import { SeoService } from '../../core/services/seo.service';
import { CommonModule } from '@angular/common';
import { forkJoin, of, catchError } from 'rxjs';
import { BannerComponent } from '../../core/components/banner/banner.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { HeaderComponent } from '../../core/components/header/header.component';
import { MovieService } from '../../shared/services/movie.service';
import { MovieCarouselComponent } from "../../shared/components/movie-carousel/movie-carousel.component";
import { IVideoContent } from '../../shared/models/video-content.interface';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-browse',
  standalone: true,
  imports: [CommonModule, HeaderComponent, BannerComponent, MovieCarouselComponent, FooterComponent],
  templateUrl: './browse.component.html',
  styleUrls: ['./browse.component.scss']
})
export class BrowseComponent implements OnInit {
  auth = inject(AuthService);
  movieService = inject(MovieService);
  private seo = inject(SeoService);
  userProfileImg = '';

  bannerTitle = '';
  bannerOverview = '';
  bannerTrailerUrl = '';
  bannerBackdropUrl = '';
  bannerId: number | null = null;

  movies: IVideoContent[] = [];
  popularMovies: IVideoContent[] = [];
  nowPlayingMovies: IVideoContent[] = [];
  upcomingMovies: IVideoContent[] = [];
  topRatedMovies: IVideoContent[] = [];
  isLoading = true;

  get isEmpty(): boolean {
    return !this.isLoading &&
      !this.movies.length &&
      !this.popularMovies.length &&
      !this.nowPlayingMovies.length &&
      !this.upcomingMovies.length &&
      !this.topRatedMovies.length;
  }

  sources = [
    this.movieService.getMovies().pipe(catchError(() => of({ results: [] }))),
    this.movieService.getPopularMovies().pipe(catchError(() => of({ results: [] }))),
    this.movieService.getNowPlayingMovies().pipe(catchError(() => of({ results: [] }))),
    this.movieService.getUpcomingMovies().pipe(catchError(() => of({ results: [] }))),
    this.movieService.getTopRated().pipe(catchError(() => of({ results: [] })))
  ];

  ngOnInit(): void {
    this.seo.set({ title: 'Browse Movies', description: 'Discover the latest African films, documentaries, and short movies on Ikigembe.', noIndex: true });
    forkJoin(this.sources).subscribe((res: any[]) => {
      const [movies, popular, nowPlaying, upcoming, topRated] = res;
      this.movies = movies.results as IVideoContent[];
      this.popularMovies = popular.results as IVideoContent[];
      this.nowPlayingMovies = nowPlaying.results as IVideoContent[];
      this.upcomingMovies = upcoming.results as IVideoContent[];
      this.topRatedMovies = topRated.results as IVideoContent[];
      this.isLoading = false;

      this.pickRandomBanner();
    });
  }

  private pickRandomBanner() {
    const pool = this.nowPlayingMovies.length ? this.nowPlayingMovies : this.movies;
    if (!pool.length) return;

    // Priority 1 — admin-pinned movies that also have a backdrop (editorial control).
    // Priority 2 — any movie with a proper wide backdrop (quality gate).
    // Priority 3 — anything (last resort so the hero never stays blank).
    const featured     = pool.filter(m => m.is_featured && m.backdrop_url);
    const withBackdrop = pool.filter(m => !!m.backdrop_url);
    const candidates   = featured.length ? featured : withBackdrop.length ? withBackdrop : pool;

    const movie = candidates[Math.floor(Math.random() * candidates.length)];
    this.bannerId = movie.id;
    this.bannerTitle = movie.title || movie.name || '';
    this.bannerOverview = movie.overview;
    this.bannerTrailerUrl = movie.trailer_url || '';
    this.bannerBackdropUrl = movie.backdrop_url || movie.thumbnail_url || '';
  }

  signOut() {
    this.auth.signOut();
  }
}
