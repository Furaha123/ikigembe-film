import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/admin/dashboard/finance`;

export type AllocationParty = 'tax' | 'operations' | 'producer' | 'partner' | 'platform';

export interface AllocationRow {
  category: 'film' | 'actor_fee' | 'producer_service';
  movie_id: number | null;
  movie_title: string | null;
  party: AllocationParty;
  producer_id: number | null;
  party_name: string;
  basis: number;
  amount: number;
  rule: string;
}

export interface FinancePeriod {
  id: number;
  label: string;
  starts_at: string;
  ends_at: string;
  status: 'open' | 'closed';
  tax_rate_percent: string | null;
  operations_percent: string | null;
  totals: Partial<Record<AllocationParty | 'gross' | 'entries', number>>;
  closed_at: string | null;
  closed_by: string | null;
  /** When this month's payouts were prepared (on close). */
  payouts_prepared_at?: string | null;
  allocations?: AllocationRow[];
  /** Why the period can't be allocated yet (missing tax rate or agreement). */
  issues?: string[];
  preview?: boolean;
  ledger_total?: number;
}

export interface Statement {
  id: number;
  period: string;
  period_id: number;
  producer_id: number;
  producer: string;
  gross: number;
  amount: number;
  payout_status: 'unpaid' | 'paid';
  payout_reference: string | null;
  paid_at: string | null;
  /** The monthly payout that settles it (null while carried over). */
  payout_id: number | null;
}

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

/** Where a payout goes (the producer's details; frozen once it is sent). */
export interface PayoutDestination {
  method: 'mobile_money' | 'bank';
  account_holder_name: string;
  country: string;
  mobile_number: string;
  mobile_network: string;
  bank_name: string;
  account_number: string;
  swift_code: string;
}

export interface AdminPayout {
  id: number;
  period: string;
  months: string[];
  producer_id: number;
  producer: string;
  producer_email: string;
  earned: number;
  withdrawal_offset: number;
  amount: number;
  status: PayoutStatus;
  /** manual | demo | dpo */
  provider: string | null;
  provider_reference: string | null;
  reference: string | null;
  failure_reason: string | null;
  attempts: number;
  approved_by: string | null;
  /** null when the producer has not added payout details yet. */
  destination: PayoutDestination | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface PayoutProviderInfo {
  name: 'manual' | 'demo' | 'dpo';
  /** True when payouts are sent by the provider (demo, DPO); manual means "record the transfer". */
  automatic: boolean;
  /** False while DPO payouts are not connected. */
  ready: boolean;
}

export interface AdminPayouts {
  results: AdminPayout[];
  summary: Record<PayoutStatus, { count: number; amount: number }>;
  provider: PayoutProviderInfo;
  schedule: { day: number; minimum: number; next_date: string };
  /** Months that have payouts, newest first. */
  periods: string[];
}

export interface MonthlyRevenueRow {
  category: AllocationRow['category'];
  label: string;
  payments: number;
  gross: number;
  refunds: number;
  refunded: number;
  net: number;
}

/** Frozen report snapshot (apps/finance/reports.py on the API). */
export interface MonthlyReportData {
  schema: number;
  month: string;
  timezone: string;
  starts_at: string;
  ends_at: string;
  generated_at: string;
  partial: boolean;
  finance_period: { status: 'open' | 'closed'; closed_at: string | null } | null;
  revenue: MonthlyRevenueRow[];
  revenue_totals: Omit<MonthlyRevenueRow, 'category' | 'label'>;
  top_films: { movie_id: number; title: string; purchases: number; net: number; plays: number }[];
  views: { playback_starts: number; playback_completions: number; trailer_plays: number; page_views: number;
           checkouts_opened: number; tracking_since: string | null };
  users: { new_by_role: Record<string, number>; total_by_role: Record<string, number>; new_total: number; total: number };
  films: { submitted: number; released: number; listed_at_generation: number };
  actor_uploads: { slots_paid: number; by_fee_band: Record<string, number>; approved: number; rejected: number };
  /** Report schema 2 onwards (yearly plans): bought this month / active at generation. */
  memberships?: Record<'actor' | 'producer_full' | 'producer_view', { paid: number; active: number }>;
  producer_services: {
    casting_announcements: { payments: number; gross: number };
    actor_search_access: { payments: number; gross: number };
    casting_calls_published: number;
    search_windows_started: number;
  };
}

export interface MonthlyReportSummary {
  id: number;
  month: string;
  generated_at: string;
  /** null when the scheduled job generated it. */
  generated_by: string | null;
  partial: boolean;
  net: number;
}

export interface MonthlyReport extends MonthlyReportSummary {
  data: MonthlyReportData;
}

/** Revenue periods, allocations (tax → operations → contract split) and producer statements. */
@Injectable({ providedIn: 'root' })
export class AdminFinanceService {
  private readonly http = inject(HttpClient);

  periods(): Observable<{ results: FinancePeriod[] }> {
    return this.http.get<{ results: FinancePeriod[] }>(`${BASE}/periods/`);
  }

  openPeriod(month: string): Observable<FinancePeriod> {
    return this.http.post<FinancePeriod>(`${BASE}/periods/`, { month });
  }

  period(id: number): Observable<FinancePeriod> {
    return this.http.get<FinancePeriod>(`${BASE}/periods/${id}/`);
  }

  close(id: number): Observable<FinancePeriod> {
    return this.http.post<FinancePeriod>(`${BASE}/periods/${id}/close/`, {});
  }

  allocationsCsv(id: number): Observable<Blob> {
    return this.http.get(`${BASE}/periods/${id}/allocations.csv`, { responseType: 'blob' });
  }

  statements(period?: string): Observable<{ results: Statement[] }> {
    const params = period ? new HttpParams().set('period', period) : undefined;
    return this.http.get<{ results: Statement[] }>(`${BASE}/statements/`, { params });
  }

  payouts(period?: string, status?: PayoutStatus): Observable<AdminPayouts> {
    let params = new HttpParams();
    if (period) params = params.set('period', period);
    if (status) params = params.set('status', status);
    return this.http.get<AdminPayouts>(`${BASE}/payouts/`, { params });
  }

  /** Approve and send through the payout provider (demo or DPO). */
  sendPayout(id: number): Observable<AdminPayout> {
    return this.http.post<AdminPayout>(`${BASE}/payouts/${id}/send/`, {});
  }

  sendAllPayouts(period: string): Observable<{ sent: number; skipped: { id: number; error: string }[] }> {
    return this.http.post<{ sent: number; skipped: { id: number; error: string }[] }>(`${BASE}/payouts/send-all/`, { period });
  }

  /** Record a transfer made outside the platform (no money is moved by this call). */
  markPayoutPaid(id: number, reference: string): Observable<AdminPayout> {
    return this.http.post<AdminPayout>(`${BASE}/payouts/${id}/mark-paid/`, { reference });
  }

  refreshPayout(id: number): Observable<AdminPayout> {
    return this.http.post<AdminPayout>(`${BASE}/payouts/${id}/refresh/`, {});
  }

  reports(month?: string): Observable<{ results: MonthlyReportSummary[] }> {
    const params = month ? new HttpParams().set('month', month) : undefined;
    return this.http.get<{ results: MonthlyReportSummary[] }>(`${BASE}/reports/`, { params });
  }

  generateReport(month: string): Observable<MonthlyReport> {
    return this.http.post<MonthlyReport>(`${BASE}/reports/`, { month });
  }

  report(id: number): Observable<MonthlyReport> {
    return this.http.get<MonthlyReport>(`${BASE}/reports/${id}/`);
  }

  reportFile(id: number, format: 'csv' | 'pdf'): Observable<Blob> {
    return this.http.get(`${BASE}/reports/${id}/report.${format}`, { responseType: 'blob' });
  }
}
