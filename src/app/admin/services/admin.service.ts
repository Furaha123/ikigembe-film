import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  DashboardOverview,
  ViewerItem,
  ViewerDetail,
  ProducerItem,
  ProducerReport,
  MoviePurchaseList,
  ResetPasswordResponse,
  CreateProducerRequest,
  TransactionHistory,
  WithdrawalItem,
  AdminMovie,
  RevenueTrendItem,
  TopMovieItem,
  UserGrowthItem,
  WithdrawalSummaryItem,
} from '../models/admin.interface';

import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  getOverview(): Observable<DashboardOverview> {
    return this.http.get<DashboardOverview>(`${BASE}/admin/dashboard/overview/`);
  }

  // Viewers (users)
  getViewers(): Observable<ViewerItem[]> {
    return this.http.get<ViewerItem[]>(`${BASE}/admin/dashboard/viewers/`);
  }

  suspendUser(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/users/${id}/suspend/`, {});
  }

  deleteUser(id: number): Observable<unknown> {
    return this.http.delete(`${BASE}/admin/dashboard/users/${id}/`);
  }

  // Producers
  getProducers(): Observable<ProducerItem[]> {
    return this.http.get<ProducerItem[]>(`${BASE}/admin/dashboard/producers/`);
  }

  createProducer(payload: CreateProducerRequest): Observable<ProducerItem> {
    return this.http.post<ProducerItem>(`${BASE}/admin/dashboard/producers/create/`, payload);
  }

  approveProducer(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/producers/${id}/approve/`, {});
  }

  suspendProducer(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/producers/${id}/suspend/`, {});
  }

  // Transactions & withdrawals
  getTransactions(): Observable<TransactionHistory> {
    return this.http.get<TransactionHistory>(`${BASE}/admin/dashboard/transactions/`);
  }

  getWithdrawals(page = 1): Observable<{ results: WithdrawalItem[]; total_results: number; total_pages: number }> {
    return this.http.get<{ page: number; results: WithdrawalItem[]; total_results: number; total_pages: number }>(
      `${BASE}/admin/dashboard/withdrawals/?page=${page}`
    );
  }

  approveWithdrawal(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/withdrawals/${id}/approve/`, {});
  }

  rejectWithdrawal(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/withdrawals/${id}/reject/`, {});
  }

  completeWithdrawal(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/withdrawals/${id}/complete/`, {});
  }

  // Movies
  getMovies(): Observable<AdminMovie[]> {
    return this.http.get<{ results: AdminMovie[] }>(`${BASE}/movies/discover/`).pipe(
      map(res => res.results)
    );
  }

  createMovie(formData: FormData): Observable<unknown> {
    return this.http.post(`${BASE}/movies/create/`, formData);
  }

  updateMovie(id: number, formData: FormData): Observable<unknown> {
    return this.http.patch(`${BASE}/movies/${id}/update/`, formData);
  }

  deleteMovie(id: number): Observable<unknown> {
    return this.http.delete(`${BASE}/movies/${id}/delete/`);
  }

  // Producer detail report & movie purchases
  getProducerReport(id: number): Observable<ProducerReport> {
    return this.http.get<ProducerReport>(`${BASE}/admin/dashboard/producers/${id}/report/`);
  }

  getMoviePurchases(producerId: number, movieId: number, page = 1): Observable<MoviePurchaseList> {
    return this.http.get<MoviePurchaseList>(
      `${BASE}/admin/dashboard/producers/${producerId}/movies/${movieId}/purchases/?page=${page}`
    );
  }

  resetUserPassword(userId: number): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(
      `${BASE}/admin/dashboard/users/${userId}/reset-password/`, {}
    );
  }

  // Viewer detail & payment history
  getViewerDetail(id: number): Observable<ViewerDetail> {
    return this.http.get<ViewerDetail>(`${BASE}/admin/dashboard/viewers/${id}/`);
  }

  getViewerPayments(userId: number): Observable<ViewerPaymentItem[]> {
    return this.http.get<ViewerPaymentItem[]>(`${BASE}/admin/dashboard/viewers/${userId}/payments/`);
  }

  // ── Reports ──────────────────────────────────────────
  getRevenueTrend(period: 'monthly' | 'weekly' = 'monthly', periods = 12): Observable<{ trend: RevenueTrendItem[] }> {
    return this.http.get<{ trend: RevenueTrendItem[] }>(
      `${BASE}/admin/dashboard/reports/revenue-trend/?period=${period}&periods=${periods}`
    );
  }

  getTopMovies(limit = 10, sort: 'revenue' | 'views' = 'revenue'): Observable<{ results: TopMovieItem[] }> {
    return this.http.get<{ results: TopMovieItem[] }>(
      `${BASE}/admin/dashboard/reports/top-movies/?limit=${limit}&sort=${sort}`
    );
  }

  getUserGrowth(months = 12): Observable<{ trend: UserGrowthItem[] }> {
    return this.http.get<{ trend: UserGrowthItem[] }>(
      `${BASE}/admin/dashboard/reports/user-growth/?months=${months}`
    );
  }

  getWithdrawalSummary(months = 12): Observable<{ trend: WithdrawalSummaryItem[] }> {
    return this.http.get<{ trend: WithdrawalSummaryItem[] }>(
      `${BASE}/admin/dashboard/reports/withdrawal-summary/?months=${months}`
    );
  }
}

export interface ViewerPaymentItem {
  id: number;
  movie_title: string;
  amount: number;
  status: string;
  created_at: string;
}
