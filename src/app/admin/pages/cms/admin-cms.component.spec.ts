import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AdminCmsAdsComponent, endsAfterStarts } from './admin-cms-ads.component';
import { AdminCmsPagesComponent, SLUG_PATTERN } from './admin-cms-pages.component';
import { AdminCmsService } from '../../services/admin-cms.service';
import { AdminAd } from '../../../shared/models/cms.interface';

const AD: AdminAd = {
  id: 4, name: 'MTN MoMo', creative_url: 'https://cdn.test/momo.jpg', target_url: 'https://mtn.rw', placement: 'home_banner',
  starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-31T00:00:00Z', is_active: true, priority: 5,
  impressions: 2000, clicks: 50, click_through_rate: 0.025, created_at: '', updated_at: '',
};

describe('CMS validators', () => {
  it('slug: lowercase letters, numbers, single hyphens', () => {
    for (const ok of ['terms', 'privacy-rw', 'faq-2026']) expect(SLUG_PATTERN.test(ok)).withContext(ok).toBeTrue();
    for (const bad of ['Terms', 'privacy_rw', '-terms', 'terms-', 'a--b', 'a b']) expect(SLUG_PATTERN.test(bad)).withContext(bad).toBeFalse();
  });

  it('endsAfterStarts', () => {
    const g = (s: string, e: string) => new FormGroup({ starts_at: new FormControl(s), ends_at: new FormControl(e) });
    expect(endsAfterStarts(g('2026-10-01T00:00', '2026-10-02T00:00'))).toBeNull();
    expect(endsAfterStarts(g('2026-10-02T00:00', '2026-10-01T00:00'))).toEqual({ endsBeforeStart: true });
    expect(endsAfterStarts(g('2026-10-01T00:00', '2026-10-01T00:00'))).toEqual({ endsBeforeStart: true });
    expect(endsAfterStarts(g('', ''))).toBeNull();
  });
});

describe('Admin CMS screens', () => {
  let cms: jasmine.SpyObj<AdminCmsService>;

  beforeEach(() => {
    cms = jasmine.createSpyObj<AdminCmsService>('AdminCmsService', [
      'listPages', 'createPage', 'updatePage', 'deletePage', 'listAds', 'createAd', 'updateAd', 'deleteAd',
    ]);
    cms.listPages.and.returnValue(of([]));
    cms.listAds.and.returnValue(of([AD]));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminCmsService, useValue: cms }],
    });
  });

  describe('pages', () => {
    let fixture: ComponentFixture<AdminCmsPagesComponent>;
    let c: AdminCmsPagesComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AdminCmsPagesComponent);
      c = fixture.componentInstance;
      fixture.detectChanges();
      c.openNew();
      fixture.detectChanges();
    });

    it('rejects an invalid slug client-side', () => {
      c.form.setValue({ slug: 'Terms Page', title: 'Terms', body: '', is_published: true });
      c.save();
      expect(cms.createPage).not.toHaveBeenCalled();
    });

    it('preview renders with the same component as the public page (sanitized)', () => {
      c.form.setValue({ slug: 'about', title: 'About', body: '<h2>Hi</h2><script>x()</script>', is_published: false });
      c.preview.set(true);
      fixture.detectChanges();
      const preview = fixture.nativeElement.querySelector('.cms-preview app-cms-page-body') as HTMLElement;
      expect(preview.querySelector('h1')?.textContent).toContain('About');
      expect(preview.querySelector('.cms-body h2')?.textContent).toBe('Hi');
      expect(preview.querySelector('script')).toBeNull();
    });

    it('creates a page and shows DRF field errors', () => {
      cms.createPage.and.returnValue(throwError(() => new HttpErrorResponse({
        status: 400, error: { slug: ['cms page with this slug already exists.'] },
      })));
      c.form.setValue({ slug: 'terms', title: 'Terms', body: '<p>x</p>', is_published: true });
      c.save();
      fixture.detectChanges();
      expect(cms.createPage).toHaveBeenCalledOnceWith({ slug: 'terms', title: 'Terms', body: '<p>x</p>', is_published: true });
      expect(fixture.nativeElement.textContent).toContain('already exists');
    });
  });

  describe('ads', () => {
    let fixture: ComponentFixture<AdminCmsAdsComponent>;
    let c: AdminCmsAdsComponent;
    const valid = { name: 'MTN', target_url: 'https://mtn.rw', placement: 'sidebar' as const, starts_at: '2026-10-01T09:00', ends_at: '2026-10-31T09:00', is_active: true, priority: 1 };

    beforeEach(() => {
      fixture = TestBed.createComponent(AdminCmsAdsComponent);
      c = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('lists campaigns with impressions, clicks and CTR', () => {
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('MTN MoMo');
      expect(text).toContain('2,000');
      expect(fixture.nativeElement.querySelector('.ctr').textContent).toContain('2.5%');
    });

    it('blocks ends_at <= starts_at client-side', () => {
      c.openNew();
      c.creative.set(new File(['i'], 'a.png', { type: 'image/png' }));
      c.form.setValue({ ...valid, ends_at: '2026-09-01T09:00' });
      c.save();
      fixture.detectChanges();
      expect(cms.createAd).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('admin.cms.endsAfterStarts');
    });

    it('requires a creative image on create', () => {
      c.openNew();
      c.form.setValue(valid);
      c.save();
      expect(cms.createAd).not.toHaveBeenCalled();
      expect(c.creativeError()).toBe('admin.cms.creativeRequired');
    });

    it('creates with the multipart payload (ISO dates + file)', () => {
      cms.createAd.and.returnValue(of(AD));
      c.openNew();
      const file = new File(['i'], 'a.png', { type: 'image/png' });
      c.creative.set(file);
      c.form.setValue(valid);
      c.save();
      expect(cms.createAd).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        name: 'MTN', placement: 'sidebar', creative: file,
        starts_at: new Date('2026-10-01T09:00').toISOString(),
        ends_at: new Date('2026-10-31T09:00').toISOString(),
      }));
      expect(cms.listAds).toHaveBeenCalledTimes(2);
    });

    it('editing keeps the existing creative when no new file is chosen', () => {
      cms.updateAd.and.returnValue(of(AD));
      c.edit(AD);
      c.save();
      expect(cms.updateAd).toHaveBeenCalledOnceWith(4, jasmine.objectContaining({ creative: null }));
    });
  });
});
