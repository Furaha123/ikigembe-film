import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { NavigationStart, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { SeoService } from './seo.service';

describe('SeoService navigation metadata', () => {
  let seo: SeoService;
  let doc: Document;
  let events: Subject<NavigationStart>;
  let router: { url: string; events: Subject<NavigationStart> };

  beforeEach(() => {
    events = new Subject();
    router = { url: '/preview/12', events };
    TestBed.configureTestingModule({ providers: [
      provideTranslateService(), { provide: Router, useValue: router },
    ] });
    seo = TestBed.inject(SeoService);
    doc = TestBed.inject(DOCUMENT);
  });
  afterEach(() => { seo.removeJsonLd(); events.complete(); });

  it('resets social metadata and canonical on navigation to pages without explicit SEO', () => {
    seo.set({ title: 'Film', description: 'Film description', image: 'https://example.com/film.jpg', type: 'video.movie' });
    events.next(new NavigationStart(2, '/producers?sort=name#list'));
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ikigembe.com/producers');
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Ikigembe');
    expect(doc.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('website');
    expect(doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')).not.toContain('example.com');
  });

  it('keeps protected routes noindex even when a page sets its own metadata', () => {
    for (const path of ['/casting/2', '/actor/profile', '/producer/dashboard', '/admin/dashboard']) {
      router.url = path;
      seo.set({ title: 'Account' });
      expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    }
    router.url = '/producers/2';
    seo.set({ title: 'Studio' });
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow');
  });

  it('does not claim an aggregate rating count or director that the API does not provide', () => {
    seo.setMovieJsonLd({ id: 12, title: 'Film', rating: 8, producer_name: 'Studio' });
    const schema = JSON.parse(doc.getElementById('ld-json')!.textContent!);
    expect(schema.aggregateRating).toBeUndefined();
    expect(schema.director).toBeUndefined();
    events.next(new NavigationStart(2, '/about'));
    expect(doc.getElementById('ld-json')).toBeNull();
  });
});
