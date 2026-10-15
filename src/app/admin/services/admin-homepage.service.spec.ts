import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminHomepageService } from './admin-homepage.service';
import { HomepageContent, normalizeSections } from '../../shared/models/homepage.interface';

const CONTENT: HomepageContent = {
  hero_title: '', hero_description: '', featured_movie_id: null, cta_label: '', cta_link: '', sections: normalizeSections(null),
};

const BASE = `${environment.apiUrl}/admin/dashboard/cms/homepage`;

describe('AdminHomepageService', () => {
  let service: AdminHomepageService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminHomepageService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads, saves, discards and publishes the draft', () => {
    const body: HomepageContent = { ...CONTENT, hero_title: 'Hi' };
    service.getState().subscribe();
    service.saveDraft(body).subscribe();
    service.discardDraft().subscribe();
    service.publish().subscribe();

    expect(http.expectOne(r => r.method === 'GET' && r.url === `${BASE}/`)).toBeTruthy();
    expect(http.expectOne(r => r.method === 'PUT' && r.url === `${BASE}/draft/`).request.body).toEqual(body);
    expect(http.expectOne(r => r.method === 'DELETE' && r.url === `${BASE}/draft/`)).toBeTruthy();
    expect(http.expectOne(r => r.method === 'POST' && r.url === `${BASE}/publish/`)).toBeTruthy();
  });

  it('uploads the hero image as multipart and removes it', () => {
    const file = new File(['img'], 'hero.jpg', { type: 'image/jpeg' });
    service.uploadHeroImage(file).subscribe();
    service.removeHeroImage().subscribe();
    const up = http.expectOne(r => r.method === 'POST' && r.url === `${BASE}/draft/hero-image/`);
    expect(up.request.body instanceof FormData).toBeTrue();
    expect((up.request.body as FormData).get('image')).toBe(file);
    expect(http.expectOne(r => r.method === 'DELETE' && r.url === `${BASE}/draft/hero-image/`)).toBeTruthy();
  });

  it('surfaces field errors', () => {
    let err: HttpErrorResponse | undefined;
    service.saveDraft({ ...CONTENT, cta_label: 'Go', cta_link: 'javascript:x' }).subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/draft/`).flush({ cta_link: ['Only app pages…'] }, { status: 400, statusText: 'Bad Request' });
    expect(err?.error).toEqual({ cta_link: ['Only app pages…'] });
  });
});
