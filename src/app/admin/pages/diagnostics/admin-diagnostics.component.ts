import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminOpsService, Diagnostics, DiagnosticsFlags, JobRunStatus } from '../../services/admin-ops.service';
import { apiErrorMessage, apiErrorReference } from '../../../shared/utils/api-error';
import { ErrorReferenceComponent } from '../../../shared/components/error-reference/error-reference.component';

interface UiFailure { text: string; ref: string | null }

/** Order and labels of the configuration flags (values come from the API, never secrets). */
const FLAG_ORDER: (keyof DiagnosticsFlags)[] = [
  'debug', 'payment_demo_mode', 'payment_gateway', 'payment_provider_configured', 'payout_provider',
  'email_backend', 'email_delivery', 'enforce_single_device_view', 'private_bucket_configured',
  'hls_encryption', 'playback_watermark', 'shared_cache', 'ops_tick_configured', 'opportunistic_tick',
];

/** Background jobs ("Run now"), queue counts and configuration flags (`/api/admin/dashboard/diagnostics/`). */
@Component({
  selector: 'app-admin-diagnostics',
  standalone: true,
  imports: [DatePipe, TranslatePipe, ErrorReferenceComponent],
  templateUrl: './admin-diagnostics.component.html',
  styleUrls: ['../payments/admin-payments.component.scss', './admin-diagnostics.component.scss'],
})
export class AdminDiagnosticsComponent implements OnInit {
  private readonly api = inject(AdminOpsService);
  private readonly translate = inject(TranslateService);

  readonly data = signal<Diagnostics | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<UiFailure | null>(null);
  /** Job currently being run from this page. */
  readonly runningJob = signal<string | null>(null);
  readonly runMessage = signal<{ job: string; ok: boolean; text: string; ref: string | null } | null>(null);

  readonly flagOrder = FLAG_ORDER;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.getDiagnostics().subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set({
          text: apiErrorMessage(err) ?? this.translate.instant('admin.diagnostics.loadFailed'),
          ref: apiErrorReference(err),
        });
      },
    });
  }

  runNow(name: string): void {
    if (this.runningJob()) return;
    this.runningJob.set(name);
    this.runMessage.set(null);
    this.api.runJob(name).subscribe({
      next: ({ run }) => {
        this.runningJob.set(null);
        const ok = run.status === 'succeeded';
        this.runMessage.set({
          job: name, ok, ref: null,
          text: ok
            ? this.translate.instant('admin.diagnostics.runSucceeded', { job: name, ms: run.duration_ms ?? 0 })
            : this.translate.instant('admin.diagnostics.runFailed', { job: name, error: run.error }),
        });
        this.load();
      },
      error: (err: unknown) => {
        this.runningJob.set(null);
        this.runMessage.set({
          job: name, ok: false, ref: apiErrorReference(err),
          text: apiErrorMessage(err) ?? this.translate.instant('admin.diagnostics.runError'),
        });
      },
    });
  }

  statusClass(status: JobRunStatus | undefined): string {
    switch (status) {
      case 'succeeded': return 'status-completed';
      case 'failed': return 'status-failed';
      case 'running':
      case 'queued': return 'status-pending';
      default: return '';
    }
  }

  outboxEntries(d: Diagnostics): { status: string; count: number }[] {
    return Object.entries(d.outbox).map(([status, count]) => ({ status, count }));
  }

  flagValue(d: Diagnostics, key: keyof DiagnosticsFlags): string {
    const value = d.flags[key];
    if (typeof value === 'boolean') return this.translate.instant(value ? 'admin.diagnostics.yes' : 'admin.diagnostics.no');
    return value === null || value === '' ? '—' : String(value);
  }

  /** Flags that deserve attention on a deployed site. */
  flagWarning(d: Diagnostics, key: keyof DiagnosticsFlags): boolean {
    const f = d.flags;
    switch (key) {
      case 'debug': return f.debug;
      case 'private_bucket_configured': return !f.private_bucket_configured;
      case 'ops_tick_configured': return !f.ops_tick_configured && !f.opportunistic_tick;
      case 'shared_cache': return !f.shared_cache;
      default: return false;
    }
  }

  interval(seconds: number): string {
    return seconds >= 3600 && seconds % 3600 === 0
      ? this.translate.instant('admin.diagnostics.everyHours', { n: seconds / 3600 })
      : this.translate.instant('admin.diagnostics.everyMinutes', { n: Math.round(seconds / 60) });
  }
}
