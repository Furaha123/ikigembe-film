import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { CastingService } from './casting.service';

const BASE = `${environment.apiUrl}/marketplace`;

describe('CastingService', () => {
  let service: CastingService;
  let http: HttpTestingController;

  const errorFor = (status: number, url: string, run: (onErr: (e: HttpErrorResponse) => void) => void) => {
    let err: HttpErrorResponse | undefined;
    run(e => (err = e));
    http.expectOne(r => r.url === url).flush({ error: 'x' }, { status, statusText: 'Error' });
    expect(err?.status).toBe(status);
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CastingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('casting calls', () => {
    const payload = { title: 'Lead', description: 'Drama', roles: ['Mother'], deadline_at: '2030-01-01T00:00:00.000Z' };

    it('creates a draft', () => {
      service.createCall(payload).subscribe();
      const req = http.expectOne(`${BASE}/casting-calls/`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({}, { status: 201, statusText: 'Created' });
    });

    it('lists mine', () => {
      service.getMyCalls().subscribe();
      const req = http.expectOne(`${BASE}/casting-calls/mine/`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('patches a draft; 409 when not a draft', () => {
      service.updateCall(3, { title: 'New' }).subscribe();
      const req = http.expectOne(`${BASE}/casting-calls/3/`);
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      errorFor(409, `${BASE}/casting-calls/3/`, onErr => service.updateCall(3, { title: 'x' }).subscribe({ error: onErr }));
    });

    it('purchases (publishes) with the phone number', () => {
      service.purchaseCall(3, '0788123456').subscribe();
      const req = http.expectOne(`${BASE}/casting-calls/3/purchase/`);
      expect(req.request.body).toEqual({ phone_number: '0788123456' });
      req.flush({ deposit_id: 'd', status: 'Pending', message: '', amount: 1, currency: 'RWF', casting_call_id: 3 }, { status: 202, statusText: 'Accepted' });
    });

    for (const status of [400, 409, 503]) {
      it(`purchase surfaces ${status}`, () => {
        errorFor(status, `${BASE}/casting-calls/3/purchase/`, onErr => service.purchaseCall(3, '07').subscribe({ error: onErr }));
      });
    }

    it('closes a call', () => {
      service.closeCall(3).subscribe();
      expect(http.expectOne(`${BASE}/casting-calls/3/close/`).request.method).toBe('POST');
    });

    it('lists applications and updates a status', () => {
      service.getApplications(3).subscribe();
      http.expectOne(`${BASE}/casting-calls/3/applications/`).flush([]);
      service.setApplicationStatus(8, 'shortlisted').subscribe();
      const req = http.expectOne(`${BASE}/applications/8/`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'shortlisted' });
      req.flush({});
    });
  });

  describe('actor directory', () => {
    it('purchases a search pass; 409 pending, 503 unpriced', () => {
      service.purchaseSearch('0788123456').subscribe();
      expect(http.expectOne(`${BASE}/actor-search/purchase/`).request.body).toEqual({ phone_number: '0788123456' });
      errorFor(409, `${BASE}/actor-search/purchase/`, onErr => service.purchaseSearch('07').subscribe({ error: onErr }));
      errorFor(503, `${BASE}/actor-search/purchase/`, onErr => service.purchaseSearch('07').subscribe({ error: onErr }));
    });

    it('reads access', () => {
      service.getSearchAccess().subscribe(a => expect(a).toEqual({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
      http.expectOne(`${BASE}/actor-search/access/`).flush({ active: true, expires_at: '2030-01-01T00:00:00Z' });
    });

    it('sends only the filters that are set', () => {
      service.searchActors({ q: 'ali', gender: '', min_age: 20, max_age: null, skill: 'dance', page: 2 }).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/actors/`);
      expect(req.request.params.keys().sort()).toEqual(['min_age', 'page', 'q', 'skill']);
      expect(req.request.params.get('min_age')).toBe('20');
      req.flush({ page: 2, results: [], total_results: 0, total_pages: 0 });
    });

    it('403 without an active pass', () => {
      errorFor(403, `${BASE}/actors/`, onErr => service.searchActors().subscribe({ error: onErr }));
      errorFor(403, `${BASE}/actors/5/`, onErr => service.getActor(5).subscribe({ error: onErr }));
      errorFor(403, `${BASE}/shortlist/`, onErr => service.getShortlist().subscribe({ error: onErr }));
    });

    it('shortlist add (409 duplicate) and delete', () => {
      service.addToShortlist(5, 'great').subscribe();
      expect(http.expectOne(`${BASE}/shortlist/`).request.body).toEqual({ actor_id: 5, note: 'great' });
      errorFor(409, `${BASE}/shortlist/`, onErr => service.addToShortlist(5).subscribe({ error: onErr }));
      service.removeFromShortlist(5).subscribe();
      const del = http.expectOne(`${BASE}/shortlist/5/`);
      expect(del.request.method).toBe('DELETE');
      del.flush(null, { status: 204, statusText: 'No Content' });
    });
  });
});
