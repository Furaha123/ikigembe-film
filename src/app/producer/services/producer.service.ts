import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ALL_MOCK_MOVIES } from '../../shared/data/mock-movies.data';

const BASE = environment.apiUrl;

export interface ProducerWallet {
  wallet_balance: number;
  total_earnings: number;
  total_withdrawn: number;
  pending_withdrawals: number;
  producer_share_percentage: number;
}

export interface ProducerMovie {
  id: number;
  title: string;
  price: number;
  views: number;
  rating: number;
  release_date: string;
  is_active: boolean;
  thumbnail_url: string | null;
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
  hls_status: 'not_started' | 'processing' | 'completed' | 'failed';
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
}

export interface ProducerWithdrawal {
  id: number;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  processed_at: string | null;
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

@Injectable({ providedIn: 'root' })
export class ProducerService {
  private readonly http = inject(HttpClient);

  getWallet(): Observable<ProducerWallet> {
    return this.http.get<ProducerWallet>(`${BASE}/producer/dashboard/wallet/`);
  }

  getMovies(): Observable<ProducerMovie[]> {
    const movies: ProducerMovie[] = ALL_MOCK_MOVIES.map(m => ({
      id:           m.id,
      title:        m.title,
      price:        m.price,
      views:        m.views,
      rating:       m.rating,
      release_date: m.release_date,
      is_active:    true,
      thumbnail_url: m.thumbnail_url,
    }));
    return of(movies);
  }

  getMovieDetail(id: number): Observable<ProducerMovieDetail> {
    const m = ALL_MOCK_MOVIES.find(x => x.id === id) ?? ALL_MOCK_MOVIES[0];
    const detail: ProducerMovieDetail = {
      id:                       m.id,
      title:                    m.title,
      overview:                 m.overview,
      thumbnail_url:            m.thumbnail_url,
      backdrop_url:             m.backdrop_url,
      trailer_url:              m.trailer_url,
      trailer_duration_seconds: null,
      video_url:                m.video_url,
      hls_url:                  null,
      hls_status:               'completed',
      subtitles:                null,
      price:                    m.price,
      views:                    m.views,
      rating:                   m.rating,
      release_date:             m.release_date,
      duration_minutes:         m.duration_minutes,
      has_free_preview:         m.has_free_preview,
      is_active:                true,
      cast:                     null,
      genres:                   null,
      producer:                 null,
      created_at:               '2024-01-01T00:00:00Z',
      updated_at:               '2024-04-01T00:00:00Z',
    };
    return of(detail);
  }

  getWithdrawals(): Observable<{ results: ProducerWithdrawal[] }> {
    return this.http.get<{ results: ProducerWithdrawal[] }>(`${BASE}/producer/dashboard/withdrawals/`);
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

  getTransactions(page = 1): Observable<ProducerTransactionResponse> {
    return this.http.get<ProducerTransactionResponse>(
      `${BASE}/producer/dashboard/transactions/?page=${page}`
    );
  }
}
