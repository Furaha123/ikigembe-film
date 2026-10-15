import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminOpsService } from './admin-ops.service';

const BASE = `${environment.apiUrl}/admin/dashboard`;

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminOpsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('GETs the diagnostics', () => {
    service.getDiagnostics().subscribe(d => expect(d.version).toBe('abc123'));
    const req = http.expectOne(`${BASE}/diagnostics/`);
    expect(req.request.method).toBe('GET');
    req.flush({ version: 'abc123' });
  });

  it('POSTs run-now for a job', () => {
    service.runJob('send_outbox').subscribe(r => expect(r.run.status).toBe('succeeded'));
    const req = http.expectOne(`${BASE}/jobs/send_outbox/run/`);
    expect(req.request.method).toBe('POST');
    req.flush({ run: { id: 1, name: 'send_outbox', status: 'succeeded' } });
  });

  it('surfaces a job that is already running', () => {
    let err: HttpErrorResponse | undefined;
    service.runJob('reconcile_payments').subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/jobs/reconcile_payments/run/`).flush(
      { error: 'This job is already running.', code: 'job_running', request_id: 'abcdef0123456789' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(err?.status).toBe(409);
    expect(err?.error.code).toBe('job_running');
  });
});
