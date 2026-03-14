import { Component, OnInit, inject } from '@angular/core';
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
  userProfileImg = '';

  bannerTitle = '';
  bannerOverview = '';
  bannerTrailerKey = '';
  bannerBackdropUrl = '';

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
    const source = this.nowPlayingMovies.length ? this.nowPlayingMovies : this.movies;
    if (!source.length) return;

    const movie = source[Math.floor(Math.random() * source.length)];
    this.bannerTitle = movie.title || movie.name || '';
    this.bannerOverview = movie.overview;
    this.bannerTrailerKey = '';
    this.bannerBackdropUrl = movie.backdrop_url || movie.thumbnail_url || '';
  }

  signOut() {
    this.auth.signOut();
  }
}
