import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CmsPageComponent, summarize } from './cms-page.component';
import { CmsService } from '../../core/services/cms.service';
import { AppLang, LanguageService } from '../../core/services/language.service';
import { CmsPage } from '../../shared/models/cms.interface';

const page = (over: Partial<CmsPage> = {}): CmsPage => ({
  slug: 'about', title: 'About Ikigembe', body: '<h2>Who we are</h2><p>Films from Rwanda.</p>',
  updated_at: '2026-09-01T00:00:00Z', ...over,
});

describe('summarize', () => {
  it('strips tags and truncates for the meta description', () => {
    expect(summarize('<h2>A</h2><p>b&nbsp;c</p>')).toBe('A b c');
    expect(summarize('<p>' + 'x'.repeat(300) + '</p>', 20).length).toBe(20);
  });
});

describe('CmsPageComponent', () => {
  let cms: jasmine.SpyObj<CmsService>;
  let lang: ReturnType<typeof signal<AppLang>>;
  let harness: RouterTestingHarness;

  const el = () => harness.routeNativeElement as HTMLElement;
  const open = async (url: string) => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
  };

  beforeEach(() => {
    cms = jasmine.createSpyObj<CmsService>('CmsService', ['getLocalizedPage']);
    lang = signal<AppLang>('en');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'about', data: { slug: 'about' }, component: CmsPageComponent },
          { path: 'terms', data: { slug: 'terms' }, component: CmsPageComponent },
          { path: 'pages/:slug', component: CmsPageComponent },
        ]),
        provideTranslateService(),
        { provide: CmsService, useValue: cms },
        { provide: LanguageService, useValue: { currentLang: lang } },
      ],
    });
  });

  it('loads the page for the route slug and sets the document title', async () => {
    cms.getLocalizedPage.and.returnValue(of(page()));
    await open('/about');

    expect(cms.getLocalizedPage).toHaveBeenCalledWith('about', 'en');
    expect(el().querySelector('h1')?.textContent).toContain('About Ikigembe');
    expect(el().querySelector('.cms-body h2')?.textContent).toBe('Who we are');
    expect(TestBed.inject(Title).getTitle()).toContain('About Ikigembe');
  });

  it('reads the slug from /pages/:slug', async () => {
    cms.getLocalizedPage.and.returnValue(of(page({ slug: 'faq', title: 'FAQ' })));
    await open('/pages/faq');
    expect(cms.getLocalizedPage).toHaveBeenCalledWith('faq', 'en');
  });

  it('renders the body through Angular\'s sanitizer (scripts and handlers stripped)', async () => {
    cms.getLocalizedPage.and.returnValue(of(page({
      body: '<p class="ok">Safe</p><script>window.__pwned = true</script><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="window.__pwned = true"><a href="javascript:alert(1)">x</a>',
    })));
    await open('/about');

    const body = el().querySelector('.cms-body')!;
    expect(body.querySelector('p.ok')?.textContent).toBe('Safe');
    expect(body.querySelector('script')).toBeNull();
    expect(body.querySelector('img')?.hasAttribute('onerror')).toBeFalse();
    expect(body.querySelector('a')?.getAttribute('href')).not.toMatch(/^javascript:/); // neutralised as unsafe:
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('re-fetches in the new language when it changes (rw → <slug>-rw lookup)', async () => {
    cms.getLocalizedPage.and.returnValue(of(page()));
    await open('/about');
    lang.set('rw');
    harness.detectChanges();
    expect(cms.getLocalizedPage).toHaveBeenCalledWith('about', 'rw');
  });

  it('terms: falls back to the built-in terms text on 404', async () => {
    cms.getLocalizedPage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    await open('/terms');
    expect(el().querySelector('app-terms')).not.toBeNull();
    expect(el().textContent).toContain('Acceptance of Terms');
  });

  it('terms: also falls back when the API is unreachable (never a blank legal page)', async () => {
    cms.getLocalizedPage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await open('/terms');
    expect(el().querySelector('app-terms')).not.toBeNull();
  });

  it('other slugs: shows a not-available message on 404', async () => {
    cms.getLocalizedPage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    await open('/about');
    expect(el().querySelector('app-terms')).toBeNull();
    expect(el().textContent).toContain('cms.notFoundTitle');
  });
});
