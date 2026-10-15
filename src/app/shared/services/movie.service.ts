import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DeviceIdService } from '../../core/services/device-id.service';
import {
  MovieListResponse,
  MovieDetailResponse,
  CatalogFilters,
  CatalogPage,
  GenresResponse,
  ProducersListResponse,
  ProducerMoviesResponse,
  MoviePreview,
  StreamResponse,
  PlaybackSource,
  WatchProgressPayload,
  WatchProgressResponse,
} from '../models/movie-api.interface';
import { IVideoContent } from '../models/video-content.interface';

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

  // Each rail has its own endpoint: /discover/ ignores `ordering`, so the old calls
  // returned the same list for every row.
  getPopularMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/popular/`);
  }

  getNowPlayingMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/now-playing/`);
  }

  /** Active films whose release date is today or later. */
  getUpcomingMovies() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/upcoming/`);
  }

  getTopRated() {
    return this.http.get<MovieListResponse>(`${this.baseUrl}/top-rated/`);
  }

  getMovieDetails(id: number) {
    return this.http.get<MovieDetailResponse>(`${this.baseUrl}/${id}/`);
  }

  /** Public trailer/preview data (share links); no auth required. */
  getMoviePreview(id: number) {
    return this.http.get<MoviePreview>(`${this.baseUrl}/${id}/preview/`);
  }

  /** Public catalog: search, genre, language, year, availability, sort; server-side paging (≤ 48). */
  getCatalog(filters: CatalogFilters) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<CatalogPage>(`${this.baseUrl}/catalog/`, { params });
  }

  getGenres() {
    return this.http.get<GenresResponse>(`${this.baseUrl}/genres/`);
  }

  /**
   * Names of every active genre (including ones no film uses yet) for film editors' pickers.
   * The API refuses inactive or unknown genres on film writes; a film may keep an inactive genre it has.
   */
  getGenreOptions(): Observable<string[]> {
    const params = new HttpParams().set('include_empty', '1');
    return this.http.get<GenresResponse>(`${this.baseUrl}/genres/`, { params }).pipe(map(r => r.results.map(g => g.name)));
  }

  /** Listed films sharing a genre (released first); never the film itself or unpublished films. */
  getRelatedMovies(id: number) {
    return this.http.get<{ results: IVideoContent[] }>(`${this.baseUrl}/${id}/related/`);
  }

  /** The admin-featured released film, else the most watched one; `result` is null on an empty catalog. */
  getFeatured() {
    return this.http.get<{ result: IVideoContent | null }>(`${this.baseUrl}/featured/`);
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
   * accepted call, so request it once per playback session (plus one retry on token expiry).
   * Sends the server-issued `X-Device-Id` (this endpoint only, DeviceIdService) for the
   * single-device view policy; a 403 `device_invalid` fetches a new id and retries once
   * (refused calls never count a view).
   * Errors: 400 missing device id, 403 `{ error, code }` not entitled / view used /
   * another device, 404 movie not found, 503 `stream_unavailable` — see classifyStreamError().
   */
  getStream(id: number): Observable<StreamResponse> {
    const request = () => this.deviceId.getId().pipe(
      switchMap(deviceId => {
        const headers = deviceId ? new HttpHeaders({ 'X-Device-Id': deviceId }) : undefined;
        return this.http.get<StreamResponse>(`${this.baseUrl}/${id}/stream/`, { headers });
      }),
    );
    return request().pipe(
      catchError(err => {
        // The stored id isn't signed for this account (or the secret rotated): get a new one, retry once.
        if (err instanceof HttpErrorResponse && err.status === 403
            && (err.error as { code?: unknown } | null)?.code === 'device_invalid') {
          this.deviceId.reset();
          return request();
        }
        return throwError(() => err);
      }),
    );
  }

  /** Saved resume point (`progress_seconds: 0` when there is none). */
  getProgress(movieId: number) {
    return this.http.get<WatchProgressResponse>(this.progressUrl(movieId));
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
    // /discover/ has no search filter (it returned every film); /search/ matches on `q`.
    return this.http.get<MovieListResponse>(`${this.baseUrl}/search/`, { params: { q: query } });
  }
}

export function toPlaybackSource(res: StreamResponse): PlaybackSource {
  return {
    src: res.stream_url,
    type: res.stream_type,
    fallbackSrc: res.fallback_url,
    subtitles: res.subtitles ?? [],
    ...(res.watermark ? { watermark: res.watermark } : {}),
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
