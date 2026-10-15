import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { JobRun } from './admin-ops.service';

const BASE = `${environment.apiUrl}/admin/dashboard/usage`;

export type UsageProvider = 'r2' | 'supabase' | 'render';
/** measured = read from our own data; estimated = derived with an assumption; unknown = value is null. */
export type UsageKind = 'measured' | 'estimated' | 'unknown';
export type BillingStatus = 'not_billable' | 'unknown_usage' | 'not_configured' | 'ok' | 'warning' | 'over';

/** One dated allowance/price row entered by an admin from the provider's pricing page. Decimals are strings. */
export interface UsageAllowance {
  provider: UsageProvider;
  metric: string;
  allowance: string | null;
  price: string | null;
  /** The price covers this many billing units (e.g. 1000000 requests). Defaults to 1. */
  price_per: string | null;
  currency: string;
  /** YYYY-MM-DD: when the pricing page was read. */
  as_of: string;
  source: string;
}

export interface UsageBilling {
  status: BillingStatus;
  billing_unit?: string;
  entry?: UsageAllowance | null;
  usage?: string | null;
  allowance?: string | null;
  billable?: string | null;
  percent_of_allowance?: string | null;
  warning?: boolean;
  estimated_cost?: string | null;
  currency?: string;
}

export interface UsageMetric {
  key: string;
  label: string;
  unit: string;
  /** null when unknown — never 0. */
  value: number | null;
  kind: UsageKind;
  source: string;
  notes: string;
  coverage?: { measured: number; total: number };
  tables?: { table: string; rows: number | null; kind: UsageKind }[];
  billing: UsageBilling;
}

export interface UsageSettingsData {
  allowances: UsageAllowance[];
  rendition_bitrates_kbps: Record<string, number>;
  warning_threshold_percent: number;
  updated_at?: string | null;
}

export interface UsagePanel {
  snapshot: {
    id: number;
    computed_at: string;
    period_start: string;
    period_end: string;
    age_seconds: number;
    measurement: { heads?: number; errors?: number; pending?: number; storage_unavailable?: boolean; max_heads?: number };
  } | null;
  stale: boolean;
  stale_after_seconds: number;
  refreshing: boolean;
  last_run: { status: string; started_at: string | null; finished_at: string | null; error: string } | null;
  providers: { provider: UsageProvider; label: string; metrics: UsageMetric[] }[];
  settings: UsageSettingsData;
  billable_metrics: { key: string; provider: UsageProvider; label: string; billing_unit: string }[];
  renditions: { name: string; encoder_target_kbps: number }[];
  gb_bytes: number;
}

/** Admin hosting-usage estimates (`/api/admin/dashboard/usage/`). Estimates — not provider invoices. */
@Injectable({ providedIn: 'root' })
export class AdminUsageService {
  private readonly http = inject(HttpClient);

  get(): Observable<UsagePanel> {
    return this.http.get<UsagePanel>(`${BASE}/`);
  }

  saveSettings(body: Omit<UsageSettingsData, 'updated_at'>): Observable<UsagePanel> {
    return this.http.put<UsagePanel>(`${BASE}/settings/`, body);
  }

  /** Runs the refresh job now (409 while running, 429 right after a run). */
  refresh(): Observable<UsagePanel & { run: JobRun }> {
    return this.http.post<UsagePanel & { run: JobRun }>(`${BASE}/refresh/`, {});
  }
}
