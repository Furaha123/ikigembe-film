import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdsService } from './ads.service';

const BASE = `${environment.apiUrl}/ads`;

describe('AdsService', () => {
  let service: AdsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists live ads for a placement', () => {
    service.list('home_banner').subscribe(list => expect(list.length).toBe(1));
    const req = http.expectOne(r => r.url === `${BASE}/`);
    expect(req.request.params.get('placement')).toBe('home_banner');
    req.flush([{ id: 1, name: 'MTN', creative_url: 'https://cdn/x.jpg', target_url: 'https://mtn.rw', placement: 'home_banner' }]);
  });

  it('turns a failed list request into an empty list', () => {
    let result: unknown;
    service.list('sidebar').subscribe(list => (result = list));
    http.expectOne(r => r.url === `${BASE}/`).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
    expect(result).toEqual([]);
  });

  it('posts impressions and clicks and ignores failures, including 429', () => {
    service.trackImpression(3);
    service.trackClick(3);
    const imp = http.expectOne(`${BASE}/3/impression/`);
    const click = http.expectOne(`${BASE}/3/click/`);
    expect(imp.request.method).toBe('POST');
    expect(click.request.method).toBe('POST');
    expect(() => {
      imp.flush({ error: 'Too many requests.' }, { status: 429, statusText: 'Too Many Requests' });
      click.flush(null, { status: 204, statusText: 'No Content' });
    }).not.toThrow();
  });
});
