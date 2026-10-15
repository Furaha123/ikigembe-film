import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminUsageService } from './admin-usage.service';

const BASE = `${environment.apiUrl}/admin/dashboard/usage`;

describe('AdminUsageService', () => {
  let service: AdminUsageService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminUsageService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('GETs the panel', () => {
    service.get().subscribe(p => expect(p.stale).toBeTrue());
    const req = http.expectOne(`${BASE}/`);
    expect(req.request.method).toBe('GET');
    req.flush({ stale: true });
  });

  it('PUTs the settings', () => {
    const body = { allowances: [], rendition_bitrates_kbps: { '720p': 2900 }, warning_threshold_percent: 80 };
    service.saveSettings(body).subscribe();
    const req = http.expectOne(`${BASE}/settings/`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('POSTs a refresh', () => {
    service.refresh().subscribe(r => expect(r.run.status).toBe('succeeded'));
    const req = http.expectOne(`${BASE}/refresh/`);
    expect(req.request.method).toBe('POST');
    req.flush({ run: { status: 'succeeded' } });
  });
});
