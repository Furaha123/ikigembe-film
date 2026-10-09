import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, PLATFORM_ID,
  computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl, FormArray, FormBuilder, FormControl, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { CastingService } from '../../../services/casting.service';
import { AuthService, UserProfile } from '../../../../core/services/auth.service';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
import { PaymentModalComponent } from '../../../../shared/components/payment-modal/payment-modal.component';
import { WizardStepsComponent } from '../../../../shared/components/wizard-steps/wizard-steps.component';
import { DraftStoreService } from '../../../../shared/services/draft-store.service';
import { ActorGender, CastingCall, CastingCallPayload, ServicePurchase, ServiceQuote } from '../../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../../shared/utils/marketplace-error';
import { firstFieldError } from '../../../../shared/utils/api-error';
import { castingPublicationClass, castingPublicationState } from '../../../../shared/utils/marketplace-status';

export type CastingType = 'specific' | 'various';
export type CastingWizardStep = 'type' | 'details' | 'roles' | 'poster' | 'review' | 'result';
const STEPS: readonly CastingWizardStep[] = ['type', 'details', 'roles', 'poster', 'review', 'result'];

export const PROJECT_TYPES = ['Film', 'Short Film', 'TV Series', 'Commercial', 'Music Video', 'Documentary', 'Web Series', 'Other'] as const;

const POSTER_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const POSTER_MAX_BYTES = 5 * 1024 * 1024;

export interface CastingWizardDraft {
  step: CastingWizardStep;
  type: CastingType;
  title: string;
  description: string;
  deadline_at: string;
  roles: string[];
  project_type: string;
  genre: string;
  shooting_location: string;
  project_start_date: string;
  project_end_date: string;
  min_age: number | null;
  max_age: number | null;
  gender_preference: ActorGender | '';
  num_actors: number | null;
  // Physical requirements
  height_min: number | null;
  height_max: number | null;
  body_type: string;
  complexion: string;
  appearance_notes: string;
  // Skills & languages
  required_skills: string;
  required_languages: string;
  // Availability
  availability_notes: string;
}

