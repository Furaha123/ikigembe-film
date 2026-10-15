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

describe('AdminService — film publication', () => {
  let service: AdminService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/admin/dashboard`;
  const result = {
    id: 7, lifecycle_status: 'scheduled', approval_status: 'approved', is_active: true,
    release_at: '2030-11-01T18:00:00Z', detail: 'ok',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('filters submissions by lifecycle status only when one is chosen', () => {
    const empty = (page: number) => ({ page, total_results: 0, total_pages: 1, submissions: [] });
    service.getFilmSubmissions(2, 'scheduled').subscribe();
    http.expectOne(`${base}/films/submissions/?page=2&lifecycle=scheduled`).flush(empty(2));
    service.getFilmSubmissions().subscribe();
    http.expectOne(`${base}/films/submissions/?page=1`).flush(empty(1));
  });

  it('POSTs schedule with release_at, publish with an empty body, unpublish with the reason', () => {
    service.scheduleFilm(7, '2030-11-01T20:00:00+02:00').subscribe();
    const schedule = http.expectOne(`${base}/movies/7/schedule/`);
    expect(schedule.request.method).toBe('POST');
    expect(schedule.request.body).toEqual({ release_at: '2030-11-01T20:00:00+02:00' });
    schedule.flush(result);

    service.publishFilm(7).subscribe();
    const publish = http.expectOne(`${base}/movies/7/publish/`);
    expect(publish.request.body).toEqual({});
    publish.flush({ ...result, lifecycle_status: 'published' });

    service.unpublishFilm(7, 'Rights dispute').subscribe();
    const unpublish = http.expectOne(`${base}/movies/7/unpublish/`);
    expect(unpublish.request.body).toEqual({ reason: 'Rights dispute' });
    unpublish.flush({ ...result, lifecycle_status: 'unpublished', is_active: false });
  });
});
