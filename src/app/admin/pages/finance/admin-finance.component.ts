import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { AdminFinanceService, AllocationParty, FinancePeriod, Statement } from '../../services/admin-finance.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';

const PARTIES: AllocationParty[] = ['tax', 'operations', 'producer', 'partner', 'platform'];

/**
 * Monthly revenue periods: preview the allocation while open, close once (then it never changes),
 * export allocations, and record producer payouts (no money is moved from here).
 */
@Component({
  selector: 'app-admin-finance',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-finance.component.html',
  styleUrl: '../payments/admin-payments.component.scss',
})
export class AdminFinanceComponent implements OnInit {
  private readonly api = inject(AdminFinanceService);
  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly parties = PARTIES;
  periods = signal<FinancePeriod[]>([]);
  selected = signal<FinancePeriod | null>(null);
  statements = signal<Statement[]>([]);
  loading = signal(true);
  detailLoading = signal(false);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);
  busy = signal(false);
  confirmClose = signal(false);
  month = this.defaultMonth();
  payoutFor = signal<number | null>(null);
  payoutRef = '';

  /** Totals per party for the selected period (from its allocations or preview). */
  readonly partyTotals = computed(() => {
    const totals: Record<string, number> = {};
    for (const a of this.selected()?.allocations ?? []) totals[a.party] = (totals[a.party] ?? 0) + a.amount;
    return totals;
  });

  ngOnInit(): void {
    this.loadPeriods();
  }

  loadPeriods(selectId?: number): void {
    this.loading.set(true);
    this.api.periods().subscribe({
      next: ({ results }) => {
        this.periods.set(results);
        this.loading.set(false);
        const target = selectId ?? results[0]?.id;
        if (target) this.select(target);
      },
      error: (err: unknown) => { this.loading.set(false); this.fail(err); },
    });
  }

  select(id: number): void {
    this.detailLoading.set(true);
    this.confirmClose.set(false);
    this.error.set(null);
    this.api.period(id).subscribe({
      next: (p) => { this.selected.set(p); this.detailLoading.set(false); this.loadStatements(p); },
      error: (err: unknown) => { this.detailLoading.set(false); this.fail(err); },
    });
  }

  openMonth(): void {
    if (!/^\d{4}-\d{2}$/.test(this.month)) { this.error.set(this.translate.instant('admin.finance.monthFormat')); return; }
    this.api.openPeriod(this.month).subscribe({
      next: (p) => this.loadPeriods(p.id),
      error: (err: unknown) => this.fail(err),
    });
  }

  close(): void {
    const p = this.selected();
    if (!p || this.busy()) return;
    this.busy.set(true);
    this.api.close(p.id).subscribe({
      next: (closed) => {
        this.busy.set(false);
        this.confirmClose.set(false);
        this.notice.set(this.translate.instant('admin.finance.closed', { label: closed.label }));
        this.loadPeriods(closed.id);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const issues = (err as { error?: { issues?: string[] } })?.error?.issues;
        if (issues?.length) this.selected.update(s => s ? { ...s, issues } : s);
        this.fail(err);
      },
    });
  }

  downloadCsv(): void {
    const p = this.selected();
    if (!p || !isPlatformBrowser(this.platformId)) return;
    this.api.allocationsCsv(p.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `allocations-${p.label}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  recordPayout(s: Statement): void {
    if (!this.payoutRef.trim()) { this.error.set(this.translate.instant('admin.payments.referenceRequired')); return; }
    this.api.recordPayout(s.id, this.payoutRef.trim()).subscribe({
      next: (updated) => {
        this.statements.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.payoutFor.set(null);
        this.payoutRef = '';
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  private loadStatements(p: FinancePeriod): void {
    if (p.status !== 'closed') { this.statements.set([]); return; }
    this.api.statements(p.label).subscribe({ next: ({ results }) => this.statements.set(results), error: () => this.statements.set([]) });
  }

  private fail(err: unknown): void {
    this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.actionFailed'));
  }

  private defaultMonth(): string {
    const d = new Date();
    d.setDate(0);   // last day of the previous month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
