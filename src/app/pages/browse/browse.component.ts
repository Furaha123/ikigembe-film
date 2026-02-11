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

  movies: IVideoContent[] = [];
  tvShows: IVideoContent[] = [];
  nowPlayingMovies: IVideoContent[] = [];
  popularMovies: IVideoContent[] = [];
  topRatedMovies: IVideoContent[] = [];
  upcomingMovies: IVideoContent[] = [];

  sources = [
    this.movieService.getMovies().pipe(catchError(() => of({results: []}))),
    this.movieService.getTvShows().pipe(catchError(() => of({results: []}))),
    this.movieService.getNowPlayingMovies().pipe(catchError(() => of({results: []}))),
    this.movieService.getUpcomingMovies().pipe(catchError(() => of({results: []}))),
    this.movieService.getPopularMovies().pipe(catchError(() => of({results: []}))),
    this.movieService.getTopRated().pipe(catchError(() => of({results: []})))
  ];

  ngOnInit(): void {
    forkJoin(this.sources).subscribe((res: any[]) => {
      const [movies, tvShows, nowPlaying, upcoming, popular, topRated] = res;
      this.movies = movies.results as IVideoContent[];
      this.tvShows = tvShows.results as IVideoContent[];
      this.nowPlayingMovies = nowPlaying.results as IVideoContent[];
      this.upcomingMovies = upcoming.results as IVideoContent[];
      this.popularMovies = popular.results as IVideoContent[];
      this.topRatedMovies = topRated.results as IVideoContent[];

      this.pickRandomBanner();
    });
  }

  private pickRandomBanner() {
    const allMovies = [...this.movies, ...this.popularMovies, ...this.topRatedMovies];
    if (!allMovies.length) return;

    // Shuffle and try movies until we find one with a YouTube trailer
    const shuffled = allMovies.sort(() => Math.random() - 0.5);
    this.tryMovieTrailer(shuffled, 0);
  }

  private tryMovieTrailer(movies: IVideoContent[], index: number) {
    if (index >= movies.length) return;

    const movie = movies[index];
    forkJoin({
      details: this.movieService.getMovieDetails(movie.id),
      videos: this.movieService.getBannerVideo(movie.id)
    }).subscribe(({ details, videos }) => {
      const trailer = videos.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
        || videos.results?.find((v: any) => v.site === 'YouTube');

      if (trailer) {
        this.bannerTitle = details.title || details.original_title;
        this.bannerOverview = details.overview;
        this.bannerTrailerKey = trailer.key;
      } else {
        // No trailer found, try next movie
        this.tryMovieTrailer(movies, index + 1);
      }
    });
  }

  signOut() {
    this.auth.signOut();
  }
}
