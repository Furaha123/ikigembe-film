import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminCmsService, toAdFormData } from './admin-cms.service';
import { AdminAdPayload } from '../../shared/models/cms.interface';

const BASE = `${environment.apiUrl}/admin/dashboard/cms`;

const adPayload = (over: Partial<AdminAdPayload> = {}): AdminAdPayload => ({
  name: 'MTN MoMo', target_url: 'https://mtn.rw', placement: 'home_banner',
  starts_at: '2026-10-01T00:00:00.000Z', ends_at: '2026-10-31T00:00:00.000Z',
  is_active: true, priority: 5, creative: new File(['img'], 'momo.jpg', { type: 'image/jpeg' }),
  ...over,
});

describe('AdminCmsService', () => {
  let service: AdminCmsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminCmsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('pages', () => {
    it('lists, gets, creates, patches and deletes', () => {
      const payload = { slug: 'terms', title: 'Terms', body: '<p>x</p>', is_published: true };
      service.listPages().subscribe();
      service.getPage(3).subscribe();
      service.createPage(payload).subscribe();
      service.updatePage(3, { is_published: false }).subscribe();
      service.deletePage(3).subscribe();

      expect(http.expectOne(r => r.method === 'GET' && r.url === `${BASE}/pages/`)).toBeTruthy();
      expect(http.expectOne(r => r.method === 'GET' && r.url === `${BASE}/pages/3/`)).toBeTruthy();
      expect(http.expectOne(r => r.method === 'POST' && r.url === `${BASE}/pages/`).request.body).toEqual(payload);
      expect(http.expectOne(r => r.method === 'PATCH' && r.url === `${BASE}/pages/3/`).request.body).toEqual({ is_published: false });
      expect(http.expectOne(r => r.method === 'DELETE' && r.url === `${BASE}/pages/3/`)).toBeTruthy();
    });

    it('surfaces a taken slug as a field error', () => {
      let err: HttpErrorResponse | undefined;
      service.createPage({ slug: 'terms', title: 't', body: '', is_published: false }).subscribe({ error: e => (err = e) });
      http.expectOne(`${BASE}/pages/`).flush({ slug: ['cms page with this slug already exists.'] }, { status: 400, statusText: 'Bad Request' });
      expect(err?.error).toEqual({ slug: ['cms page with this slug already exists.'] });
    });
  });

  describe('ads', () => {
    it('creates with a multipart/form-data body including the creative file', () => {
      service.createAd(adPayload()).subscribe();
      const req = http.expectOne(`${BASE}/ads/`);
      expect(req.request.method).toBe('POST');
      const body = req.request.body as FormData;
      expect(body instanceof FormData).toBeTrue();
      expect(body.get('name')).toBe('MTN MoMo');
      expect(body.get('placement')).toBe('home_banner');
      expect(body.get('is_active')).toBe('true');
      expect(body.get('priority')).toBe('5');
      expect((body.get('creative') as File).name).toBe('momo.jpg');
    });

    it('updates without re-sending the creative when none was chosen', () => {
      service.updateAd(4, adPayload({ creative: null })).subscribe();
      const req = http.expectOne(`${BASE}/ads/4/`);
      expect(req.request.method).toBe('PATCH');
      expect((req.request.body as FormData).has('creative')).toBeFalse();
    });

    it('lists and deletes', () => {
      service.listAds().subscribe();
      service.deleteAd(4).subscribe();
      expect(http.expectOne(r => r.method === 'GET' && r.url === `${BASE}/ads/`)).toBeTruthy();
      expect(http.expectOne(r => r.method === 'DELETE' && r.url === `${BASE}/ads/4/`)).toBeTruthy();
    });

    it('toAdFormData sends every field as a string', () => {
      const fd = toAdFormData(adPayload({ is_active: false, priority: 0 }));
      expect(fd.get('is_active')).toBe('false');
      expect(fd.get('priority')).toBe('0');
      expect(fd.get('starts_at')).toBe('2026-10-01T00:00:00.000Z');
    });
  });
});
