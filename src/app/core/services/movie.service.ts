import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import {
  MovieListResponse,
  MovieDetailResponse,
  TrailerResponse,
  MovieCreditsResponse,
  SimilarMoviesResponse
} from '../../shared/models/movie-api.interface';

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://ikigembe-backend.onrender.com/api/movies';

  getMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/discover/`);
  }

  getBannerImage(id: number) {
    return this.http.get<MovieDetailResponse>(`${this.baseUrl}/${id}/images/`);
  }

  getBannerVideo(id: number) {
    return this.http.get<TrailerResponse>(`${this.baseUrl}/${id}/trailer/`);
  }

  getBannerDetail(id: number) {
    return this.http.get<MovieDetailResponse>(`${this.baseUrl}/${id}/`);
  }

  getPopularMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/popular/`);
  }

  getNowPlayingMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/now-playing/`);
  }

  getUpcomingMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/upcoming/`);
  }

  getTopRated() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/top-rated/`);
  }

  getMovieDetails(id: number) {
    return this.http.get<MovieDetailResponse>(`${this.baseUrl}/${id}/`);
  }

  getMovieCredits(_id: number) {
    return of<MovieCreditsResponse>({ cast: [] });
  }

  getSimilarMovies(_id: number) {
    return of<SimilarMoviesResponse>({ results: [] });
  }
}
