import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { UsageMetric, UsagePanel } from '../../services/admin-usage.service';
import { AdminUsageComponent } from './admin-usage.component';

const BASE = `${environment.apiUrl}/admin/dashboard/usage`;

function metric(overrides: Partial<UsageMetric>): UsageMetric {
  return {
    key: 'r2.uploads', label: 'Uploads completed this period', unit: 'count', value: 3, kind: 'measured',
    source: 'Model creation timestamps', notes: '', billing: { status: 'not_billable' }, ...overrides,
  };
}

function panel(overrides: Partial<UsagePanel> = {}): UsagePanel {
  return {
    snapshot: {
      id: 1, computed_at: '2026-10-14T10:00:00Z', period_start: '2026-09-30T22:00:00Z',
      period_end: '2026-10-31T22:00:00Z', age_seconds: 60, measurement: { heads: 12, pending: 3, errors: 0 },
    },
    stale: false, stale_after_seconds: 129600, refreshing: false, last_run: null,
    providers: [{
      provider: 'r2', label: 'Cloudflare R2 (storage)', metrics: [
        metric({
          key: 'r2.stream_delivery', label: 'Film streaming delivered from R2', unit: 'bytes', value: null,
          kind: 'unknown', notes: 'Set the rendition bitrates to estimate it.',
          billing: { status: 'unknown_usage', billing_unit: 'GB', billable: null },
        }),
        metric({
          key: 'r2.storage', label: 'Stored data', unit: 'bytes', value: 12_500_000_000, kind: 'estimated',
          billing: {
            status: 'over', billing_unit: 'GB-month', usage: '12.5', allowance: '10', billable: '2.5',
            percent_of_allowance: '125', warning: true, estimated_cost: '0.04', currency: 'USD',
            entry: {
              provider: 'r2', metric: 'r2.storage', allowance: '10', price: '0.015', price_per: null,
              currency: 'USD', as_of: '2026-10-01', source: 'R2 pricing page',
            },
          },
        }),
        metric({
          key: 'r2.class_b_ops', label: 'Class B operations', unit: 'requests', value: 100, kind: 'estimated',
          billing: { status: 'not_configured', billing_unit: 'requests', billable: null },
        }),
        metric({}),
      ],
    }],
    settings: { allowances: [], rendition_bitrates_kbps: {}, warning_threshold_percent: 80 },
    billable_metrics: [{ key: 'r2.storage', provider: 'r2', label: 'Stored data', billing_unit: 'GB-month' }],
    renditions: [{ name: '720p', encoder_target_kbps: 2928 }],
    gb_bytes: 1e9,
    ...overrides,
  };
}

describe('AdminUsageComponent', () => {
  let fixture: ComponentFixture<AdminUsageComponent>;
  let component: AdminUsageComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminUsageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    fixture = TestBed.createComponent(AdminUsageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  function loaded(p = panel()): void {
    http.expectOne(`${BASE}/`).flush(p);
    fixture.detectChanges();
  }

  it('always shows the estimates banner', () => {
    loaded();
    expect(el().querySelector('.estimate-banner')).not.toBeNull();
    expect(text()).toContain('admin.usage.bannerTitle');
  });

  it('shows unknown values as unknown, never zero', () => {
    loaded();
    const [unknown, , notConfigured] = panel().providers[0].metrics;
    expect(component.formatValue(unknown)).toBe('admin.usage.unknown');
    expect(component.billingLabel(unknown.billing)).toBe('admin.usage.billing.unknownUsage');
    expect(component.billingLabel(notConfigured.billing)).toBe('admin.usage.billing.notConfigured');
    const badges = Array.from(el().querySelectorAll('.status-badge')).map(b => b.textContent?.trim());
    expect(badges).toContain('admin.usage.kinds.unknown');
    expect(badges).toContain('admin.usage.kinds.estimated');
    expect(badges).toContain('admin.usage.kinds.measured');
  });

  it('formats bytes in decimal GB and flags rows over the allowance', () => {
    loaded();
    expect(component.formatBytes(12_500_000_000)).toBe('12.5 GB');
    expect(el().querySelectorAll('tr.row-warning').length).toBe(1);
    expect(text()).toContain('admin.usage.billing.over');
    expect(text()).toContain('admin.usage.billing.asOf');
  });

  it('warns when there is no snapshot yet', () => {
    loaded(panel({ snapshot: null, stale: true }));
    expect(text()).toContain('admin.usage.noSnapshot');
  });

  it('refreshes through the API and shows the new panel', () => {
    loaded();
    component.refresh();
    const req = http.expectOne(`${BASE}/refresh/`);
    expect(req.request.method).toBe('POST');
    req.flush({ ...panel(), run: { status: 'succeeded', error: '' } });
    expect(component.refreshMessage()?.ok).toBeTrue();
  });

  it('shows a refresh refused while one is running', () => {
    loaded();
    component.refresh();
    http.expectOne(`${BASE}/refresh/`).flush(
      { error: 'A refresh is already running.', code: 'job_running' }, { status: 409, statusText: 'Conflict' });
    expect(component.refreshMessage()?.ok).toBeFalse();
    expect(component.refreshMessage()?.text).toContain('already running');
  });

  it('validates the settings before saving', () => {
    loaded();
    component.addAllowance();
    component.save();
    expect(component.saveMessage()?.text).toBe('admin.usage.form.rowIncomplete');
    http.expectNone(`${BASE}/settings/`);
  });

  it('saves allowances with their date and source, and only the bitrates that are set', () => {
    loaded();
    expect(component.bitrates.map(b => b.name)).toEqual(['720p']);
    component.bitrates[0].kbps = 2900;
    component.threshold = 75;
    component.addAllowance();
    Object.assign(component.allowances[0], {
      allowance: '10', price: '0.015', currency: 'USD', as_of: '2026-10-01', source: 'R2 pricing page',
    });
    component.save();
    const req = http.expectOne(`${BASE}/settings/`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      allowances: [{
        provider: 'r2', metric: 'r2.storage', allowance: '10', price: '0.015', price_per: null,
        currency: 'USD', as_of: '2026-10-01', source: 'R2 pricing page',
      }],
      rendition_bitrates_kbps: { '720p': 2900 },
      warning_threshold_percent: 75,
    });
    req.flush(panel());
    expect(component.saveMessage()?.ok).toBeTrue();
  });
});
