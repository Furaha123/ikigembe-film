import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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
export interface ProducerRevenueTrendItem {
  period_start: string;
  total_revenue: number;
  producer_share: number;
  purchase_count: number;
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
  trend: ProducerRevenueTrendItem[];
  top_movies: ProducerTopMovieItem[];
}

// ── Earnings report ────────────────────────────────────
export interface ProducerEarningsTrendItem {
  period_start: string;
  total_revenue: number;
  producer_share: number;
  purchase_count: number;
}

export interface ProducerEarningsReport {
  total_revenue: number;
  producer_share: number;
  purchase_count: number;
  trend: ProducerEarningsTrendItem[];
}

// ── Transactions ───────────────────────────────────────
export interface ProducerTransactionItem {
  id: number;
  movie_title: string;
  buyer_name: string | null;
  amount: number;
  your_share: number;
  status: string;
  created_at: string;
}

export interface ProducerTransactionList {
  page: number;
  total_pages: number;
  total_results: number;
  results: ProducerTransactionItem[];
}

@Injectable({ providedIn: 'root' })
export class ProducerService {
  private readonly http = inject(HttpClient);

  getWallet(): Observable<ProducerWallet> {
    return this.http.get<ProducerWallet>(`${BASE}/producer/dashboard/wallet/`);
  }

  getMovies(): Observable<ProducerMovie[]> {
    return this.http.get<ProducerMovie[]>(`${BASE}/producer/dashboard/movies/`);
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

  getRevenueTrend(
    period = 'monthly',
    startDate?: string,
    endDate?: string,
  ): Observable<{ trend: ProducerRevenueTrendItem[] }> {
    let url = `${BASE}/producer/dashboard/revenue-trend/?period=${period}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate)   url += `&end_date=${endDate}`;
    return this.http.get<{ trend: ProducerRevenueTrendItem[] }>(url);
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

  getTransactions(page = 1): Observable<ProducerTransactionList> {
    return this.http.get<ProducerTransactionList>(
      `${BASE}/producer/dashboard/transactions/?page=${page}`
    );
  }
}
