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
import {
  ALL_MOCK_MOVIES,
  MOCK_DISCOVER,
  MOCK_NOW_PLAYING,
  MOCK_POPULAR,
  MOCK_TOP_RATED,
  MOCK_UPCOMING
} from '../data/mock-movies.data';

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/movies`;

  getMovies() {
    return of(MOCK_DISCOVER);
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
    return of(MOCK_POPULAR);
  }

  getNowPlayingMovies() {
    return of(MOCK_NOW_PLAYING);
  }

  getUpcomingMovies() {
    return of(MOCK_UPCOMING);
  }

  getTopRated() {
    return of(MOCK_TOP_RATED);
  }

  getMovieDetails(id: number) {
    const movie = ALL_MOCK_MOVIES.find(m => m.id === id) ?? ALL_MOCK_MOVIES[0];
    return of(movie as MovieDetailResponse);
  }

  getMovieCredits(_id: number) {
    return of<MovieCreditsResponse>({ cast: [] });
  }

  getSimilarMovies(id: number) {
    const results = ALL_MOCK_MOVIES.filter(m => m.id !== id).slice(0, 6);
    return of<SimilarMoviesResponse>({ results });
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

  search(query: string) {
    const q = query.toLowerCase();
    const results = ALL_MOCK_MOVIES.filter(
      m => m.title.toLowerCase().includes(q) || m.overview.toLowerCase().includes(q)
    );
    return of<MovieListResponse>({ page: 1, results, total_results: results.length, total_pages: 1 });
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
