import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminEmailOutboxService } from './admin-email-outbox.service';

const BASE = `${environment.apiUrl}/admin/dashboard/email-outbox`;

describe('AdminEmailOutboxService', () => {
  let service: AdminEmailOutboxService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminEmailOutboxService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists with only the filters that are set', () => {
    service.list({ recipient: 'aline', message_type: '', status: 'captured', date_from: '', page: 2, page_size: 25 }).subscribe();
    const req = http.expectOne(r => r.method === 'GET' && r.url === `${BASE}/`);
    expect(req.request.params.keys().sort()).toEqual(['page', 'page_size', 'recipient', 'status']);
    expect(req.request.params.get('status')).toBe('captured');
    req.flush({});
  });

  it('reads one message', () => {
    service.get(7).subscribe();
    const req = http.expectOne(r => r.method === 'GET' && r.url === `${BASE}/7/`);
    expect(req.request.params.keys()).toEqual([]);
    req.flush({});
  });
});
