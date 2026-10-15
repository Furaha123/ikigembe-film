import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subject, Subscription, debounceTime, distinctUntilChanged, of, switchMap, catchError, map } from 'rxjs';
import { AdminHomepageService } from '../../services/admin-homepage.service';
import { MovieService } from '../../../shared/services/movie.service';
import { HomeComponent } from '../../../pages/home/home.component';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { CmsTabsComponent } from '../cms/cms-tabs.component';
import { fieldErrors } from '../cms/admin-cms-pages.component';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { IVideoContent } from '../../../shared/models/video-content.interface';
import {
  HERO_IMAGE_EXTENSIONS, HERO_IMAGE_MAX_BYTES, HOME_SECTION_LABELS, HOME_TEXT_LIMITS, HomeSection, HomepageAdminState,
  HomepageContent, HomepageView, isSafeHomeLink, normalizeSections,
} from '../../../shared/models/homepage.interface';

/** Validator: empty, an allowed app path or an https URL (the API also checks the host). */
function homeLinkValidator(control: { value: string }) {
  const v = (control.value ?? '').trim();
  return !v || isSafeHomeLink(v) ? null : { link: true };
}

/** Moves the item at `index` by `delta` (−1 up, +1 down); out of range = unchanged copy. */
export function moveSection(list: HomeSection[], index: number, delta: number): HomeSection[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const out = [...list];
  [out[index], out[target]] = [out[target], out[index]];
  return out;
}

/**
 * /admin/homepage — edit the home page as a draft (hero texts, featured film, image, button, section order
 * and visibility), preview it with the real home page component, then publish. The draft lives on the server.
 */
