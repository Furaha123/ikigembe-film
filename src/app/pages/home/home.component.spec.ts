import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HomeComponent } from './home.component';
import { MovieService } from '../../shared/services/movie.service';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { HomepageService } from '../../core/services/homepage.service';
import { IVideoContent } from '../../shared/models/video-content.interface';
import {
  DEFAULT_HOME_SECTIONS, HomepageView, defaultHomepageView, isSafeHomeLink, normalizeHomepage, normalizeSections,
} from '../../shared/models/homepage.interface';
import { environment } from '../../../environments/environment';

const film = (id: number, over: Partial<IVideoContent> = {}): IVideoContent => ({
  id, title: `Film ${id}`, overview: '', thumbnail_url: `t${id}.jpg`, backdrop_url: `b${id}.jpg`, trailer_url: null,
  video_url: null, price: 1000, rating: 0, release_date: '2026-01-01', views: 0, duration_minutes: 90,
  has_free_preview: false, release_state: 'released', ...over,
});

const page = (results: IVideoContent[]) => ({ page: 1, page_size: 12, total_results: results.length, total_pages: 1, sort: 'newest' as const, results });

describe('homepage model', () => {
  it('normalizes sections: known keys once, missing ones appended with defaults', () => {
    const out = normalizeSections([
      { key: 'coming_soon', visible: true, title: 'Soon' },
      { key: 'raw_html', visible: true },
      { key: 'coming_soon', visible: false },
      'junk',
      { key: 'why', visible: 0 },
    ]);
    expect(out[0]).toEqual({ key: 'coming_soon', visible: true, title: 'Soon' });
    expect(out[1]).toEqual({ key: 'why', visible: false, title: '' });
    expect(out.length).toBe(DEFAULT_HOME_SECTIONS.length);
    expect(out.map(s => s.key).sort()).toEqual(DEFAULT_HOME_SECTIONS.map(s => s.key).sort());
    expect(normalizeSections(null)).toEqual(DEFAULT_HOME_SECTIONS.map(s => ({ ...s })));
  });

  it('defaults reproduce today\'s layout', () => {
    const d = defaultHomepageView();
    expect(d.sections.filter(s => s.visible).map(s => s.key)).toEqual(
      ['new_releases', 'most_watched', 'ad_home_hero', 'genres', 'coming_soon', 'ad_home_banner', 'why', 'join_cta']);
    expect(d.featured).toBeNull();
    expect(d.hero_title).toBe('');
  });

  it('drops an unsafe button link', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', 'http://x.test', '/admin', '/films?x=1', ' /films']) {
      expect(isSafeHomeLink(bad)).withContext(bad).toBeFalse();
      expect(normalizeHomepage({ cta_label: 'Go', cta_link: bad }).cta_link).toBe('');
    }
    for (const ok of ['/films', '/movie/12', '/pages/about-us', '/', 'https://ikigembe.rw/x']) {
      expect(isSafeHomeLink(ok)).withContext(ok).toBeTrue();
    }
    expect(normalizeHomepage({ cta_label: '', cta_link: '/films' }).cta_link).toBe('');
  });

  it('treats garbage as the defaults', () => {
    expect(normalizeHomepage(null)).toEqual(defaultHomepageView());
    expect(normalizeHomepage({ hero_title: 5 as unknown as string }).hero_title).toBe('');
  });
});

describe('HomepageService', () => {
  it('falls back to the defaults on an error', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    let got: HomepageView | undefined;
    TestBed.inject(HomepageService).getPublished().subscribe(v => (got = v));
    http.expectOne(`${environment.apiUrl}/homepage/`).flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(got).toEqual(defaultHomepageView());
    http.verify();
  });

  it('normalizes the published configuration', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    let got: HomepageView | undefined;
    TestBed.inject(HomepageService).getPublished().subscribe(v => (got = v));
    http.expectOne(`${environment.apiUrl}/homepage/`).flush({
      published: true, hero_title: 'Hi', sections: [{ key: 'genres', visible: true, title: '' }],
    });
    expect(got?.published).toBeTrue();
    expect(got?.sections[0].key).toBe('genres');
    http.verify();
  });
});

