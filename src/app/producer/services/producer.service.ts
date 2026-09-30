import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MovieUploadField, MultipartUploadApi } from '../../shared/models/upload.interface';
import { MovieUploadService } from '../../shared/services/movie-upload.service';

const BASE = environment.apiUrl;

export interface ProducerWallet {
  gross_revenue: number;
  platform_commission: number;
  total_earnings: number;
  wallet_balance: number;
  pending_withdrawals: number;
  total_withdrawn: number;
  producer_share_percentage: number;
}

export interface ProducerMovie {
  id: number;
  title: string;
  overview: string | null;
  thumbnail_url: string | null;
  price: number;
  views: number;
  rating: number;
  release_date: string;
  duration_minutes: number | null;
  is_active: boolean;
  has_free_preview: boolean;
  hls_status: 'not_started' | 'processing' | 'ready' | 'failed';
  approval_status: 'pending_review' | 'approved' | 'rejected' | 'approved_pending_contract' | 'changes_requested';
  rejection_reason: string | null;
  changes_requested_note: string | null;
  created_at: string;
  genres: string[];
}

export type { MovieUploadField } from '../../shared/models/upload.interface';

/** POST /producer/films/<id>/resubmit/ — at least one key required. */
export interface FilmResubmitPayload {
  video_key?: string;
  copyright_document_key?: string;
}

export interface ProducerMovieDetail {
  id: number;
  title: string;
  overview: string;
  thumbnail_url: string | null;
  backdrop_url: string | null;
  trailer_url: string | null;
  trailer_duration_seconds: number | null;
  video_url: string | null;
  hls_url: string | null;
  hls_status: 'not_started' | 'processing' | 'ready' | 'failed';
  subtitles: string | null;
  price: number;
  views: number;
  rating: number;
  release_date: string;
  duration_minutes: number | null;
  has_free_preview: boolean;
  is_active: boolean;
  cast: string | null;
  genres: string | null;
  producer: string | null;
  created_at: string;
  updated_at: string;
  approval_status: 'pending_review' | 'approved' | 'rejected' | 'approved_pending_contract' | 'changes_requested';
  changes_requested_note: string | null;
  rejection_reason: string | null;
}

