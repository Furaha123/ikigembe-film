import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import {
  AdminPaymentsService, LedgerFilters, LedgerPage, LedgerPurpose, LedgerRow, LedgerStatus,
} from '../../services/admin-payments.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { PaymentDetailDrawerComponent } from './payment-detail-drawer.component';

const PURPOSES: LedgerPurpose[] = ['movie', 'actor_video', 'casting_announcement', 'actor_search'];
const STATUSES: LedgerStatus[] = ['Pending', 'Completed', 'Failed', 'Refunded'];

/** Reads the ledger filters from the URL (unknown values are ignored). */
export function filtersFromParams(params: ParamMap): LedgerFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = params.get(key) as T | null;
    return value && allowed.includes(value) ? value : '';
  };
  const date = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(params.get(key) ?? '') ? params.get(key)! : '');
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').trim(),
    purpose: pick('purpose', PURPOSES),
    status: pick('status', STATUSES),
    gateway: pick('gateway', ['pawapay', 'dpo', 'demo'] as const),
    refund: pick('refund', ['in_progress', 'partial', 'refunded', 'any'] as const),
    unresolved: params.get('unresolved') === '1',
    date_from: date('date_from'),
    date_to: date('date_to'),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/**
 * Payments ledger: every purpose, server-side filters and pagination (state kept in the URL),
 * CSV export of the same filters, and a detail drawer for re-checks and refunds.
 */
@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AdminSectionTabsComponent, PaymentDetailDrawerComponent],
  templateUrl: './admin-payments.component.html',
  styleUrl: './admin-payments.component.scss',
})
export class AdminPaymentsComponent implements OnInit {
  private readonly payments = inject(AdminPaymentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly purposes = PURPOSES;
  readonly statuses = STATUSES;

  filters: LedgerFilters = {};
  data = signal<LedgerPage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  exporting = signal(false);
  selectedId = signal<number | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.filters = filtersFromParams(params);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.payments.ledger({ ...this.filters, page_size: 25 }).subscribe({
      next: (page) => { this.data.set(page); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.loadFailed'));
      },
    });
  }

  /** Apply the form: the URL is the source of truth (shareable, survives reloads). */
  search(page = 1): void {
    const f = { ...this.filters, page };
    const queryParams: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(f)) {
      queryParams[k] = v === '' || v === false || v === undefined || (k === 'page' && v === 1) ? null : v === true ? '1' : String(v);
    }
    this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  reset(): void {
    this.filters = {};
    this.search();
  }

  showUnresolved(): void {
    this.filters = { unresolved: true };
    this.search();
  }

  export(): void {
    if (this.exporting() || !isPlatformBrowser(this.platformId)) return;
    this.exporting.set(true);
    this.payments.exportCsv(this.filters).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.exportFailed'));
      },
    });
  }

  open(row: LedgerRow): void {
    this.selectedId.set(row.id);
  }

  /** The drawer changed something (refund, re-check): refresh the list behind it. */
  onChanged(): void {
    this.load();
  }

  statusClass(status: LedgerStatus): string {
    return `status-badge status-${status.toLowerCase()}`;
  }
}
