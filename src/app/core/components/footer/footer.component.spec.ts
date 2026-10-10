import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { FooterComponent, toFooterLinks } from './footer.component';
import { CmsService } from '../../services/cms.service';
import { AuthService } from '../../services/auth.service';

describe('FooterComponent CMS links', () => {
  it('maps known slugs to their routes, others to /pages/<slug>, and hides -rw variants', () => {
    expect(toFooterLinks([
      { slug: 'terms', title: 'Terms', updated_at: '' },
      { slug: 'terms-rw', title: 'Amategeko', updated_at: '' },
      { slug: 'faq', title: 'FAQ', updated_at: '' },
    ])).toEqual([
      { title: 'Terms', route: '/terms' },
      { title: 'FAQ', route: '/pages/faq' },
    ]);
  });

  const setup = (platform: 'browser' | 'server', loggedIn = false) => {
    const cms = jasmine.createSpyObj<CmsService>('CmsService', ['listPages']);
    cms.listPages.and.returnValue(of([{ slug: 'about', title: 'About us', updated_at: '' }]));
    TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: CmsService, useValue: cms }, { provide: PLATFORM_ID, useValue: platform },
        { provide: AuthService, useValue: { isLoggedIn: signal(loggedIn) } }],
    });
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    return { fixture, cms };
  };

  it('renders links from GET /api/pages/ in the browser', () => {
    const { fixture } = setup('browser');
    const link = [...fixture.nativeElement.querySelectorAll('a')].find((a: HTMLAnchorElement) => a.textContent === 'About us') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/about');
  });

  it('keeps the terms fallback and skips the request during SSR/prerender', () => {
    const { fixture, cms } = setup('server');
    expect(cms.listPages).not.toHaveBeenCalled();
    // No loader in tests, so the pipe renders the fallback link's translation key.
    expect(fixture.nativeElement.textContent).toContain('footer.termsFallback');
  });

  const hrefs = (fixture: { nativeElement: HTMLElement }) =>
    [...fixture.nativeElement.querySelectorAll('a')].map(a => a.getAttribute('href'));

  it('lists the creator links for guests, with sign-up as the way to publish films', () => {
    const { fixture } = setup('server');
    expect(hrefs(fixture)).toEqual(jasmine.arrayContaining(['/films', '/producers', '/actors-casting', '/register']));
    expect(hrefs(fixture)).not.toContain('/browse');
  });

  it('drops the sign-up link for signed-in accounts', () => {
    const { fixture } = setup('server', true);
    expect(hrefs(fixture)).toContain('/actors-casting');
    expect(hrefs(fixture)).not.toContain('/register');
  });
});