@Component({
  selector: 'app-admin-homepage',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, HomeComponent, AdminSectionTabsComponent, CmsTabsComponent],
  templateUrl: './admin-homepage.component.html',
  styleUrls: ['../movies/admin-movies.component.scss', '../cms/admin-cms.scss', './admin-homepage.component.scss'],
})
export class AdminHomepageComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AdminHomepageService);
  private readonly movies = inject(MovieService);

  readonly limits = HOME_TEXT_LIMITS;
  readonly labels = HOME_SECTION_LABELS;
  readonly imageAccept = HERO_IMAGE_EXTENSIONS.join(',');

  state = signal<HomepageAdminState | null>(null);
  loading = signal(true);
  loadError = signal<string | null>(null);
  busy = signal<'save' | 'publish' | 'discard' | 'image' | null>(null);
  message = signal<string | null>(null);
  saveError = signal<string | null>(null);
  fieldErrs = signal<Record<string, string>>({});
  imageError = signal<string | null>(null);
  confirmDiscard = signal(false);
  dirty = signal(false);

  sections = signal<HomeSection[]>([]);
  featured = signal<IVideoContent | null>(null);
  previewAsGuest = signal(true);

  // Film picker (listed films only: the public catalog, released and coming soon).
  query = signal('');
  results = signal<IVideoContent[]>([]);
  searching = signal(false);
  private readonly search$ = new Subject<string>();
  private searchSub?: Subscription;

  form = this.fb.nonNullable.group({
    hero_title:       ['', [Validators.maxLength(HOME_TEXT_LIMITS.heroTitle)]],
    hero_description: ['', [Validators.maxLength(HOME_TEXT_LIMITS.heroDescription)]],
    cta_label:        ['', [Validators.maxLength(HOME_TEXT_LIMITS.ctaLabel)]],
    cta_link:         ['', [Validators.maxLength(HOME_TEXT_LIMITS.ctaLink), homeLinkValidator]],
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() });

  /** The draft as the home page would render it (fed to <app-home [preview]>). */
  readonly previewView = computed<HomepageView>(() => {
    const v = this.formValue();
    const link = v.cta_link.trim();
    const label = v.cta_label.trim();
    return {
      published: false,
      hero_title: v.hero_title.trim(),
      hero_description: v.hero_description.trim(),
      cta_label: label && isSafeHomeLink(link) ? label : '',
      cta_link: label && isSafeHomeLink(link) ? link : '',
      featured_movie_id: this.featured()?.id ?? null,
      featured: this.featured(),
      hero_image_url: this.state()?.draft.hero_image_url ?? null,
      sections: this.sections(),
    };
  });

  readonly featuredUnlisted = computed(() => {
    const f = this.featured();
    return !!f && f.release_state === 'unavailable';
  });

  ngOnInit(): void {
    this.searchSub = this.search$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) return of([] as IVideoContent[]);
        this.searching.set(true);
        return this.movies.getCatalog({ q: q.trim(), availability: 'all', page_size: 8 }).pipe(
          map(page => page.results),
          catchError(() => of([] as IVideoContent[])),
        );
      }),
    ).subscribe(list => { this.results.set(list); this.searching.set(false); });
    this.form.valueChanges.subscribe(() => this.markDirty());
    this.load();
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.getState().subscribe({
      next: s => { this.apply(s); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err) ?? 'admin.homepage.loadFailed');
      },
    });
  }

  // ── Featured film ─────────────────────────────────────
  onQuery(value: string): void {
    this.query.set(value);
    this.search$.next(value);
  }

  chooseFilm(film: IVideoContent): void {
    this.featured.set(film);
    this.results.set([]);
    this.query.set('');
    this.markDirty();
  }

  clearFilm(): void {
    this.featured.set(null);
    this.markDirty();
  }

  // ── Sections ──────────────────────────────────────────
  move(index: number, delta: number): void {
    this.sections.set(moveSection(this.sections(), index, delta));
    this.markDirty();
  }

  toggleSection(index: number, visible: boolean): void {
    this.sections.update(list => list.map((s, i) => (i === index ? { ...s, visible } : s)));
    this.markDirty();
  }

  setSectionTitle(index: number, title: string): void {
    this.sections.update(list => list.map((s, i) => (i === index ? { ...s, title } : s)));
    this.markDirty();
  }

  isAdSection(s: HomeSection): boolean {
    return s.key.startsWith('ad_');
  }

  isGuestOnly(s: HomeSection): boolean {
    return s.key === 'why' || s.key === 'join_cta';
  }

  // ── Hero image ────────────────────────────────────────
  onImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!HERO_IMAGE_EXTENSIONS.some(ext => name.endsWith(ext))) {
      this.imageError.set('admin.homepage.imageType');
      return;
    }
    if (file.size > HERO_IMAGE_MAX_BYTES) {
      this.imageError.set('admin.homepage.imageSize');
      return;
    }
    this.run('image', this.api.uploadHeroImage(file), 'admin.homepage.imageSaved', true);
  }

  removeImage(): void {
    this.run('image', this.api.removeHeroImage(), 'admin.homepage.imageRemoved', true);
  }

  // ── Save / publish / discard ──────────────────────────
  content(): HomepageContent {
    const v = this.form.getRawValue();
    return {
      hero_title: v.hero_title.trim(),
      hero_description: v.hero_description.trim(),
      cta_label: v.cta_label.trim(),
      cta_link: v.cta_link.trim(),
      featured_movie_id: this.featured()?.id ?? null,
      sections: this.sections().map(s => ({ key: s.key, visible: s.visible, title: s.title.trim() })),
    };
  }

  /** Both or neither of label and link (the API says the same). */
  ctaIncomplete(): boolean {
    const v = this.form.getRawValue();
    return !!v.cta_label.trim() !== !!v.cta_link.trim();
  }

  save(): void {
    if (!this.validLocally()) return;
    this.run('save', this.api.saveDraft(this.content()), 'admin.homepage.saved');
  }

  publish(): void {
    if (!this.validLocally()) return;
    // Unsaved edits are saved first, so what is published is exactly what the preview shows.
    const req = this.dirty()
      ? this.api.saveDraft(this.content()).pipe(switchMap(() => this.api.publish()))
      : this.api.publish();
    this.run('publish', req, 'admin.homepage.published');
  }

  discard(): void {
    this.confirmDiscard.set(false);
    this.run('discard', this.api.discardDraft(), 'admin.homepage.discarded');
  }

  invalid(name: 'hero_title' | 'hero_description' | 'cta_label' | 'cta_link'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  private validLocally(): boolean {
    this.form.markAllAsTouched();
    const sectionsOk = this.sections().every(s => s.title.trim().length <= HOME_TEXT_LIMITS.sectionTitle);
    if (this.form.invalid || this.ctaIncomplete() || !sectionsOk) {
      this.saveError.set('admin.homepage.fixErrors');
      return false;
    }
    return !this.busy();
  }

  /** `keepEdits`: the image endpoints don't touch the texts, so unsaved form edits stay as they are. */
  private run(kind: 'save' | 'publish' | 'discard' | 'image', req: Observable<HomepageAdminState>,
              done: string, keepEdits = false): void {
    this.busy.set(kind);
    this.message.set(null);
    this.saveError.set(null);
    this.imageError.set(null);
    this.fieldErrs.set({});
    req.subscribe({
      next: s => {
        this.busy.set(null);
        if (keepEdits) this.state.set(s); else this.apply(s);
        this.message.set(done);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        const fe = fieldErrors(err);
        if (kind === 'image') {
          this.imageError.set(fe['image'] ?? apiErrorMessage(err) ?? 'admin.homepage.saveFailed');
          return;
        }
        this.fieldErrs.set(fe);
        this.saveError.set(Object.keys(fe).length ? 'admin.homepage.fixErrors' : (apiErrorMessage(err) ?? 'admin.homepage.saveFailed'));
      },
    });
  }

  private apply(s: HomepageAdminState): void {
    this.state.set(s);
    const d = s.draft;
    this.form.reset({
      hero_title: d.hero_title, hero_description: d.hero_description, cta_label: d.cta_label, cta_link: d.cta_link,
    }, { emitEvent: true });
    this.sections.set(normalizeSections(d.sections));
    this.featured.set(d.featured);
    this.dirty.set(false);
  }

  private markDirty(): void {
    if (!this.loading() && this.state()) this.dirty.set(true);
  }
}
