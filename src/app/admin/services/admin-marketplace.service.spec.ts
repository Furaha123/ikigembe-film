import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminMarketplaceService } from './admin-marketplace.service';
import { marketplaceUser, provideMarketplaceUser } from '../../shared/testing/marketplace-session';

const BASE = `${environment.apiUrl}/marketplace/admin`;

describe('AdminMarketplaceService', () => {
  let service: AdminMarketplaceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideMarketplaceUser(marketplaceUser('Admin'))] });
    service = TestBed.inject(AdminMarketplaceService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists talent videos (default: live ones)', () => {
    service.listActorVideos().subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/actor-videos/`);
    expect(req.request.params.get('status')).toBe('approved');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ page: 1, results: [], total_results: 0, total_pages: 0 });
  });

  it('removes videos, with an optional reason', () => {
    service.removeVideo(4).subscribe();
    service.removeVideo(5, 'Copyright').subscribe();

    expect(http.expectOne(`${BASE}/actor-videos/4/remove/`).request.body).toEqual({});
    expect(http.expectOne(`${BASE}/actor-videos/5/remove/`).request.body).toEqual({ reason: 'Copyright' });
  });

  it('surfaces 400 { reason } when a removal reason is missing', () => {
    let err: HttpErrorResponse | undefined;
    service.removeCastingCall(7, '').subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/casting-calls/7/remove/`).flush({ reason: 'A removal reason is required.' }, { status: 400, statusText: 'Bad Request' });
    expect(err?.status).toBe(400);
    expect(err?.error).toEqual({ reason: 'A removal reason is required.' });
  });

  it('lists casting calls, omitting an empty status filter', () => {
    service.listCastingCalls('', 2).subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/casting-calls/`);
    expect(req.request.params.has('status')).toBeFalse();
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ page: 2, results: [], total_results: 0, total_pages: 0 });

    service.listCastingCalls('published').subscribe();
    expect(http.expectOne(r => r.url === `${BASE}/casting-calls/`).request.params.get('status')).toBe('published');
  });

  it('removes a casting call with a reason', () => {
    service.removeCastingCall(7, 'Spam').subscribe();
    expect(http.expectOne(`${BASE}/casting-calls/7/remove/`).request.body).toEqual({ reason: 'Spam' });
  });

  it('lists members with only the filters that are set, and exports them without paging', () => {
    service.listMembers({ q: 'aline', plan: 'actor', status: '', page: 2 }).subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/members/`);
    expect(req.request.params.keys().sort()).toEqual(['page', 'plan', 'q']);
    req.flush({ page: 2, page_size: 25, total_results: 0, total_pages: 0, active: {}, results: [] });

    service.exportMembers({ plan: 'producer_full', page: 3 }).subscribe();
    const csv = http.expectOne(r => r.url === `${BASE}/members/export/`);
    expect(csv.request.params.keys()).toEqual(['plan']);
    expect(csv.request.responseType).toBe('blob');
    csv.flush(new Blob(['x']));
  });
});
