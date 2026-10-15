import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AdminHomepageComponent, moveSection } from './admin-homepage.component';
import { AdminHomepageService } from '../../services/admin-homepage.service';
import { MovieService } from '../../../shared/services/movie.service';
import {
  DEFAULT_HOME_SECTIONS, HomepageAdminState, HomepageVersion, defaultHomepageView,
} from '../../../shared/models/homepage.interface';

function state(over: Partial<HomepageVersion> = {}): HomepageAdminState {
  const base = defaultHomepageView();
  const draft: HomepageVersion = {
    ...base, id: 1, status: 'draft', featured_listed: false, updated_at: '', updated_by: null,
    published_at: null, published_by: null, ...over,
  };
  return {
    draft, published: null, defaults: base, history: [],
    limits: { hero_title: 80, hero_description: 280, cta_label: 40, cta_link: 300, section_title: 60, hero_image_bytes: 5242880 },
  };
}

describe('AdminHomepageComponent', () => {
  let api: jasmine.SpyObj<AdminHomepageService>;

  function create() {
    const fixture = TestBed.createComponent(AdminHomepageComponent);
    fixture.componentInstance.ngOnInit();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<AdminHomepageService>('AdminHomepageService',
      ['getState', 'saveDraft', 'discardDraft', 'uploadHeroImage', 'removeHeroImage', 'publish']);
    api.getState.and.returnValue(of(state({ hero_title: 'Saved' })));
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminHomepageService, useValue: api },
        { provide: MovieService, useValue: jasmine.createSpyObj('MovieService', ['getCatalog']) },
      ],
    });
    TestBed.overrideComponent(AdminHomepageComponent, { set: { template: '', imports: [] } });
  });

  it('moves sections up and down within bounds', () => {
    const list = DEFAULT_HOME_SECTIONS.map(s => ({ ...s }));
    expect(moveSection(list, 1, -1).map(s => s.key).slice(0, 2)).toEqual(['most_watched', 'new_releases']);
    expect(moveSection(list, 0, -1)).toEqual(list);
    expect(moveSection(list, list.length - 1, 1)).toEqual(list);
  });

  it('loads the draft into the form and the preview without marking it dirty', () => {
    const c = create();
    expect(c.form.controls.hero_title.value).toBe('Saved');
    expect(c.previewView().hero_title).toBe('Saved');
    expect(c.hasUnsavedChanges()).toBeFalse();
    c.toggleSection(0, false);
    expect(c.hasUnsavedChanges()).toBeTrue();
    expect(c.previewView().sections[0].visible).toBeFalse();
  });

  it('refuses an unsafe link locally', () => {
    const c = create();
    c.form.patchValue({ cta_label: 'Go', cta_link: 'javascript:alert(1)' });
    c.save();
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(c.saveError()).toBe('admin.homepage.fixErrors');
    expect(c.previewView().cta_link).toBe('');
  });

  it('saves unsaved edits before publishing', () => {
    api.saveDraft.and.returnValue(of(state({ hero_title: 'New' })));
    api.publish.and.returnValue(of(state({ hero_title: 'New' })));
    const c = create();
    c.form.patchValue({ hero_title: 'New' });
    c.publish();
    expect(api.saveDraft).toHaveBeenCalledWith(jasmine.objectContaining({ hero_title: 'New' }));
    expect(api.publish).toHaveBeenCalled();
    expect(c.message()).toBe('admin.homepage.published');
    expect(c.hasUnsavedChanges()).toBeFalse();
  });

  it('shows API field errors', () => {
    api.saveDraft.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { featured_movie_id: ['Choose a film that is published in the catalogue.'] },
    })));
    const c = create();
    c.save();
    expect(c.fieldErrs()['featured_movie_id']).toContain('published');
    expect(c.saveError()).toBe('admin.homepage.fixErrors');
  });

  it('checks the hero image type and size before uploading', () => {
    const c = create();
    const pick = (file: File) => c.onImage({ target: { files: [file], value: '' } } as unknown as Event);
    pick(new File(['x'], 'hero.gif', { type: 'image/gif' }));
    expect(c.imageError()).toBe('admin.homepage.imageType');
    const big = new File(['x'], 'hero.jpg');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    pick(big);
    expect(c.imageError()).toBe('admin.homepage.imageSize');
    expect(api.uploadHeroImage).not.toHaveBeenCalled();
  });
});
