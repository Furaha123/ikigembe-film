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

  recordPayout(id: number, reference: string): Observable<Statement> {
    return this.http.post<Statement>(`${BASE}/statements/${id}/payout/`, { reference });
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
