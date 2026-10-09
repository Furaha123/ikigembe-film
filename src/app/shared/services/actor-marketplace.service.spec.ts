import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ActorMarketplaceService } from './actor-marketplace.service';
import { ActorProfilePayload } from '../models/marketplace.interface';
import { MarketplaceAccessError } from '../../core/access/marketplace-access.service';
import { marketplaceUser, provideMarketplaceUser } from '../testing/marketplace-session';

const BASE = `${environment.apiUrl}/marketplace`;

describe('ActorMarketplaceService', () => {
  let service: ActorMarketplaceService;
  let http: HttpTestingController;

  const expectError = (url: string, method: string, status: number, trigger: (onErr: (e: HttpErrorResponse) => void) => void) => {
    let err: HttpErrorResponse | undefined;
    trigger(e => (err = e));
    const req = http.expectOne(r => r.url === url && r.method === method);
    req.flush({ error: `status ${status}` }, { status, statusText: 'Error' });
    expect(err?.status).toBe(status);
    expect(err?.error).toEqual({ error: `status ${status}` });
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideMarketplaceUser(marketplaceUser('Viewer'))] });
    service = TestBed.inject(ActorMarketplaceService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('profile', () => {
    it('GETs profile/', () => {
      service.getProfile().subscribe();
      const req = http.expectOne(`${BASE}/profile/`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('surfaces 404 when there is no profile yet', () => {
      expectError(`${BASE}/profile/`, 'GET', 404, onErr => service.getProfile().subscribe({ error: onErr }));
    });

    it('PUTs the profile payload', () => {
      const payload: ActorProfilePayload = {
        stage_name: 'Aline', bio: '', gender: 'female', location: 'Kigali', languages: ['rw', 'en'],
        skills: ['drama'], contact_email: 'a@b.rw', contact_phone: '0788', is_listed: true, date_of_birth: '2000-01-01',
      };
      service.saveProfile(payload).subscribe();
      const req = http.expectOne(`${BASE}/profile/`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(payload);
      req.flush(payload, { status: 201, statusText: 'Created' });
    });
  });

  describe('talent videos', () => {
    it('lists my videos', () => {
      service.getMyVideos().subscribe();
      const req = http.expectOne(`${BASE}/actor-videos/`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('purchases a video slot', () => {
      service.purchaseVideo({ title: 'Monologue', phone_number: '0788123456' }).subscribe(res => expect(res.actor_video_id).toBe(9));
      const req = http.expectOne(`${BASE}/actor-videos/purchase/`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'Monologue', phone_number: '0788123456' });
      req.flush({ deposit_id: 'd', status: 'Pending', message: '', amount: 5000, currency: 'RWF', actor_video_id: 9 }, { status: 202, statusText: 'Accepted' });
    });

    for (const status of [400, 409, 503]) {
      it(`purchase surfaces ${status}`, () => {
        expectError(`${BASE}/actor-videos/purchase/`, 'POST', status,
          onErr => service.purchaseVideo({ title: 't', phone_number: '0788' }).subscribe({ error: onErr }));
      });
    }

    it('binds the multipart upload endpoints to the video id', () => {
      const api = service.videoUploadApi(9);
      const file = new File(['x'], 'reel.mp4', { type: 'video/mp4' });
      api.initiate(file).subscribe();
      api.signPart('u', 'k', 1).subscribe();
      api.complete('u', 'k', [{ PartNumber: 1, ETag: 'e' }]).subscribe();
      api.abort('u', 'k').subscribe();

      const init = http.expectOne(`${BASE}/actor-videos/9/upload/initiate/`);
      expect(init.request.body).toEqual({ file_name: 'reel.mp4', file_type: 'video/mp4', file_size: jasmine.any(Number) });
      init.flush({ upload_id: 'u', file_key: 'k' });
      expect(http.expectOne(`${BASE}/actor-videos/9/upload/sign-part/`).request.body).toEqual({ upload_id: 'u', file_key: 'k', part_number: 1 });
      expect(http.expectOne(`${BASE}/actor-videos/9/upload/complete/`).request.body).toEqual({ upload_id: 'u', file_key: 'k', parts: [{ PartNumber: 1, ETag: 'e' }] });
      expect(http.expectOne(`${BASE}/actor-videos/9/upload/abort/`).request.body).toEqual({ upload_id: 'u', file_key: 'k' });
    });

    for (const status of [402, 409]) {
      it(`upload initiate surfaces ${status}`, () => {
        expectError(`${BASE}/actor-videos/9/upload/initiate/`, 'POST', status,
          onErr => service.videoUploadApi(9).initiate(new File(['x'], 'a.mp4', { type: 'video/mp4' })).subscribe({ error: onErr }));
      });
    }
  });

  describe('casting', () => {
    it('lists open calls with a page param', () => {
      service.getCastingCalls(2).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/casting-calls/`);
      expect(req.request.params.get('page')).toBe('2');
      req.flush({ page: 2, results: [], total_results: 0, total_pages: 0 });
    });

    it('gets a call', () => {
      service.getCastingCall(4).subscribe();
      const req = http.expectOne(`${BASE}/casting-calls/4/`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('applies with note and video ids', () => {
      service.apply(4, { note: 'Hi', video_ids: [1, 2] }).subscribe();
      const req = http.expectOne(`${BASE}/casting-calls/4/apply/`);
      expect(req.request.body).toEqual({ note: 'Hi', video_ids: [1, 2] });
      req.flush({}, { status: 201, statusText: 'Created' });
    });

    for (const status of [404, 409]) {
      it(`apply surfaces ${status}`, () => {
        expectError(`${BASE}/casting-calls/4/apply/`, 'POST', status,
          onErr => service.apply(4, { video_ids: [] }).subscribe({ error: onErr }));
      });
    }

    it('lists my applications', () => {
      service.getMyApplications().subscribe();
      const req = http.expectOne(`${BASE}/applications/mine/`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('access', () => {
    it('sends no actor-only request for a producer', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideMarketplaceUser(marketplaceUser('Producer'))] });
      service = TestBed.inject(ActorMarketplaceService);
      http = TestBed.inject(HttpTestingController);
      spyOn(console, 'warn');

      const errors: unknown[] = [];
      const onErr = { error: (e: unknown) => errors.push(e) };
      service.getProfile().subscribe(onErr);
      service.getMyVideos().subscribe(onErr);
      service.getMyApplications().subscribe(onErr);
      service.apply(1, { video_ids: [] }).subscribe(onErr);

      http.expectNone(() => true);
      expect(errors.length).toBe(4);
      expect(errors.every(e => e instanceof MarketplaceAccessError)).toBeTrue();
    });

    it('lets a producer browse published casting calls', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideMarketplaceUser(marketplaceUser('Producer'))] });
      service = TestBed.inject(ActorMarketplaceService);
      http = TestBed.inject(HttpTestingController);
      service.getCastingCall(4).subscribe();
      http.expectOne(`${BASE}/casting-calls/4/`).flush({});
    });
  });
});