describe('HomeComponent configuration', () => {
  let movies: jasmine.SpyObj<MovieService>;
  let homepage: jasmine.SpyObj<HomepageService>;
  const loggedIn = signal(false);

  function create(config: Partial<HomepageView> | 'error' = {}) {
    homepage.getPublished.and.returnValue(config === 'error' ? of(defaultHomepageView()) : of(normalizeHomepage({ ...config })));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.componentInstance.ngOnInit();
    return fixture;
  }

  beforeEach(() => {
    loggedIn.set(false);
    movies = jasmine.createSpyObj<MovieService>('MovieService', ['getFeatured', 'getCatalog', 'getGenres']);
    movies.getFeatured.and.returnValue(of({ result: film(1) }));
    movies.getCatalog.and.returnValue(of(page([film(2)])));
    movies.getGenres.and.returnValue(of({ results: [{ name: 'Drama', count: 2 }], languages: [] }));
    homepage = jasmine.createSpyObj<HomepageService>('HomepageService', ['getPublished']);
    TestBed.configureTestingModule({
      providers: [
        { provide: MovieService, useValue: movies },
        { provide: HomepageService, useValue: homepage },
        { provide: AuthService, useValue: { isLoggedIn: loggedIn } },
        { provide: SeoService, useValue: jasmine.createSpyObj('SeoService', ['setTranslated']) },
      ],
    });
    TestBed.overrideComponent(HomeComponent, { set: { template: '', imports: [] } });
  });

  it('uses today\'s layout and the automatic featured film when nothing is published', () => {
    const c = create('error').componentInstance;
    expect(c.loading()).toBeFalse();
    expect(c.heroFilm()?.id).toBe(1);
    expect(c.customCta()).toBeNull();
    expect(c.visibleSections().map(s => s.key)).toEqual(
      ['new_releases', 'most_watched', 'ad_home_hero', 'genres', 'coming_soon', 'ad_home_banner', 'why', 'join_cta']);
  });

  it('respects the published order and visibility; guest-only sections hidden for viewers', () => {
    const c = create({
      sections: [
        { key: 'coming_soon', visible: true, title: 'Next' },
        { key: 'why', visible: true, title: '' },
        { key: 'new_releases', visible: false, title: '' },
        { key: 'actors_casting', visible: true, title: '' },
      ],
    }).componentInstance;
    const keys = c.visibleSections().map(s => s.key);
    expect(keys.slice(0, 3)).toEqual(['coming_soon', 'why', 'actors_casting']);
    expect(keys).not.toContain('new_releases');
    loggedIn.set(true);
    expect(c.visibleSections().map(s => s.key)).not.toContain('why');
  });

  it('prefers the configured film and image, and marks a coming-soon film', () => {
    const c = create({
      featured: film(7, { release_state: 'coming_soon' }), featured_movie_id: 7, hero_image_url: 'hero.jpg',
      cta_label: 'Browse', cta_link: '/films',
    }).componentInstance;
    expect(c.heroFilm()?.id).toBe(7);
    expect(c.heroComingSoon()).toBeTrue();
    expect(c.heroBackground()).toBe('hero.jpg');
    expect(c.customCta()).toEqual({ label: 'Browse', link: '/films', internal: true });
  });

  it('falls back to the automatic film when the configured one is no longer listed', () => {
    const c = create({ featured: null, featured_movie_id: 9 }).componentInstance;
    expect(c.heroFilm()?.id).toBe(1);
    expect(c.heroBackground()).toBe('b1.jpg');
  });

  it('renders a preview draft without loading the published configuration', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const draft = { ...defaultHomepageView(), hero_title: 'Draft', sections: normalizeSections([{ key: 'genres', visible: true }]) };
    fixture.componentRef.setInput('preview', draft);
    fixture.componentRef.setInput('previewAsGuest', false);
    fixture.componentInstance.ngOnInit();
    const c = fixture.componentInstance;
    expect(homepage.getPublished).not.toHaveBeenCalled();
    expect(c.view().hero_title).toBe('Draft');
    expect(c.guest()).toBeFalse();
    expect(c.visibleSections()[0].key).toBe('genres');
  });

  it('keeps the catalog error handling: total outage only when every list fails', () => {
    movies.getFeatured.and.returnValue(throwError(() => new Error('x')));
    movies.getCatalog.and.returnValue(throwError(() => new Error('x')));
    expect(create().componentInstance.failed()).toBeTrue();
  });
});
