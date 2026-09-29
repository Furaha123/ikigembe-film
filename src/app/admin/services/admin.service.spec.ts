import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminService } from './admin.service';

const URL = `${environment.apiUrl}/admin/dashboard/movies/12/revenue-shares/`;

describe('AdminService — revenue shares', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('GETs the split history', () => {
    const body = { movie_id: 12, default_producer_percentage: 70, current: null, shares: [] };
    service.getRevenueShares(12).subscribe(res => expect(res).toEqual(body));
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush(body);
  });

  it('POSTs a new split', () => {
    const payload = {
      producer_percentage: 80, platform_percentage: 15,
      other_parties: [{ name: 'Rwanda Film Office', percentage: 5 }],
      notes: 'Clause 4.2',
    };
    service.createRevenueShare(12, payload).subscribe();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 1, ...payload }, { status: 201, statusText: 'Created' });
  });

  it('surfaces the backend rejection of a retroactive split', () => {
    let err: HttpErrorResponse | undefined;
    service.createRevenueShare(12, { producer_percentage: 80, platform_percentage: 20 }).subscribe({ error: e => (err = e) });
    http.expectOne(URL).flush(
      { error: 'Completed payments already exist on or after effective_from; a split cannot be applied retroactively to booked earnings.' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(err?.status).toBe(400);
    expect(err?.error.error).toContain('retroactively');
  });
});
