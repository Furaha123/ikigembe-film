import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PaymentInitiatePayload {
  movie_id: number;
  phone_number: string;
}

export interface PaymentInitiateResponse {
  deposit_id: string;
  status: string;
  message: string;
  amount: number;
  currency: string;
}

export interface PaymentStatusResponse {
  deposit_id: string;
  status: 'Pending' | 'Completed' | 'Failed';
  amount: number;
  currency: string;
  movie_id: number | null;
  movie_title: string | null;
  created_at: string;
}

export interface PaymentHistoryItem {
  deposit_id: string;
  movie_id: number | null;
  movie_title: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

const PURCHASED_KEY = 'purchased_movies';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  initiate(payload: PaymentInitiatePayload): Observable<PaymentInitiateResponse> {
    return this.http.post<PaymentInitiateResponse>(
      `${environment.apiUrl}/payments/initiate/`,
      payload
    );
  }

  checkStatus(depositId: string): Observable<PaymentStatusResponse> {
    return this.http.get<PaymentStatusResponse>(
      `${environment.apiUrl}/payments/${depositId}/status/`
    );
  }

  getHistory(): Observable<{ count: number; results: PaymentHistoryItem[] }> {
    return this.http.get<{ count: number; results: PaymentHistoryItem[] }>(
      `${environment.apiUrl}/payments/history/`
    );
  }

  hasPurchased(movieId: number): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      const stored = localStorage.getItem(PURCHASED_KEY);
      const ids: number[] = stored ? JSON.parse(stored) : [];
      return ids.includes(movieId);
    } catch {
      return false;
    }
  }

  savePurchase(movieId: number): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = localStorage.getItem(PURCHASED_KEY);
      const ids: number[] = stored ? JSON.parse(stored) : [];
      if (!ids.includes(movieId)) {
        ids.push(movieId);
        localStorage.setItem(PURCHASED_KEY, JSON.stringify(ids));
      }
    } catch { /* ignore */ }
  }
}
