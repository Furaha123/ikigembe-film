import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  DashboardOverview,
  ViewerItem,
  ProducerItem,
  CreateProducerRequest,
  TransactionHistory,
  WithdrawalItem,
  AdminMovie,
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

  // Viewer payment history
  getViewerPayments(userId: number): Observable<ViewerPaymentItem[]> {
    return this.http.get<ViewerPaymentItem[]>(`${BASE}/admin/dashboard/viewers/${userId}/payments/`);
  }
}

export interface ViewerPaymentItem {
  id: number;
  movie_title: string;
  amount: number;
  status: string;
  created_at: string;
}
