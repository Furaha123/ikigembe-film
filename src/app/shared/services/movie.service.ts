import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { DeviceIdService } from '../../core/services/device-id.service';
import { of } from 'rxjs';
import {
  MovieListResponse,
  MovieDetailResponse,
  TrailerResponse,
  MovieCreditsResponse,
  SimilarMoviesResponse,
  ProducersListResponse,
  ProducerMoviesResponse,
  MoviePreview,
  StreamResponse,
  PlaybackSource,
  WatchProgressPayload,
  WatchProgressResponse,
} from '../models/movie-api.interface';

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  private readonly http = inject(HttpClient);
  private readonly deviceId = inject(DeviceIdService);
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
    return this.http.get<MovieListResponse>(`${this.baseUrl}/discover/`, { params: { ordering: '-views' } });
  }

  getNowPlayingMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/discover/`, { params: { ordering: '-release_date' } });
  }

  getUpcomingMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/discover/`);
  }

  getTopRated() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/discover/`, { params: { ordering: '-rating' } });
  }

  getMovieDetails(id: number) {
    return this.http.get<MovieDetailResponse>(`${this.baseUrl}/${id}/`);
  }

  /** Public trailer/preview data (share links); no auth required. */
  getMoviePreview(id: number) {
    return this.http.get<MoviePreview>(`${this.baseUrl}/${id}/preview/`);
  }

  getMovieCredits(_id: number) {
    return of<MovieCreditsResponse>({ cast: [] });
  }

  getSimilarMovies(_id: number) {
    return of<SimilarMoviesResponse>({ results: [] });
  }

  getProducers() {
    return this.http.get<ProducersListResponse>(`${this.baseUrl}/producers/`);
  }

  getMoviesByProducer(id: number, page = 1) {
    return this.http.get<ProducerMoviesResponse>(
      `${this.baseUrl}/producers/${id}/`,
      { params: { page: page.toString() } }
    );
  }

  /**
   * Entitlement-checked playback URLs. Increments the film's view counter on every
   * call, so request it once per playback session (plus one retry on token expiry).
   * Sends `X-Device-Id` (this endpoint only) for the single-device view policy.
   * Errors: 400 missing device id, 403 `{ error }` not entitled / view used /
   * another device, 404 movie not found — see classifyStreamError().
   */
  getStream(id: number) {
    const deviceId = this.deviceId.getId();
    const headers = deviceId ? new HttpHeaders({ 'X-Device-Id': deviceId }) : undefined;
    return this.http.get<StreamResponse>(`${this.baseUrl}/${id}/stream/`, { headers });
  }

  progressUrl(movieId: number): string {
    return `${this.baseUrl}/${movieId}/progress/`;
  }

  getMyList() {
    return this.http.get<MyListMovie[]>(`${this.baseUrl}/my-list/`);
  }

  /** Completion (>= 90 %) is decided server-side and consumes the view under the single-device policy. */
  saveProgress(movieId: number, payload: WatchProgressPayload) {
    return this.http.post<WatchProgressResponse>(this.progressUrl(movieId), payload);
  }

  search(query: string) {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/discover/`, { params: { search: query } });
  }
}

export function toPlaybackSource(res: StreamResponse): PlaybackSource {
  return {
    src: res.stream_url,
    type: res.stream_type,
    fallbackSrc: res.fallback_url,
    subtitles: res.subtitles ?? [],
  };
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
  progress_seconds: number;
  duration_seconds: number;
  completed: boolean;
  last_watched_at: string | null;
}
