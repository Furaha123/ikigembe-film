import { Component, DestroyRef, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import {
  AdminFinanceService, AdminPayout, AdminPayouts, PayoutDestination, PayoutStatus,
} from '../../services/admin-finance.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';

const STATUSES: PayoutStatus[] = ['pending', 'processing', 'failed', 'paid'];
const POLL_MS = 4000;

/**
 * Monthly producer payouts. Each month's close prepares one payout per producer owed at least the
 * minimum; an admin approves it here. With an automatic provider (demo, DPO) "Send" hands it over
 * and the row follows the provider's answer; otherwise finance transfers the money and records the
 * reference. A failed payout can be sent again or paid by hand; a paid one is final.
 */
@Component({
  selector: 'app-admin-payouts',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-payouts.component.html',
  styleUrls: ['../payments/admin-payments.component.scss', './admin-payouts.component.scss'],
})
export class AdminPayoutsComponent implements OnInit {
  private readonly api = inject(AdminFinanceService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly statuses = STATUSES;
  data = signal<AdminPayouts | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);
  busyId = signal<number | null>(null);
  sendingAll = signal(false);
  confirmAll = signal(false);
  markFor = signal<number | null>(null);
  reference = '';
  period = '';
  status: PayoutStatus | '' = '';

  readonly provider = computed(() => this.data()?.provider ?? null);
  readonly canSend = computed(() => !!this.provider()?.automatic && !!this.provider()?.ready);
  readonly pendingCount = computed(() => this.data()?.summary.pending.count ?? 0);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.period = q.get('period') ?? '';
    const s = q.get('status') as PayoutStatus | null;
    this.status = s && STATUSES.includes(s) ? s : '';
    this.load();
  }

  load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.stopPolling();
    this.api.payouts(this.period || undefined, this.status || undefined).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        // Follow payouts being sent (demo settles in seconds; DPO on the next check).
        if (d.results.some(p => p.status === 'processing')) this.schedulePoll();
      },
      error: (err: unknown) => { this.loading.set(false); this.fail(err); },
    });
  }

  applyFilters(): void {
    this.confirmAll.set(false);
    void this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: { period: this.period || null, status: this.status || null },
    });
    this.load();
  }

  setStatus(s: PayoutStatus | ''): void {
    this.status = s;
    this.applyFilters();
  }

  send(p: AdminPayout): void {
    if (this.busyId()) return;
    this.clearMessages();
    this.busyId.set(p.id);
    this.api.sendPayout(p.id).subscribe({
      next: (updated) => { this.busyId.set(null); this.replace(updated); this.load(true); },
      error: (err: unknown) => { this.busyId.set(null); this.fail(err); },
    });
  }

  sendAll(): void {
    if (!this.period || this.sendingAll()) return;
    this.clearMessages();
    this.sendingAll.set(true);
    this.api.sendAllPayouts(this.period).subscribe({
      next: ({ sent, skipped }) => {
        this.sendingAll.set(false);
        this.confirmAll.set(false);
        this.notice.set(this.translate.instant('admin.payouts.sentAll', { sent, skipped: skipped.length }));
        this.load(true);
      },
      error: (err: unknown) => { this.sendingAll.set(false); this.fail(err); },
    });
  }

  startMarkPaid(p: AdminPayout): void {
    this.reference = '';
    this.clearMessages();
    this.markFor.set(p.id);
  }

  markPaid(p: AdminPayout): void {
    const reference = this.reference.trim();
    if (!reference) { this.error.set(this.translate.instant('admin.payments.referenceRequired')); return; }
    if (this.busyId()) return;
    this.busyId.set(p.id);
    this.api.markPayoutPaid(p.id, reference).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.markFor.set(null);
        this.replace(updated);
        this.load(true);
      },
      error: (err: unknown) => { this.busyId.set(null); this.fail(err); },
    });
  }

  refresh(p: AdminPayout): void {
    this.api.refreshPayout(p.id).subscribe({
      next: (updated) => this.replace(updated),
      error: (err: unknown) => this.fail(err),
    });
  }

  statusClass(s: PayoutStatus): string {
    return { pending: 'status-pending', processing: 'status-refunded', paid: 'status-completed', failed: 'status-failed' }[s];
  }

  destinationLine(d: PayoutDestination): string {
    return d.method === 'mobile_money'
      ? `${d.mobile_network} · ${d.mobile_number}`
      : [d.bank_name, d.account_number, d.swift_code].filter(Boolean).join(' · ');
  }

  private replace(updated: AdminPayout): void {
    this.data.update(d => d ? { ...d, results: d.results.map(p => p.id === updated.id ? updated : p) } : d);
  }

  private schedulePoll(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.pollTimer = setTimeout(() => this.load(true), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private clearMessages(): void {
    this.error.set(null);
    this.notice.set(null);
  }

  private fail(err: unknown): void {
    this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.actionFailed'));
  }
}
