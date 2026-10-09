import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { EMPTY, Observable, concatMap, catchError, from, of, shareReplay, switchMap, takeWhile, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PaymentPurpose = 'movie' | 'actor_video' | 'casting_announcement' | 'actor_search';
export type PaymentStatus = 'Pending' | 'Completed' | 'Failed';

/**
 * Delay before each status check: every 3 s while the payer is likely approving the MoMo
 * prompt, then backing off to 10 s. About 2.5 minutes in total; after that the UI shows a
 * "still waiting" state with a manual re-check rather than declaring the payment failed.
 */
export const PAYMENT_POLL_SCHEDULE_MS: readonly number[] = [
  3000, 3000, 3000, 3000, 5000, 5000, 5000, 5000, 8000, 8000, 8000, 8000,
  10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000,
];
export const PAYMENT_POLL_MAX_ATTEMPTS = PAYMENT_POLL_SCHEDULE_MS.length;

/** A status check that failed for a reason worth retrying on the next tick (network, 5xx). */
function isTransient(err: unknown): boolean {
  return err instanceof HttpErrorResponse && (err.status === 0 || err.status >= 500);
}

/** sessionStorage: payments still awaiting confirmation, so a reload can resume checking. */
const PENDING_KEY = 'ikigembe_pending_payments';

export interface PaymentInitiatePayload {
  movie_id: number;
  /** Only when the gateway sends a MoMo prompt (PaymentConfig.needs_phone). */
  phone_number?: string;
}

export type PaymentGateway = 'pawapay' | 'dpo' | 'demo';
export type PaymentFailureReason = 'declined' | 'expired' | 'cancelled' | 'gateway_error';

/** GET /payments/config/: how this backend collects payments. */
export interface PaymentConfig {
  gateway: 'pawapay' | 'dpo';
  /** Ask for a MoMo number before paying (PawaPay). */
  needs_phone: boolean;
  /** Payment happens on a hosted page the buyer is sent to (DPO). */
  redirect: boolean;
  demo: boolean;
}

/** Where to send the buyer after a hosted-page payment settles. */
export type PaymentReturnContext =
  | { kind: 'movie'; movieId: number }
  | { kind: 'service'; returnTo: string };

/** Hosts a payment_url may point to (DPO's hosted page). Anything else is refused. */
const PAYMENT_PAGE_HOSTS = [/^secure\.3gdirectpay\.com$/, /(^|\.)directpay\.online$/];
const RETURNS_KEY = 'ikigembe_payment_returns';

export interface PaymentInitiateResponse {
  deposit_id: string;
  status: string;
  message: string;
  amount: number;
  currency: string;
  /** Backend PAYMENT_DEMO_MODE: no gateway was called and no money moves. */
  demo?: boolean;
  gateway?: PaymentGateway;
  /** Hosted payment page to send the buyer to (DPO, or the demo checkout). */
  payment_url?: string;
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
  demo?: boolean;
  gateway?: PaymentGateway;
  /** Still payable on the hosted page (Pending DPO payments). */
  payment_url?: string;
  failure_reason?: PaymentFailureReason | null;
}

/** 409 from a purchase: an earlier payment for the same item is still open. */
export interface PaymentPendingConflict {
  error: string;
  deposit_id: string;
  payment_url?: string;
  demo?: boolean;
}

export interface PaymentHistoryItem {
  deposit_id: string;
  purpose: PaymentPurpose;
  /** null for non-movie purposes. */
  movie_id: number | null;
  movie_title: string | null;
  /** Server-written label, e.g. "Film: Umurage" or "Actor search access until 12 Nov 2026". */
  item?: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

/** GET /payments/<deposit_id>/receipt/ — owner (or admin) only. */
export interface PaymentReceipt {
  reference: string;
  item: string;
  purpose: PaymentPurpose;
  amount: number;
  currency: string;
  status: string;
  status_label: string;
  failure_reason: string | null;
  method: string;
  /** Masked (last 4 digits). */
  payer_phone: string;
  created_at: string;
  completed_at: string | null;
  date: string;
  refunded_amount: number;
}

const PURCHASED_KEY = 'purchased_movies';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private config$?: Observable<PaymentConfig>;

  /** Cached for the session; falls back to the MoMo flow if the backend predates the endpoint. */
  getConfig(): Observable<PaymentConfig> {
    this.config$ ??= this.http.get<PaymentConfig>(`${environment.apiUrl}/payments/config/`).pipe(
      catchError(() => of<PaymentConfig>({ gateway: 'pawapay', needs_phone: true, redirect: false, demo: false })),
      shareReplay(1),
    );
    return this.config$;
  }

  cancel(depositId: string): Observable<{ status: PaymentStatus; failure_reason: PaymentFailureReason | null }> {
    return this.http.post<{ status: PaymentStatus; failure_reason: PaymentFailureReason | null }>(
      `${environment.apiUrl}/payments/${encodeURIComponent(depositId)}/cancel/`, {});
  }

  /** Demo mode only: the stand-in for DPO's page pays or declines. */
  demoCheckout(depositId: string, outcome: 'paid' | 'declined'): Observable<{ status: PaymentStatus }> {
    return this.http.post<{ status: PaymentStatus }>(
      `${environment.apiUrl}/payments/${encodeURIComponent(depositId)}/demo-checkout/`, { outcome });
  }

  /**
   * How to open a payment_url: an in-app path (the demo checkout) or DPO's hosted page.
   * Returns null for anything else, so a bad URL can never send the buyer off-site.
   */
  paymentPageTarget(url: string | undefined | null): { internal: string } | { external: string } | null {
    if (!url || !isPlatformBrowser(this.platformId)) return null;
    let parsed: URL;
    try { parsed = new URL(url, window.location.origin); } catch { return null; }
    if (parsed.pathname === '/payment/demo-checkout') return { internal: parsed.pathname + parsed.search };
    if (parsed.protocol === 'https:' && PAYMENT_PAGE_HOSTS.some(h => h.test(parsed.hostname))) return { external: parsed.href };
    return null;
  }

  rememberReturn(depositId: string, context: PaymentReturnContext): void {
    this.updateStore<PaymentReturnContext>(RETURNS_KEY, map => { map[depositId] = context; });
  }

  returnContext(depositId: string): PaymentReturnContext | null {
    const ctx = this.readStore<PaymentReturnContext>(RETURNS_KEY)[depositId];
    if (!ctx || typeof ctx !== 'object') return null;
    if (ctx.kind === 'movie' && Number.isInteger(ctx.movieId)) return ctx;
    if (ctx.kind === 'service' && typeof ctx.returnTo === 'string') return ctx;
    return null;
  }

  forgetReturn(depositId: string): void {
    this.updateStore<PaymentReturnContext>(RETURNS_KEY, map => { delete map[depositId]; });
  }

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
    return from(PAYMENT_POLL_SCHEDULE_MS).pipe(
      concatMap(delay => timer(delay).pipe(
        switchMap(() => this.checkStatus(depositId).pipe(
          // One failed check is not a failed payment: try again on the next tick.
          catchError(err => isTransient(err) ? EMPTY : throwError(() => err)),
        )),
      )),
      takeWhile(res => res.status === 'Pending', true),
    );
  }

  /**
   * Remember a deposit that hasn't settled yet (`key` names what is being bought, e.g.
   * `movie:12`). The deposit id is not a credential: only its owner can read its status.
   */
  rememberPending(key: string, depositId: string): void {
    this.updateStore<string>(PENDING_KEY, map => { map[key] = depositId; });
  }

  pendingDeposit(key: string): string | null {
    const value = this.readStore<string>(PENDING_KEY)[key];
    return typeof value === 'string' ? value : null;
  }

  forgetPending(key: string): void {
    this.updateStore<string>(PENDING_KEY, map => { delete map[key]; });
  }

  /** Forget a deposit under whatever item key it was remembered (the return page only knows the id). */
  forgetDeposit(depositId: string): void {
    this.updateStore<string>(PENDING_KEY, map => {
      for (const [k, v] of Object.entries(map)) if (v === depositId) delete map[k];
    });
  }

  private readStore<T>(key: string): Record<string, T> {
    if (!isPlatformBrowser(this.platformId)) return {};
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      return parsed && typeof parsed === 'object' ? parsed as Record<string, T> : {};
    } catch {
      return {};
    }
  }

  private updateStore<T>(key: string, change: (map: Record<string, T>) => void): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const map = this.readStore<T>(key);
    change(map);
    try {
      if (Object.keys(map).length) sessionStorage.setItem(key, JSON.stringify(map));
      else sessionStorage.removeItem(key);
    } catch { /* storage unavailable: resuming after a reload just won't happen */ }
  }

  getHistory(): Observable<{ count: number; results: PaymentHistoryItem[] }> {
    return this.http.get<{ count: number; results: PaymentHistoryItem[] }>(
      `${environment.apiUrl}/payments/history/`
    );
  }

  getReceipt(depositId: string): Observable<PaymentReceipt> {
    return this.http.get<PaymentReceipt>(`${environment.apiUrl}/payments/${encodeURIComponent(depositId)}/receipt/`);
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
