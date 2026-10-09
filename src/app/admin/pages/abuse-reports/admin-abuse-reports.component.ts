import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AbuseReportService, AbuseStatus, AbuseTargetType, AdminAbuseReport,
} from '../../../core/services/abuse-report.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';

/**
 * Abuse report queue. Resolving records the decision (audit-logged, reporter told); any action on the
 * content itself is taken from the linked moderation page — reports never remove anything automatically.
 */
@Component({
  selector: 'app-admin-abuse-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './admin-abuse-reports.component.html',
  styleUrl: '../payments/admin-payments.component.scss',
})
export class AdminAbuseReportsComponent implements OnInit {
  private readonly api = inject(AbuseReportService);
  private readonly translate = inject(TranslateService);

  readonly statuses: AbuseStatus[] = ['open', 'actioned', 'dismissed'];
  readonly targets: AbuseTargetType[] = ['film', 'casting_call', 'actor'];
  reports = signal<AdminAbuseReport[]>([]);
  counts = signal<Partial<Record<AbuseStatus, number>>>({});
  loading = signal(true);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);
  busyId = signal<number | null>(null);
  resolving = signal<{ id: number; status: 'actioned' | 'dismissed' } | null>(null);
  note = '';
  status: AbuseStatus = 'open';
  targetType: AbuseTargetType | '' = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.adminList({ status: this.status, target_type: this.targetType }).subscribe({
      next: ({ results, counts }) => { this.reports.set(results); this.counts.set(counts); this.loading.set(false); },
      error: (err: unknown) => { this.loading.set(false); this.fail(err); },
    });
  }

  setStatus(s: AbuseStatus): void {
    this.status = s;
    this.load();
  }

  startResolve(id: number, status: 'actioned' | 'dismissed'): void {
    this.note = '';
    this.error.set(null);
    this.resolving.set({ id, status });
  }

  confirmResolve(): void {
    const r = this.resolving();
    if (!r || this.busyId()) return;
    if (r.status === 'actioned' && !this.note.trim()) {
      this.error.set(this.translate.instant('admin.abuse.noteRequired'));
      return;
    }
    this.busyId.set(r.id);
    this.api.resolve(r.id, r.status, this.note.trim()).subscribe({
      next: () => {
        this.busyId.set(null);
        this.resolving.set(null);
        this.notice.set(this.translate.instant('admin.abuse.resolved'));
        this.load();
      },
      error: (err: unknown) => { this.busyId.set(null); this.fail(err); this.load(); },
    });
  }

  private fail(err: unknown): void {
    this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.actionFailed'));
  }
}
