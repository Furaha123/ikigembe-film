import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { of } from 'rxjs';
import {
  MovieListResponse,
  MovieDetailResponse,
  TrailerResponse,
  MovieCreditsResponse,
  SimilarMoviesResponse
} from '../models/movie-api.interface';

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/movies`;

  getMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/discover/`);
  }

  getTvShows() {
    return of<SimilarMoviesResponse>({ results: [] });
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

  getMovieStream(id: number) {
    return this.http.get<{ hls_url: string; video_url: string }>(`${this.baseUrl}/${id}/stream/`);
  }

  getMyList() {
    return this.http.get<MyListMovie[]>(`${this.baseUrl}/my-list/`);
  }

  saveProgress(movieId: number, secondsWatched: number, completed: boolean) {
    return this.http.post(`${this.baseUrl}/${movieId}/progress/`, {
      seconds_watched: Math.floor(secondsWatched),
      completed,
    });
  }
}

export interface MyListMovie {
  id: number;
  title: string;
  overview: string;
  thumbnail_url: string;
  duration_minutes: number;
  genres: string[];
  rating: number;
  price: number | null;
  progress_seconds: string;
  duration_seconds: string;
  completed: string;
  last_watched_at: string;
}
