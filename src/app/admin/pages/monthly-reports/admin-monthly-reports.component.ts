import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { AdminFinanceService, MonthlyReport, MonthlyReportSummary } from '../../services/admin-finance.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';

/**
 * Monthly reports: frozen snapshots (revenue and refunds from the ledger, views, users, films,
 * actor uploads, producer services) with CSV and PDF downloads. Last month is generated automatically.
 */
@Component({
  selector: 'app-admin-monthly-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-monthly-reports.component.html',
  styleUrl: '../payments/admin-payments.component.scss',
})
export class AdminMonthlyReportsComponent implements OnInit {
  private readonly api = inject(AdminFinanceService);
  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  history = signal<MonthlyReportSummary[]>([]);
  selected = signal<MonthlyReport | null>(null);
  loading = signal(true);
  detailLoading = signal(false);
  generating = signal(false);
  downloading = signal<'csv' | 'pdf' | null>(null);
  error = signal<string | null>(null);
  month = this.defaultMonth();

  ngOnInit(): void {
    this.load();
  }

  load(selectId?: number): void {
    this.loading.set(true);
    this.api.reports().subscribe({
      next: ({ results }) => {
        this.history.set(results);
        this.loading.set(false);
        const target = selectId ?? results[0]?.id;
        if (target) this.select(target);
      },
      error: (err: unknown) => { this.loading.set(false); this.fail(err); },
    });
  }

  select(id: number): void {
    if (this.selected()?.id === id) return;
    this.detailLoading.set(true);
    this.error.set(null);
    this.api.report(id).subscribe({
      next: (r) => { this.selected.set(r); this.detailLoading.set(false); },
      error: (err: unknown) => { this.detailLoading.set(false); this.fail(err); },
    });
  }

  generate(): void {
    if (!/^\d{4}-\d{2}$/.test(this.month)) { this.error.set(this.translate.instant('admin.finance.monthFormat')); return; }
    if (this.generating()) return;
    this.generating.set(true);
    this.error.set(null);
    this.api.generateReport(this.month).subscribe({
      next: (r) => { this.generating.set(false); this.selected.set(r); this.load(r.id); },
      error: (err: unknown) => { this.generating.set(false); this.fail(err); },
    });
  }

  download(format: 'csv' | 'pdf'): void {
    const r = this.selected();
    if (!r || !isPlatformBrowser(this.platformId) || this.downloading()) return;
    this.downloading.set(format);
    this.api.reportFile(r.id, format).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ikigembe-report-${r.month}-${r.id}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: unknown) => { this.downloading.set(null); this.fail(err); },
    });
  }

  entries(record: Record<string, number>): { key: string; value: number }[] {
    return Object.entries(record).map(([key, value]) => ({ key, value }));
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
