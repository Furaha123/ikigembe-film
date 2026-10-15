import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/admin/dashboard`;

export type JobRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type JobTrigger = 'schedule' | 'admin' | 'tick' | 'command';

export interface JobRun {
  id: number;
  name: string;
  status: JobRunStatus;
  /** 1 + failed runs of the same job right before this one. */
  attempts: number;
  triggered_by: JobTrigger;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  /** Already sanitized by the API. */
  error: string;
  summary: { output?: string };
}

export interface JobStatus {
  name: string;
  description: string;
  interval_seconds: number;
  running: boolean;
  last_run: Omit<JobRun, 'name'> | null;
  last_error: string;
  last_error_at: string | null;
  next_due_at: string;
  due: boolean;
}

/** Booleans and enum values only — the API never returns secret values here. */
export interface DiagnosticsFlags {
  debug: boolean;
  payment_demo_mode: boolean;
  payment_gateway: string;
  payment_provider_configured: boolean;
  payout_provider: string;
  email_backend: string;
  email_delivery: string | null;
  enforce_single_device_view: boolean;
  private_bucket_configured: boolean;
  hls_encryption: boolean;
  playback_watermark: boolean;
  shared_cache: boolean;
  ops_tick_configured: boolean;
  opportunistic_tick: boolean;
}

export interface Diagnostics {
  generated_at: string;
  version: string | null;
  jobs: JobStatus[];
  recent_runs: JobRun[];
  /** Email outbox rows by status (pending, sent, failed, captured, …). */
  outbox: Record<string, number>;
  payments: { pending_older_than_minutes: number; pending_stale: number };
  transcodes: { processing: number; stuck: number; failed: number };
  flags: DiagnosticsFlags;
}

/** Operations: background jobs and platform diagnostics (`apps/ops` in the API). */
@Injectable({ providedIn: 'root' })
export class AdminOpsService {
  private readonly http = inject(HttpClient);

  getDiagnostics(): Observable<Diagnostics> {
    return this.http.get<Diagnostics>(`${BASE}/diagnostics/`);
  }

  /** Runs a job now and returns the finished run. 409 `job_running` while another run holds the job. */
  runJob(name: string): Observable<{ run: JobRun }> {
    return this.http.post<{ run: JobRun }>(`${BASE}/jobs/${encodeURIComponent(name)}/run/`, {});
  }
}
