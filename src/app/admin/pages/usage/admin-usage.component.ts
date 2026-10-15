import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AdminUsageService, UsageAllowance, UsageBilling, UsageKind, UsageMetric, UsagePanel, UsageProvider,
} from '../../services/admin-usage.service';
import { apiErrorMessage, apiErrorReference } from '../../../shared/utils/api-error';
import { ErrorReferenceComponent } from '../../../shared/components/error-reference/error-reference.component';

interface UiMessage { ok: boolean; text: string; ref: string | null }

/** Editable copy of one allowance row (form state only). */
interface AllowanceDraft {
  metric: string;
  allowance: string;
  price: string;
  price_per: string;
  currency: string;
  as_of: string;
  source: string;
}

interface BitrateDraft { name: string; kbps: number | null; hint: number | null }

const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Hosting-usage estimates (Render, Supabase, Cloudflare R2) for admins: the latest stored snapshot, what is
 * measured / estimated / unknown, and the allowances, prices and bitrates the admin enters. Estimates only —
 * never presented as provider invoices.
 */
@Component({
  selector: 'app-admin-usage',
  standalone: true,
  imports: [DatePipe, FormsModule, TranslatePipe, ErrorReferenceComponent],
  templateUrl: './admin-usage.component.html',
  styleUrls: ['../payments/admin-payments.component.scss', './admin-usage.component.scss'],
})
export class AdminUsageComponent implements OnInit {
  private readonly api = inject(AdminUsageService);
  private readonly translate = inject(TranslateService);

  readonly data = signal<UsagePanel | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<UiMessage | null>(null);
  readonly refreshing = signal(false);
  readonly refreshMessage = signal<UiMessage | null>(null);
  readonly saving = signal(false);
  readonly saveMessage = signal<UiMessage | null>(null);

