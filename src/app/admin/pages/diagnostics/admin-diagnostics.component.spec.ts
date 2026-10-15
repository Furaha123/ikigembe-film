import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { Diagnostics } from '../../services/admin-ops.service';
import { AdminDiagnosticsComponent } from './admin-diagnostics.component';

const BASE = `${environment.apiUrl}/admin/dashboard`;

function diagnostics(overrides: Partial<Diagnostics> = {}): Diagnostics {
  return {
    generated_at: '2026-10-14T10:00:00Z',
    version: 'abc123',
    jobs: [{
      name: 'send_outbox', description: 'Send queued email.', interval_seconds: 300, running: false,
      last_run: {
        id: 7, status: 'failed', attempts: 2, triggered_by: 'tick', started_at: '2026-10-14T09:55:00Z',
        finished_at: '2026-10-14T09:55:01Z', duration_ms: 900, error: 'SMTPException: refused', summary: {},
      },
      last_error: 'SMTPException: refused', last_error_at: '2026-10-14T09:55:00Z',
      next_due_at: '2026-10-14T10:00:00Z', due: true,
    }],
    recent_runs: [],
    outbox: { pending: 3, sent: 10, failed: 1 },
    payments: { pending_older_than_minutes: 30, pending_stale: 2 },
    transcodes: { processing: 0, stuck: 0, failed: 1 },
    flags: {
      debug: false, payment_demo_mode: true, payment_gateway: 'pawapay', payment_provider_configured: false,
      payout_provider: 'manual', email_backend: 'resend', email_delivery: 'captured',
      enforce_single_device_view: true, private_bucket_configured: true, hls_encryption: false,
      playback_watermark: false, shared_cache: true, ops_tick_configured: true, opportunistic_tick: false,
    },
    ...overrides,
  };
}

describe('AdminDiagnosticsComponent', () => {
  let fixture: ComponentFixture<AdminDiagnosticsComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminDiagnosticsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    fixture = TestBed.createComponent(AdminDiagnosticsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('shows jobs, counts and the last error', () => {
    http.expectOne(`${BASE}/diagnostics/`).flush(diagnostics());
    fixture.detectChanges();
    expect(text()).toContain('send_outbox');
    expect(text()).toContain('SMTPException: refused');
    expect(text()).toContain('pending');
  });

  it('runs a job and reloads', () => {
    http.expectOne(`${BASE}/diagnostics/`).flush(diagnostics());
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('td button') as HTMLButtonElement;
    button.click();
    const run = http.expectOne(`${BASE}/jobs/send_outbox/run/`);
    expect(run.request.method).toBe('POST');
    run.flush({ run: { ...diagnostics().jobs[0].last_run, name: 'send_outbox', status: 'succeeded' } });
    http.expectOne(`${BASE}/diagnostics/`).flush(diagnostics());
    expect(fixture.componentInstance.runMessage()?.ok).toBeTrue();
  });

  it('shows the support reference when loading fails', () => {
    http.expectOne(`${BASE}/diagnostics/`).flush(
      { error: 'Something went wrong on our side. Please try again.', code: 'server_error', request_id: 'abcdef0123456789' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();
    expect(text()).toContain('Something went wrong');
    expect(text()).toContain('abcdef0123456789');
  });

  it('does not start a second run while one is in flight', () => {
    http.expectOne(`${BASE}/diagnostics/`).flush(diagnostics());
    fixture.componentInstance.runNow('send_outbox');
    fixture.componentInstance.runNow('send_outbox');
    http.expectOne(`${BASE}/jobs/send_outbox/run/`).flush(
      { error: 'This job is already running.', code: 'job_running' }, { status: 409, statusText: 'Conflict' },
    );
    expect(fixture.componentInstance.runMessage()?.ok).toBeFalse();
  });
});
