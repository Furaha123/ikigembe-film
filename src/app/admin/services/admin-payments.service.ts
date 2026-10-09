import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/admin/dashboard`;

export type LedgerStatus = 'Pending' | 'Completed' | 'Failed' | 'Refunded';
export type LedgerPurpose = 'movie' | 'actor_video' | 'casting_announcement' | 'actor_search';
export type RefundState = 'none' | 'in_progress' | 'partial' | 'refunded';
export type RefundMethod = 'provider' | 'manual';
export type RefundStatus = 'requested' | 'processing' | 'completed' | 'failed';

/** Ledger filters; also the URL query params of /admin/payments. */
export interface LedgerFilters {
  q?: string;
  purpose?: LedgerPurpose | '';
  status?: LedgerStatus | '';
  gateway?: 'pawapay' | 'dpo' | 'demo' | '';
  refund?: 'in_progress' | 'partial' | 'refunded' | 'any' | '';
  unresolved?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface LedgerRow {
  id: number;
  reference: string;
  user: { id: number; name: string; email: string | null; phone_number: string | null; role: string };
  purpose: LedgerPurpose;
  item: string;
  amount: number;
  currency: string;
  refunded_amount: number;
  refund_state: RefundState;
  status: LedgerStatus;
  failure_reason: string | null;
  gateway: string;
  gateway_status: string | null;
  payer_phone: string | null;
  created_at: string;
  completed_at: string | null;
  /** Pending for more than 30 minutes. */
  unresolved: boolean;
}

export interface LedgerPage {
  page: number;
  page_size: number;
  total_results: number;
  total_pages: number;
  totals: { paid: number; refunded: number; net: number; currency: string };
  results: LedgerRow[];
}

export interface RefundRow {
  id: number;
  amount: number;
  reason: string;
  method: RefundMethod;
  status: RefundStatus;
  reference: string | null;
  failure_reason: string | null;
  benefit_revoked: boolean;
  created_at: string;
  completed_at: string | null;
  requested_by: string | null;
}

export interface PaymentDetail extends LedgerRow {
  benefit: { kind: string; id: number; label: string; state: string } | null;
  refunds: RefundRow[];
  refundable_amount: number;
  provider_refunds_supported: boolean;
  gateway_ref: string | null;
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  target?: string;
  resource?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface AuditEntry {
  id: number;
  admin: string | null;
  admin_id: number | null;
  action: string;
  action_label: string;
  target_user: string | null;
  target_user_id: number | null;
  target_withdrawal_id: number | null;
  detail: Record<string, unknown>;
  ip_address: string | null;
  timestamp: string;
}

export interface AuditPage {
  page: number;
  page_size: number;
  total_results: number;
  total_pages: number;
  actions: { value: string; label: string }[];
  results: AuditEntry[];
}

/** Drops empty values so the URL and the request carry only real filters. */
export function toParams(filters: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params = params.set(key, value === true ? '1' : String(value));
  }
  return params;
}

/** Admin payments ledger, refunds and the audit trail (all server-filtered and paginated). */
@Injectable({ providedIn: 'root' })
export class AdminPaymentsService {
  private readonly http = inject(HttpClient);

  ledger(filters: LedgerFilters): Observable<LedgerPage> {
    return this.http.get<LedgerPage>(`${BASE}/payments/`, { params: toParams(filters) });
  }

  /** CSV of the same filtered ledger (formula-safe on the server). */
  exportCsv(filters: LedgerFilters): Observable<Blob> {
    // The export covers every row: drop the paging (toParams skips undefined values).
    const params = toParams({ ...filters, page: undefined, page_size: undefined });
    return this.http.get(`${BASE}/payments/export/`, { params, responseType: 'blob' });
  }

  detail(id: number): Observable<PaymentDetail> {
    return this.http.get<PaymentDetail>(`${BASE}/payments/${id}/`);
  }

  recheck(id: number): Observable<{ status: LedgerStatus; failure_reason: string | null }> {
    return this.http.post<{ status: LedgerStatus; failure_reason: string | null }>(`${BASE}/payments/${id}/recheck/`, {});
  }

  requestRefund(id: number, body: { amount: number; reason: string; method: RefundMethod }): Observable<RefundRow> {
    return this.http.post<RefundRow>(`${BASE}/payments/${id}/refunds/`, body);
  }

  completeRefund(refundId: number, reference: string): Observable<RefundRow> {
    return this.http.post<RefundRow>(`${BASE}/refunds/${refundId}/complete/`, { reference });
  }

  failRefund(refundId: number, reason: string): Observable<RefundRow> {
    return this.http.post<RefundRow>(`${BASE}/refunds/${refundId}/fail/`, { reason });
  }

  auditLog(filters: AuditFilters): Observable<AuditPage> {
    return this.http.get<AuditPage>(`${BASE}/audit-logs/`, { params: toParams(filters) });
  }
}