  // Settings form state.
  threshold = 80;
  bitrates: BitrateDraft[] = [];
  newRendition = '';
  allowances: AllowanceDraft[] = [];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.get().subscribe({
      next: panel => { this.apply(panel); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set({ ok: false, ref: apiErrorReference(err),
          text: apiErrorMessage(err) ?? this.translate.instant('admin.usage.loadFailed') });
      },
    });
  }

  refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.refreshMessage.set(null);
    this.api.refresh().subscribe({
      next: panel => {
        this.refreshing.set(false);
        this.data.set(panel);
        const ok = panel.run.status === 'succeeded';
        this.refreshMessage.set({ ok, ref: null, text: ok
          ? this.translate.instant('admin.usage.refreshed')
          : this.translate.instant('admin.usage.refreshFailed', { error: panel.run.error }) });
      },
      error: (err: unknown) => {
        this.refreshing.set(false);
        this.refreshMessage.set({ ok: false, ref: apiErrorReference(err),
          text: apiErrorMessage(err) ?? this.translate.instant('admin.usage.refreshError') });
      },
    });
  }

  private apply(panel: UsagePanel): void {
    this.data.set(panel);
    const s = panel.settings;
    this.threshold = s.warning_threshold_percent;
    const names = new Set([...panel.renditions.map(r => r.name), ...Object.keys(s.rendition_bitrates_kbps)]);
    this.bitrates = [...names].map(name => ({
      name,
      kbps: s.rendition_bitrates_kbps[name] ?? null,
      hint: panel.renditions.find(r => r.name === name)?.encoder_target_kbps ?? null,
    }));
    this.allowances = s.allowances.map(a => ({
      metric: a.metric, allowance: a.allowance ?? '', price: a.price ?? '', price_per: a.price_per ?? '',
      currency: a.currency ?? '', as_of: a.as_of, source: a.source,
    }));
  }

  // ── Display helpers ─────────────────────────────────────────────────────

  kindClass(kind: UsageKind): string {
    switch (kind) {
      case 'measured': return 'status-completed';
      case 'estimated': return 'status-pending';
      default: return 'status-unknown';
    }
  }

  formatValue(m: UsageMetric): string {
    if (m.value === null || m.kind === 'unknown') return this.translate.instant('admin.usage.unknown');
    if (m.unit === 'bytes') return this.formatBytes(m.value);
    const n = m.value.toLocaleString('en-US');
    return m.unit === 'count' ? n : `${n} ${this.translate.instant('admin.usage.unit.' + m.unit)}`;
  }

  /** 1 GB = 10^9 bytes, as the panel bills it. */
  formatBytes(bytes: number): string {
    const units: [number, string][] = [[1e12, 'TB'], [1e9, 'GB'], [1e6, 'MB'], [1e3, 'kB']];
    for (const [size, unit] of units) {
      if (bytes >= size) return `${(bytes / size).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;
    }
    return `${bytes} B`;
  }

  billingLabel(b: UsageBilling): string {
    switch (b.status) {
      case 'not_billable': return '—';
      case 'unknown_usage': return this.translate.instant('admin.usage.billing.unknownUsage');
      case 'not_configured': return this.translate.instant('admin.usage.billing.notConfigured');
      default: return this.translate.instant('admin.usage.billing.ofAllowance', {
        usage: b.usage, allowance: b.allowance, unit: b.billing_unit, percent: b.percent_of_allowance ?? '—',
      });
    }
  }

  isWarning(b: UsageBilling): boolean {
    return b.status === 'warning' || b.status === 'over';
  }

  metricLabel(key: string): string {
    return this.data()?.billable_metrics.find(m => m.key === key)?.label ?? key;
  }

  billingUnit(key: string): string {
    return this.data()?.billable_metrics.find(m => m.key === key)?.billing_unit ?? '';
  }

  // ── Settings form ───────────────────────────────────────────────────────

  addAllowance(): void {
    const first = this.data()?.billable_metrics[0]?.key ?? '';
    this.allowances = [...this.allowances, {
      metric: first, allowance: '', price: '', price_per: '', currency: '', as_of: '', source: '',
    }];
  }

  removeAllowance(index: number): void {
    this.allowances = this.allowances.filter((_, i) => i !== index);
  }

  addRendition(): void {
    const name = this.newRendition.trim();
    if (!name || name.length > 20 || this.bitrates.some(b => b.name === name)) return;
    this.bitrates = [...this.bitrates, { name, kbps: null, hint: null }];
    this.newRendition = '';
  }

  /** First problem in the form, or null. Mirrors the API's checks so the admin sees them before saving. */
  formError(): string | null {
    if (!Number.isInteger(this.threshold) || this.threshold < 1 || this.threshold > 100) {
      return this.translate.instant('admin.usage.form.thresholdInvalid');
    }
    for (const b of this.bitrates) {
      if (b.kbps !== null && (!Number.isInteger(b.kbps) || b.kbps < 1)) {
        return this.translate.instant('admin.usage.form.bitrateInvalid', { name: b.name });
      }
    }
    for (const [i, a] of this.allowances.entries()) {
      const row = i + 1;
      if (!a.metric || !a.as_of || !a.source.trim()) return this.translate.instant('admin.usage.form.rowIncomplete', { row });
      if (!a.allowance && !a.price) return this.translate.instant('admin.usage.form.rowEmpty', { row });
      for (const v of [a.allowance, a.price, a.price_per]) {
        if (v && !DECIMAL.test(v.trim())) return this.translate.instant('admin.usage.form.rowNumber', { row });
      }
      if (a.price && !/^[A-Z]{3}$/.test(a.currency.trim())) {
        return this.translate.instant('admin.usage.form.rowCurrency', { row });
      }
    }
    return null;
  }

  save(): void {
    const problem = this.formError();
    if (problem) {
      this.saveMessage.set({ ok: false, text: problem, ref: null });
      return;
    }
    const panel = this.data();
    if (!panel || this.saving()) return;
    const providerOf = (key: string): UsageProvider =>
      panel.billable_metrics.find(m => m.key === key)?.provider ?? 'r2';
    const allowances: UsageAllowance[] = this.allowances.map(a => ({
      provider: providerOf(a.metric), metric: a.metric,
      allowance: a.allowance.trim() || null, price: a.price.trim() || null, price_per: a.price_per.trim() || null,
      currency: a.currency.trim(), as_of: a.as_of, source: a.source.trim(),
    }));
    const rendition_bitrates_kbps: Record<string, number> = {};
    for (const b of this.bitrates) if (b.kbps) rendition_bitrates_kbps[b.name] = b.kbps;
    this.saving.set(true);
    this.saveMessage.set(null);
    this.api.saveSettings({ allowances, rendition_bitrates_kbps, warning_threshold_percent: this.threshold }).subscribe({
      next: updated => {
        this.saving.set(false);
        this.apply(updated);
        this.saveMessage.set({ ok: true, ref: null, text: this.translate.instant('admin.usage.form.saved') });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveMessage.set({ ok: false, ref: apiErrorReference(err),
          text: apiErrorMessage(err) ?? this.translate.instant('admin.usage.form.saveFailed') });
      },
    });
  }
}
