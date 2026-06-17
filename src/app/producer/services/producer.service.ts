import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ALL_MOCK_MOVIES } from '../../shared/data/mock-movies.data';

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
  created_at: string;
  genres: string[];
}

export interface FilmSubmissionMetadata {
  title: string;
  synopsis: string;
  genre: string;
  duration_minutes: number;
  director: string;
  writer: string;
  cast: string;
  release_year: number;
  quality: string;
  price?: number;
  release_date?: string;
  has_free_preview?: boolean;
  thumbnail_key?: string;
}

export interface FilmSubmission {
  video_key: string;
  copyright_key: string;
  id_key: string;
  terms_accepted: boolean;
  terms_accepted_at: string;
  metadata: FilmSubmissionMetadata;
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
export interface ProducerEarningsKpis {
  total_gross_revenue: number;
  total_net_earnings: number;
  total_platform_commission: number;
  total_purchases: number;
  total_movies: number;
  avg_revenue_per_movie: number;
  avg_completion_rate: number;
  best_movie: { id: number; title: string; revenue: number } | null;
}

export interface ProducerEarningsTrendItem {
  period_start: string;
  gross_revenue: number;
  platform_commission: number;
  producer_earnings: number;
  transactions: number;
}

export interface ProducerEarningsReport {
  kpis: ProducerEarningsKpis;
  period: string;
  trend: ProducerEarningsTrendItem[];
}

export interface ProducerTopMovieItem {
  id: number;
  title: string;
  views: number;
  purchase_count: number;
  total_revenue: number;
  producer_share: number;
}

export interface ProducerReportData {
  trend: ProducerEarningsTrendItem[];
  top_movies: ProducerTopMovieItem[];
}

// ── Transactions ───────────────────────────────────────
export interface ProducerPaymentItem {
  id: number;
  movie_title: string;
  gross_amount: number;
  producer_earnings: number;
  date: string;
}

export interface ProducerWithdrawalTransactionItem {
  id: number;
  amount: number;
  tax_amount: number;
  amount_after_tax: number;
  payment_method: string;
  bank_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  momo_number: string | null;
  momo_provider: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
}

export interface ProducerPaginatedList<T> {
  page: number;
  total_results: number;
  total_pages: number;
  results: T[];
}

export interface ProducerTransactionResponse {
  payments: ProducerPaginatedList<ProducerPaymentItem>;
  withdrawals: ProducerPaginatedList<ProducerWithdrawalTransactionItem>;
}

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

  getReport(startDate?: string, endDate?: string): Observable<ProducerReportData> {
    let url = `${BASE}/producer/dashboard/report/`;
    if (startDate) url += `?start_date=${startDate}`;
    if (endDate)   url += `${startDate ? '&' : '?'}end_date=${endDate}`;
    return this.http.get<ProducerReportData>(url);
  }

  getEarningsReport(
    period = 'monthly',
    startDate?: string,
    endDate?: string,
  ): Observable<ProducerEarningsReport> {
    let url = `${BASE}/producer/dashboard/earnings/report/?period=${period}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate)   url += `&end_date=${endDate}`;
    return this.http.get<ProducerEarningsReport>(url);
  }

  getTransactions(page = 1): Observable<DashboardTransactionResponse> {
    return this.http.get<DashboardTransactionResponse>(
      `${BASE}/producer/dashboard/transactions/?page=${page}`
    );
  }

  getPresignedUploadUrl(filename: string, contentType: string): Observable<{ url: string; key: string }> {
    return this.http.post<{ url: string; key: string }>(
      `${BASE}/producer/upload/presign/`, { filename, content_type: contentType }
    );
  }

  submitFilm(payload: FilmSubmission): Observable<{ id: number; status: string }> {
    return this.http.post<{ id: number; status: string }>(`${BASE}/producer/films/submit/`, payload);
  }

  submitMovie(formData: FormData): Observable<unknown> {
    return this.http.post(`${BASE}/movies/create/`, formData);
  }

  initiateUpload(
    fileName: string,
    fileType: string,
    fieldName: 'video_file' | 'trailer_file',
  ): Observable<{ upload_id: string; file_key: string }> {
    return this.http.post<{ upload_id: string; file_key: string }>(
      `${BASE}/movies/upload/initiate/`,
      { file_name: fileName, file_type: fileType, field_name: fieldName },
    );
  }

  signPart(
    uploadId: string,
    fileKey: string,
    partNumber: number,
  ): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${BASE}/movies/upload/sign-part/`,
      { upload_id: uploadId, file_key: fileKey, part_number: partNumber },
    );
  }

  completeUpload(
    uploadId: string,
    fileKey: string,
    parts: { PartNumber: number; ETag: string }[],
  ): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${BASE}/movies/upload/complete/`,
      { upload_id: uploadId, file_key: fileKey, parts },
    );
  }

  updateFilm(id: number, payload: Partial<Pick<ProducerMovie, 'title' | 'overview' | 'genres' | 'price' | 'has_free_preview'>>): Observable<ProducerMovie> {
    return this.http.patch<ProducerMovie>(`${BASE}/producer/films/${id}/`, payload);
  }

  deleteFilm(id: number): Observable<unknown> {
    return this.http.delete(`${BASE}/producer/films/${id}/`);
  }

  resubmitFilm(id: number, payload: { video_key?: string; copyright_document_key?: string }): Observable<ProducerMovieDetail> {
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
