import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminMarketplaceService } from './admin-marketplace.service';

const BASE = `${environment.apiUrl}/marketplace/admin`;

describe('AdminMarketplaceService', () => {
  let service: AdminMarketplaceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminMarketplaceService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists the moderation queue (default pending_review)', () => {
    service.listActorVideos().subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/actor-videos/`);
    expect(req.request.params.get('status')).toBe('pending_review');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ page: 1, results: [], total_results: 0, total_pages: 0 });
  });

  it('approves, rejects (with reason) and removes videos', () => {
    service.approveVideo(4).subscribe();
    service.rejectVideo(4, 'Poor audio').subscribe();
    service.removeVideo(4).subscribe();
    service.removeVideo(5, 'Copyright').subscribe();

    expect(http.expectOne(`${BASE}/actor-videos/4/approve/`).request.body).toEqual({});
    expect(http.expectOne(`${BASE}/actor-videos/4/reject/`).request.body).toEqual({ reason: 'Poor audio' });
    expect(http.expectOne(`${BASE}/actor-videos/4/remove/`).request.body).toEqual({});
    expect(http.expectOne(`${BASE}/actor-videos/5/remove/`).request.body).toEqual({ reason: 'Copyright' });
  });

  it('surfaces 400 { reason } when a reject reason is missing', () => {
    let err: HttpErrorResponse | undefined;
    service.rejectVideo(4, '').subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/actor-videos/4/reject/`).flush({ reason: 'A rejection reason is required.' }, { status: 400, statusText: 'Bad Request' });
    expect(err?.status).toBe(400);
    expect(err?.error).toEqual({ reason: 'A rejection reason is required.' });
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
});