export interface ProducerWithdrawal {
  id: number;
  amount: number;
  tax_amount: number;
  amount_after_tax: number;
  status: string;
  payment_method: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  momo_number: string | null;
  momo_provider: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface ProducerWithdrawalPage {
  page: number;
  total_results: number;
  total_pages: number;
  results: ProducerWithdrawal[];
}

export interface WithdrawalRequest {
  amount: number;
  payment_method: 'Bank' | 'MoMo';
  bank_name?: string;
  account_number?: string;
  account_holder_name?: string;
  momo_number?: string;
  momo_provider?: string;
}

// ── Report interfaces ──────────────────────────────────

// ── Transactions ───────────────────────────────────────

export interface ProducerNotification {
  id: number;
  type:
    | 'account_approved'
    | 'account_rejected'
    | 'film_approved'
    | 'film_rejected'
    | 'film_changes_requested'
    | 'document_reminder'
    | 'contract_required'
    | 'contract_expiring'
    | 'contract_expired';
  message: string;
  read: boolean;
  created_at: string;
}

// ── Dashboard-specific interfaces ─────────────────────
export interface DashboardMovie {
  id: number;
  title: string;
  views: number;
  purchases: number;
  total_gross_revenue: number;
  producer_share: number;
  monthly_views: number[];  // last 6 months, oldest → newest
}

export interface DashboardTransaction {
  id: number;
  movie_title: string;
  buyer_name: string;
  gross_amount: number;
  producer_earnings: number;
  status: 'Completed' | 'Pending';
  date: string;  // YYYY-MM-DD
}

export interface DashboardTransactionResponse {
  page: number;
  total_results: number;
  total_pages: number;
  results: DashboardTransaction[];
}

export interface AnalyticsTrendPoint {
  label: string;
  views: number;
  earnings: number;
  watch_time_hours: number;
}

export interface AnalyticsResponse {
  trend: AnalyticsTrendPoint[];
  totals: {
    views: number;
    earnings: number;
    watch_time_hours: number;
    views_growth_pct: number;
    watch_time_growth_pct: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ProducerService {
  private readonly http = inject(HttpClient);
  private readonly movieUpload = inject(MovieUploadService);

  getWallet(): Observable<ProducerWallet> {
    return this.http.get<ProducerWallet>(`${BASE}/producer/dashboard/wallet/`);
  }

  getMovies(): Observable<ProducerMovie[]> {
    return this.http.get<{ results: ProducerMovie[]; total_results: number }>(
      `${BASE}/producer/films/`
    ).pipe(map(resp => resp.results));
  }

  getDashboardMovies(): Observable<DashboardMovie[]> {
    return this.http.get<DashboardMovie[] | { results: DashboardMovie[] }>(
      `${BASE}/producer/dashboard/movies/`
    ).pipe(
      map(resp => Array.isArray(resp) ? resp : (resp.results ?? []))
    );
  }

  getAnalytics(range: string, startDate?: string, endDate?: string): Observable<AnalyticsResponse> {
    let url = `${BASE}/producer/dashboard/analytics/?range=${range}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate)   url += `&end_date=${endDate}`;
    return this.http.get<AnalyticsResponse>(url);
  }

  getMovieDetail(id: number): Observable<ProducerMovieDetail> {
    return this.http.get<ProducerMovieDetail>(`${BASE}/producer/dashboard/movies/${id}/`);
  }

  getWithdrawals(page = 1): Observable<ProducerWithdrawalPage> {
    return this.http.get<ProducerWithdrawalPage>(
      `${BASE}/producer/dashboard/withdrawals/?page=${page}`
    );
  }

  requestWithdrawal(payload: WithdrawalRequest): Observable<ProducerWithdrawal> {
    return this.http.post<ProducerWithdrawal>(`${BASE}/producer/dashboard/withdrawals/`, payload);
  }

  getTransactions(page = 1): Observable<DashboardTransactionResponse> {
    return this.http.get<DashboardTransactionResponse>(
      `${BASE}/producer/dashboard/transactions/?page=${page}`
    );
  }

  submitMovie(formData: FormData): Observable<unknown> {
    return this.http.post(`${BASE}/movies/create/`, formData);
  }

  /** Movie-file multipart endpoints for MultipartUploadService, bound to one `field_name`. */
  movieUploadApi(fieldName: MovieUploadField): MultipartUploadApi {
    return this.movieUpload.api(fieldName);
  }

  updateFilm(id: number, payload: Partial<Pick<ProducerMovie, 'title' | 'overview' | 'genres' | 'price' | 'has_free_preview'>>): Observable<ProducerMovie> {
    return this.http.patch<ProducerMovie>(`${BASE}/producer/films/${id}/`, payload);
  }

  /** Edit metadata/video/trailer of a changes_requested film (multipart PATCH). */
  resubmitFilm(id: number, formData: FormData): Observable<ProducerMovieDetail> {
    return this.http.patch<ProducerMovieDetail>(`${BASE}/movies/${id}/resubmit/`, formData);
  }

  /**
   * Replace the video and/or copyright document of a changes_requested film with
   * keys from the multipart flow. Errors: 400 no key / copyright key not uploaded
   * with field_name=copyright_document, 404 not found, 409 wrong status.
   */
  resubmitFilmFiles(id: number, payload: FilmResubmitPayload): Observable<ProducerMovieDetail> {
    return this.http.post<ProducerMovieDetail>(`${BASE}/producer/films/${id}/resubmit/`, payload);
  }

  getNotifications(): Observable<ProducerNotification[]> {
    return this.http.get<ProducerNotification[] | { results: ProducerNotification[] }>(`${BASE}/producer/notifications/`).pipe(
      map(data => Array.isArray(data) ? data : (data.results ?? []))
    );
  }

  markNotificationRead(id: number): Observable<unknown> {
    return this.http.patch(`${BASE}/producer/notifications/${id}/read/`, {});
  }

  markAllNotificationsRead(): Observable<unknown> {
    return this.http.post(`${BASE}/producer/notifications/read-all/`, {});
  }
}
