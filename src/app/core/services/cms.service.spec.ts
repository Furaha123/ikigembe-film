import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { CmsService } from './cms.service';
import { CmsPage } from '../../shared/models/cms.interface';

const BASE = `${environment.apiUrl}/pages`;
const page = (slug: string): CmsPage => ({ slug, title: slug, body: '<p>x</p>', updated_at: '2026-09-01T00:00:00Z' });
const notFound = { status: 404, statusText: 'Not Found' };

describe('CmsService', () => {
  let service: CmsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CmsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists published pages', () => {
    service.listPages().subscribe(list => expect(list.length).toBe(1));
    const req = http.expectOne(`${BASE}/`);
    expect(req.request.method).toBe('GET');
    req.flush([{ slug: 'terms', title: 'Terms', updated_at: '' }]);
  });

  it('gets a page by slug', () => {
    service.getPage('terms').subscribe(p => expect(p.slug).toBe('terms'));
    http.expectOne(`${BASE}/terms/`).flush(page('terms'));
  });

  it('English requests the base slug only', () => {
    service.getLocalizedPage('terms', 'en').subscribe(p => expect(p.slug).toBe('terms'));
    http.expectOne(`${BASE}/terms/`).flush(page('terms'));
  });

  it('Kinyarwanda prefers <slug>-rw', () => {
    service.getLocalizedPage('terms', 'rw').subscribe(p => expect(p.slug).toBe('terms-rw'));
    http.expectOne(`${BASE}/terms-rw/`).flush(page('terms-rw'));
  });

  it('Kinyarwanda falls back to <slug> when <slug>-rw is 404', () => {
    let result: CmsPage | undefined;
    service.getLocalizedPage('terms', 'rw').subscribe(p => (result = p));
    http.expectOne(`${BASE}/terms-rw/`).flush({ error: 'Page not found' }, notFound);
    http.expectOne(`${BASE}/terms/`).flush(page('terms'));
    expect(result?.slug).toBe('terms');
  });

  it('does not fall back on non-404 errors', () => {
    let err: HttpErrorResponse | undefined;
    service.getLocalizedPage('terms', 'rw').subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/terms-rw/`).flush({}, { status: 500, statusText: 'Server Error' });
    http.expectNone(`${BASE}/terms/`);
    expect(err?.status).toBe(500);
  });

  it('surfaces 404 when neither page exists', () => {
    let err: HttpErrorResponse | undefined;
    service.getLocalizedPage('about', 'rw').subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/about-rw/`).flush({ error: 'Page not found' }, notFound);
    http.expectOne(`${BASE}/about/`).flush({ error: 'Page not found' }, notFound);
    expect(err?.status).toBe(404);
  });
});
