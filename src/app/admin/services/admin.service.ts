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
  FilmSubmissionItem,
  FilmDetail,
  FilmHlsStatusResponse,
  ProducerDocuments,
  ProducerContractItem,
  RevenueTrendItem,
  TopMovieItem,
  UserGrowthItem,
  WithdrawalSummaryItem,
  PayingUsersReport,
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

  rejectProducer(id: number, reason: string): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/producers/${id}/reject/`, { reason });
  }

  suspendProducer(id: number, reason?: string): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/producers/${id}/suspend/`, { reason: reason ?? '' });
  }

  getProducerDocuments(id: number): Observable<ProducerDocuments> {
    return this.http.get<ProducerDocuments>(`${BASE}/admin/dashboard/producers/${id}/documents/`);
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

  // Movies catalog
  getMovies(): Observable<AdminMovie[]> {
    return this.http.get<{ results: AdminMovie[] }>(`${BASE}/movies/discover/`).pipe(
      map(res => res.results)
    );
  }

  // Film submissions (from producers)
  getFilmSubmissions(page = 1): Observable<{ submissions: FilmSubmissionItem[]; total_results: number; total_pages: number }> {
    return this.http.get<{ page: number; total_results: number; total_pages: number; submissions: FilmSubmissionItem[] } | FilmSubmissionItem[]>(
      `${BASE}/admin/dashboard/films/submissions/?page=${page}`
    ).pipe(
      map(r => Array.isArray(r)
        ? { submissions: r, total_results: r.length, total_pages: 1 }
        : { submissions: r.submissions ?? [], total_results: r.total_results ?? 0, total_pages: r.total_pages ?? 1 }
      )
    );
  }

  approveFilm(id: number): Observable<{ detail: string; approval_status: FilmSubmissionItem['status'] }> {
    return this.http.post<{ detail: string; approval_status: FilmSubmissionItem['status'] }>(
      `${BASE}/admin/dashboard/movies/${id}/approve/`, {}
    );
  }

  getProducerContracts(): Observable<ProducerContractItem[]> {
    return this.http
      .get<{ count: number; contracts: ProducerContractItem[] }>(`${BASE}/admin/dashboard/contracts/`)
      .pipe(map(r => r.contracts));
  }

  rejectFilm(id: number, reason: string): Observable<unknown> {
    return this.http.post(`${BASE}/admin/dashboard/movies/${id}/reject/`, { reason });
  }

  getFilmDetail(id: number): Observable<FilmDetail> {
    return this.http.get<FilmDetail>(`${BASE}/admin/dashboard/movies/${id}/`);
  }

  getFilmHlsStatus(id: number): Observable<FilmHlsStatusResponse> {
    return this.http.get<FilmHlsStatusResponse>(`${BASE}/admin/dashboard/movies/${id}/hls-status/`);
  }

  removeFilm(id: number): Observable<unknown> {
    return this.http.delete(`${BASE}/admin/dashboard/films/${id}/remove/`);
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
  getRevenueTrend(
    period: 'monthly' | 'weekly' = 'monthly',
    startDate?: string,
    endDate?: string
  ): Observable<{ trend: RevenueTrendItem[] }> {
    let url = `${BASE}/admin/dashboard/reports/revenue-trend/?period=${period}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate)   url += `&end_date=${endDate}`;
    return this.http.get<{ trend: RevenueTrendItem[] }>(url);
  }

  getTopMovies(
    limit = 10,
    sort: 'revenue' | 'views' = 'revenue',
    startDate?: string,
    endDate?: string
  ): Observable<{ results: TopMovieItem[] }> {
    let url = `${BASE}/admin/dashboard/reports/top-movies/?limit=${limit}&sort=${sort}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate)   url += `&end_date=${endDate}`;
    return this.http.get<{ results: TopMovieItem[] }>(url);
  }

  getUserGrowth(startDate?: string, endDate?: string): Observable<{ trend: UserGrowthItem[] }> {
    let url = `${BASE}/admin/dashboard/reports/user-growth/`;
    if (startDate) url += `?start_date=${startDate}`;
    if (endDate)   url += `${startDate ? '&' : '?'}end_date=${endDate}`;
    return this.http.get<{ trend: UserGrowthItem[] }>(url);
  }

  getWithdrawalSummary(startDate?: string, endDate?: string): Observable<{ trend: WithdrawalSummaryItem[] }> {
    let url = `${BASE}/admin/dashboard/reports/withdrawal-summary/`;
    if (startDate) url += `?start_date=${startDate}`;
    if (endDate)   url += `${startDate ? '&' : '?'}end_date=${endDate}`;
    return this.http.get<{ trend: WithdrawalSummaryItem[] }>(url);
  }

  getPayingUsers(page = 1, startDate?: string, endDate?: string): Observable<PayingUsersReport> {
    let url = `${BASE}/admin/dashboard/reports/paying-users/?page=${page}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate)   url += `&end_date=${endDate}`;
    return this.http.get<PayingUsersReport>(url);
  }
}

export interface ViewerPaymentItem {
  id: number;
  movie_title: string;
  amount: number;
  status: string;
  created_at: string;
}
