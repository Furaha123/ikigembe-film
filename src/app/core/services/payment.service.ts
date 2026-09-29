import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, interval, switchMap, take, takeWhile } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PaymentPurpose = 'movie' | 'actor_video' | 'casting_announcement' | 'actor_search';
export type PaymentStatus = 'Pending' | 'Completed' | 'Failed';

/** Poll every 3 s for up to 60 s (MoMo approval window). */
export const PAYMENT_POLL_INTERVAL_MS = 3000;
export const PAYMENT_POLL_MAX_ATTEMPTS = 20;

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
  status: PaymentStatus;
  amount: number;
  currency: string;
  purpose: PaymentPurpose;
  /** null for non-movie purposes. */
  movie_id: number | null;
  movie_title: string | null;
  created_at: string;
}

export interface PaymentHistoryItem {
  deposit_id: string;
  purpose: PaymentPurpose;
  /** null for non-movie purposes. */
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

  /**
   * Polls a deposit until it settles. Emits each status; the last emission is
   * Completed/Failed, or the stream completes while still Pending on timeout.
   * Shared by movie and marketplace purchases.
   */
  pollUntilSettled(depositId: string): Observable<PaymentStatusResponse> {
    return interval(PAYMENT_POLL_INTERVAL_MS).pipe(
      switchMap(() => this.checkStatus(depositId)),
      takeWhile(res => res.status === 'Pending', true),
      take(PAYMENT_POLL_MAX_ATTEMPTS),
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

  /** Drop the local "purchased" hint when the server says the purchase is no longer usable. */
  forgetPurchase(movieId: number): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = localStorage.getItem(PURCHASED_KEY);
      const ids: number[] = stored ? JSON.parse(stored) : [];
      if (ids.includes(movieId)) {
        localStorage.setItem(PURCHASED_KEY, JSON.stringify(ids.filter(id => id !== movieId)));
      }
    } catch { /* ignore */ }
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