/** `datetime-local` value for an ISO timestamp, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function futureDate(control: AbstractControl<string>): ValidationErrors | null {
  if (!control.value) return null;
  const t = new Date(control.value).getTime();
  return Number.isFinite(t) && t > Date.now() ? null : { past: true };
}

@Component({
  selector: 'app-casting-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, PaymentModalComponent, WizardStepsComponent],
  templateUrl: './casting-wizard.component.html',
  styleUrls: ['../../../../shared/styles/marketplace-page.scss'],
})
export class CastingWizardComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly casting = inject(CastingService);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftStoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  readonly stepLabels = [
    'marketplace.postCasting.stepType',
    'marketplace.postCasting.stepDetails',
    'marketplace.postCasting.stepRoles',
    'marketplace.postCasting.stepPoster',
    'marketplace.postCasting.stepReview',
    'marketplace.postCasting.stepResult',
  ];
  readonly publicationClass = castingPublicationClass;
  readonly projectTypes = PROJECT_TYPES;
  readonly genders: (ActorGender | '')[] = ['', 'female', 'male', 'other'];

  step = signal<CastingWizardStep>('type');
  type = signal<CastingType>('specific');
  callId = signal<number | null>(null);
  call = signal<CastingCall | null>(null);
  loading = signal(false);
  loadError = signal<string | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);
  savedNotice = signal(false);
  me = signal<UserProfile | null>(null);
  quote = signal<ServiceQuote | null>(null);
  quoteError = signal<string | null>(null);
  purchase = signal<ServicePurchase | null>(null);
  checking = signal(false);
  readonly minDeadline = toLocalInput(new Date().toISOString());
  readonly today = new Date().toISOString().substring(0, 10);

  // ── Poster state ────────────────────────────────────────────────────────
  /** URL shown in the preview img — either a server URL or a local object URL. */
  posterPreview = signal<string | null>(null);
  posterUploading = signal(false);
  posterError = signal<string | null>(null);
  /** Object URL created for local preview; must be revoked when done. */
  private posterObjectUrl: string | null = null;

  details = this.fb.nonNullable.group({
    title:              ['', [Validators.required, Validators.maxLength(255)]],
    description:        ['', [Validators.required, Validators.maxLength(5000)]],
    deadline_at:        ['', [Validators.required, futureDate]],
    project_type:       ['', Validators.maxLength(100)],
    genre:              ['', Validators.maxLength(100)],
    shooting_location:  ['', Validators.maxLength(200)],
    project_start_date: [''],
    project_end_date:   [''],
    availability_notes: [''],
  });

  requirements = this.fb.nonNullable.group({
    min_age:           [null as number | null, [Validators.min(0), Validators.max(100)]],
    max_age:           [null as number | null, [Validators.min(0), Validators.max(100)]],
    gender_preference: ['' as ActorGender | ''],
    num_actors:        [null as number | null, [Validators.min(1), Validators.max(999)]],
    // Physical requirements
    height_min:        [null as number | null, [Validators.min(50), Validators.max(300)]],
    height_max:        [null as number | null, [Validators.min(50), Validators.max(300)]],
    body_type:         ['', Validators.maxLength(100)],
    complexion:        ['', Validators.maxLength(100)],
    appearance_notes:  [''],
    // Skills & languages (comma-separated, split on save)
    required_skills:   [''],
    required_languages:[''],
  });

  roles = new FormArray<FormControl<string>>([this.roleControl()]);

  readonly stepIndex = computed(() => STEPS.indexOf(this.step()));
  readonly state = computed(() => {
    const c = this.call();
    return c ? castingPublicationState(c) : null;
  });

  private get draftKey(): string {
    return `casting:${this.callId() ?? 'new'}`;
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.callId.set(id);
      this.loadCall(id);
    } else {
      this.restoreDraft();
    }
    this.auth.getMe().subscribe({ next: me => this.me.set(me), error: () => { /* contact defaults stay empty */ } });
  }

  ngOnDestroy(): void {
    this.revokePosterObjectUrl();
  }

  private loadCall(id: number): void {
    this.loading.set(true);
    this.casting.getCall(id).subscribe({
      next: (c) => {
        this.loading.set(false);
        this.call.set(c);
        // Drafts and rejected calls are edited; everything else shows its status.
        if (c.status !== 'draft' && c.status !== 'rejected') {
          this.step.set('result');
          return;
        }
        this.details.patchValue({
          title: c.title,
          description: c.description,
          deadline_at: toLocalInput(c.deadline_at),
          project_type: c.project_type ?? '',
          genre: c.genre ?? '',
          shooting_location: c.shooting_location ?? '',
          project_start_date: c.project_start_date ?? '',
          project_end_date: c.project_end_date ?? '',
          availability_notes: c.availability_notes ?? '',
        });
        this.requirements.patchValue({
          min_age: c.min_age ?? null,
          max_age: c.max_age ?? null,
          gender_preference: c.gender_preference ?? '',
          num_actors: c.num_actors ?? null,
          height_min: c.height_min ?? null,
          height_max: c.height_max ?? null,
          body_type: c.body_type ?? '',
          complexion: c.complexion ?? '',
          appearance_notes: c.appearance_notes ?? '',
          required_skills: (c.required_skills ?? []).join(', '),
          required_languages: (c.required_languages ?? []).join(', '),
        });
        this.setRoles(c.roles);
        this.type.set(c.roles.length > 1 ? 'various' : 'specific');
        if (c.poster_url) this.posterPreview.set(c.poster_url);
        this.restoreDraft();
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(err.status === 404 ? 'marketplace.casting.notFound' : (marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed'));
      },
    });
  }

  // ── Steps ──────────────────────────────────────────────────────────────

  chooseType(type: CastingType): void {
    this.type.set(type);
    if (type === 'specific' && this.roles.length > 1) {
      while (this.roles.length > 1) this.roles.removeAt(this.roles.length - 1);
    }
    this.persist();
  }

  next(): void {
    switch (this.step()) {
      case 'type':
        this.goTo('details');
        break;
      case 'details':
        this.details.markAllAsTouched();
        if (this.details.invalid) { this.focusFirstInvalid(); return; }
        this.goTo('roles');
        break;
      case 'roles':
        this.roles.markAllAsTouched();
        this.requirements.markAllAsTouched();
        if (this.roles.invalid || this.requirements.invalid) { this.focusFirstInvalid(); return; }
        // Auto-save draft to get an ID before the poster step.
        if (this.callId()) {
          this.goTo('poster');
        } else {
          this.saveDraft(() => this.goTo('poster'));
        }
        break;
      case 'poster':
        this.goTo('review');
        this.loadQuote();
        break;
    }
  }

  back(): void {
    const i = STEPS.indexOf(this.step());
    if (i > 0 && this.step() !== 'result') this.goTo(STEPS[i - 1]);
  }

  editSection(step: CastingWizardStep): void {
    this.goTo(step);
  }

  addRole(): void {
    this.roles.push(this.roleControl());
    this.persist();
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => document.getElementById(`cw-role-${this.roles.length - 1}`)?.focus());
    }
  }

  removeRole(i: number): void {
    if (this.roles.length <= 1) return;
    this.roles.removeAt(i);
    this.persist();
  }

  // ── Poster ─────────────────────────────────────────────────────────────

  onPosterFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';

    if (!POSTER_ALLOWED_TYPES.has(file.type)) {
      this.posterError.set('marketplace.postCasting.posterBadType');
      return;
    }
    if (file.size > POSTER_MAX_BYTES) {
      this.posterError.set('marketplace.postCasting.posterTooLarge');
      return;
    }
    this.posterError.set(null);

    // Show local preview immediately.
    if (isPlatformBrowser(this.platformId)) {
      this.revokePosterObjectUrl();
      this.posterObjectUrl = URL.createObjectURL(file);
      this.posterPreview.set(this.posterObjectUrl);
    }

    const id = this.callId()!;
    this.posterUploading.set(true);
    this.casting.uploadPoster(id, file).subscribe({
      next: (c) => {
        this.posterUploading.set(false);
        this.call.set(c);
        this.revokePosterObjectUrl();
        this.posterPreview.set(c.poster_url ?? null);
      },
      error: (err: HttpErrorResponse) => {
        this.posterUploading.set(false);
        this.posterPreview.set(this.call()?.poster_url ?? null);
        this.posterError.set(marketplaceErrorMessage(err) ?? 'marketplace.postCasting.posterUploadFailed');
      },
    });
  }

  onRemovePoster(): void {
    const id = this.callId();
    if (!id || this.posterUploading()) return;
    this.posterUploading.set(true);
    this.posterError.set(null);
    this.casting.removePoster(id).subscribe({
      next: (c) => {
        this.posterUploading.set(false);
        this.call.set(c);
        this.revokePosterObjectUrl();
        this.posterPreview.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.posterUploading.set(false);
        this.posterError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.saveFailed');
      },
    });
  }

  private revokePosterObjectUrl(): void {
    if (this.posterObjectUrl && isPlatformBrowser(this.platformId)) {
      URL.revokeObjectURL(this.posterObjectUrl);
      this.posterObjectUrl = null;
    }
  }

  // ── Save / pay ─────────────────────────────────────────────────────────

  saveDraft(onSaved?: (call: CastingCall) => void): void {
    if (this.saving()) return;
    if (this.details.invalid || this.roles.invalid || this.requirements.invalid) {
      this.details.markAllAsTouched();
      this.roles.markAllAsTouched();
      this.requirements.markAllAsTouched();
      this.saveError.set('marketplace.postCasting.fixErrors');
      return;
    }
    const payload = this.payload();
    const id = this.callId();
    const req: Observable<CastingCall> = id ? this.casting.updateCall(id, payload) : this.casting.createCall(payload);
    this.saving.set(true);
    this.saveError.set(null);
    this.savedNotice.set(false);
    req.subscribe({
      next: (call) => {
        this.saving.set(false);
        this.drafts.clear(this.draftKey);
        this.callId.set(call.id);
        this.call.set(call);
        this.details.markAsPristine();
        this.roles.markAsPristine();
        this.requirements.markAsPristine();
        this.drafts.clear('casting:new');
        if (onSaved) onSaved(call);
        else this.savedNotice.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        if (err.status === 409) {
          this.saveError.set('marketplace.postCasting.notDraft');
          return;
        }
        this.saveError.set(marketplaceErrorMessage(err) ?? firstFieldError(err) ?? 'marketplace.errors.saveFailed');
      },
    });
  }

  /** The fee is already paid (a rejected call being corrected): resubmitting needs no new payment. */
  readonly alreadyPaid = computed(() => this.call()?.payment_status === 'Completed');

  payAndPublish(): void {
    if (this.purchase() || this.saving()) return;
    const deadline = this.details.controls.deadline_at;
    deadline.updateValueAndValidity();
    if (deadline.invalid) {
      this.saveError.set('marketplace.producerCasting.deadlineFuture');
      return;
    }
    if (this.alreadyPaid()) {
      this.saveDraft((call) => this.sendForReview(call.id));
      return;
    }
    this.saveDraft((call) => {
      this.purchase.set({
        titleKey: 'marketplace.producerCasting.publishTitle',
        descriptionKey: 'marketplace.producerCasting.publishDesc',
        quote: () => this.casting.getQuote('casting_announcement'),
        pendingKey: `service:casting:${call.id}`,
        returnTo: `/producer/casting/${call.id}/edit`,
        initiate: (phone) => this.casting.purchaseCall(call.id, phone),
      });
    });
  }

  onPaid(): void {
    this.purchase.set(null);
    this.goTo('result');
    this.refreshState();
  }

  private sendForReview(id: number): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.casting.submitCall(id).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.call.set(c);
        this.goTo('result');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.saveFailed');
      },
    });
  }

  closePurchase(): void {
    this.purchase.set(null);
    this.refreshState();
  }

  refreshState(): void {
    const id = this.callId();
    if (!id) return;
    this.checking.set(true);
    this.casting.getCall(id).subscribe({
      next: (c) => { this.checking.set(false); this.call.set(c); },
      error: () => this.checking.set(false),
    });
  }

  loadQuote(): void {
    if (this.quote()) return;
    this.quoteError.set(null);
    this.casting.getQuote('casting_announcement').subscribe({
      next: (q) => this.quote.set(q),
      error: (err: HttpErrorResponse) => this.quoteError.set(
        err.status === 503 ? 'marketplace.purchase.unavailable' : (marketplaceErrorMessage(err) ?? 'marketplace.purchase.quoteFailed'),
      ),
    });
  }

  // ── Draft & leaving ────────────────────────────────────────────────────

  persist(): void {
    if (this.step() === 'result') return;
    const v = this.details.getRawValue();
    const r = this.requirements.getRawValue();
    this.drafts.save<CastingWizardDraft>(this.draftKey, {
      step: this.step(), type: this.type(),
      title: v.title, description: v.description, deadline_at: v.deadline_at,
      project_type: v.project_type, genre: v.genre, shooting_location: v.shooting_location,
      project_start_date: v.project_start_date, project_end_date: v.project_end_date,
      availability_notes: v.availability_notes,
      roles: this.roles.getRawValue(),
      min_age: r.min_age, max_age: r.max_age,
      gender_preference: r.gender_preference, num_actors: r.num_actors,
      height_min: r.height_min, height_max: r.height_max,
      body_type: r.body_type, complexion: r.complexion,
      appearance_notes: r.appearance_notes,
      required_skills: r.required_skills,
      required_languages: r.required_languages,
    });
  }

  hasUnsavedChanges(): boolean {
    if (this.step() === 'result' || this.saving() || this.purchase()) return false;
    return this.details.dirty || this.roles.dirty || this.requirements.dirty;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) e.preventDefault();
  }

  private restoreDraft(): void {
    const d = this.drafts.load<CastingWizardDraft>(this.draftKey);
    if (!d) return;
    this.details.patchValue({
      title: typeof d.title === 'string' ? d.title : '',
      description: typeof d.description === 'string' ? d.description : '',
      deadline_at: typeof d.deadline_at === 'string' ? d.deadline_at : '',
      project_type: typeof d.project_type === 'string' ? d.project_type : '',
      genre: typeof d.genre === 'string' ? d.genre : '',
      shooting_location: typeof d.shooting_location === 'string' ? d.shooting_location : '',
      project_start_date: typeof d.project_start_date === 'string' ? d.project_start_date : '',
      project_end_date: typeof d.project_end_date === 'string' ? d.project_end_date : '',
      availability_notes: typeof d.availability_notes === 'string' ? d.availability_notes : '',
    });
    this.requirements.patchValue({
      min_age: typeof d.min_age === 'number' ? d.min_age : null,
      max_age: typeof d.max_age === 'number' ? d.max_age : null,
      gender_preference: (d.gender_preference as ActorGender | '') ?? '',
      num_actors: typeof d.num_actors === 'number' ? d.num_actors : null,
      height_min: typeof d.height_min === 'number' ? d.height_min : null,
      height_max: typeof d.height_max === 'number' ? d.height_max : null,
      body_type: typeof d.body_type === 'string' ? d.body_type : '',
      complexion: typeof d.complexion === 'string' ? d.complexion : '',
      appearance_notes: typeof d.appearance_notes === 'string' ? d.appearance_notes : '',
      required_skills: typeof d.required_skills === 'string' ? d.required_skills : '',
      required_languages: typeof d.required_languages === 'string' ? d.required_languages : '',
    });
    if (Array.isArray(d.roles) && d.roles.length) this.setRoles(d.roles.filter((r): r is string => typeof r === 'string'));
    if (d.type === 'various' || d.type === 'specific') this.type.set(d.type);
    if (d.step && STEPS.includes(d.step) && d.step !== 'result') this.step.set(d.step);
    this.details.markAsDirty();
  }

  private setRoles(values: string[]): void {
    this.roles.clear();
    for (const v of values.length ? values : ['']) this.roles.push(this.roleControl(v));
  }

  private roleControl(value = ''): FormControl<string> {
    return this.fb.nonNullable.control(value, [Validators.required, Validators.maxLength(500), notBlank]);
  }

  private payload(): CastingCallPayload {
    const v = this.details.getRawValue();
    const r = this.requirements.getRawValue();
    const base: CastingCallPayload = {
      title: v.title.trim(),
      description: v.description.trim(),
      roles: this.roles.getRawValue().map(role => role.trim()).filter(Boolean),
      deadline_at: new Date(v.deadline_at).toISOString(),
    };
    if (v.project_type.trim())        base.project_type = v.project_type.trim();
    if (v.genre.trim())               base.genre = v.genre.trim();
    if (v.shooting_location.trim())   base.shooting_location = v.shooting_location.trim();
    if (v.project_start_date)         base.project_start_date = v.project_start_date;
    if (v.project_end_date)           base.project_end_date = v.project_end_date;
    if (v.availability_notes.trim())  base.availability_notes = v.availability_notes.trim();
    if (r.min_age !== null)           base.min_age = r.min_age;
    if (r.max_age !== null)           base.max_age = r.max_age;
    if (r.gender_preference)          base.gender_preference = r.gender_preference;
    if (r.num_actors !== null)        base.num_actors = r.num_actors;
    if (r.height_min !== null)        base.height_min = r.height_min;
    if (r.height_max !== null)        base.height_max = r.height_max;
    if (r.body_type.trim())           base.body_type = r.body_type.trim();
    if (r.complexion.trim())          base.complexion = r.complexion.trim();
    if (r.appearance_notes.trim())    base.appearance_notes = r.appearance_notes.trim();
    const skills = splitList(r.required_skills);
    if (skills.length)                base.required_skills = skills;
    const langs = splitList(r.required_languages);
    if (langs.length)                 base.required_languages = langs;
    return base;
  }

  private goTo(step: CastingWizardStep): void {
    this.step.set(step);
    this.saveError.set(null);
    this.savedNotice.set(false);
    this.persist();
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => this.stepHeading()?.nativeElement.focus());
  }

  private focusFirstInvalid(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => document.querySelector<HTMLElement>('app-casting-wizard .ng-invalid.ng-touched:not(form):not([formArrayName]):not([formGroupName])')?.focus());
  }

  toMyCastings(): void {
    void this.router.navigate(['/producer/casting']);
  }
}

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return (control.value ?? '').trim() ? null : { required: true };
}

function splitList(value: string): string[] {
  return value.split(',').map(v => v.trim()).filter(Boolean);
}
