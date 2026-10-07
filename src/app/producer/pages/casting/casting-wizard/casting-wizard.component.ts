import {
  Component, ElementRef, HostListener, OnInit, PLATFORM_ID, computed, inject, signal, viewChild,
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
export type CastingWizardStep = 'type' | 'details' | 'roles' | 'review' | 'result';
const STEPS: readonly CastingWizardStep[] = ['type', 'details', 'roles', 'review', 'result'];

export const PROJECT_TYPES = ['Film', 'Short Film', 'TV Series', 'Commercial', 'Music Video', 'Documentary', 'Web Series', 'Other'] as const;

export interface CastingWizardDraft {
  step: CastingWizardStep;
  type: CastingType;
  title: string;
  description: string;
  deadline_at: string;
  roles: string[];
  // Extended fields (persisted to sessionStorage text-only)
  project_type: string;
  genre: string;
  shooting_location: string;
  project_start_date: string;
  project_end_date: string;
  min_age: number | null;
  max_age: number | null;
  gender_preference: ActorGender | '';
  num_actors: number | null;
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

/**
 * Post a casting: type → project details + requirements → roles → review →
 * payment → the server's publication state. Saving creates or updates a draft;
 * paying the announcement fee lets the server publish it. "Published" is shown
 * only when the server reports it.
 *
 * Extended project fields (type, genre, location, dates, age/gender requirements)
 * are included in the payload; the backend stores them when it supports these
 * fields. Older backends that don't recognise them will simply ignore them.
 */
@Component({
  selector: 'app-casting-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, PaymentModalComponent, WizardStepsComponent],
  templateUrl: './casting-wizard.component.html',
  styleUrls: ['../../../../shared/styles/marketplace-page.scss'],
})
export class CastingWizardComponent implements OnInit, HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly casting = inject(CastingService);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftStoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  readonly stepLabels = [
    'marketplace.postCasting.stepType', 'marketplace.postCasting.stepDetails', 'marketplace.postCasting.stepRoles',
    'marketplace.postCasting.stepReview', 'marketplace.postCasting.stepResult',
  ];
  readonly publicationClass = castingPublicationClass;
  readonly projectTypes = PROJECT_TYPES;
  readonly genders: (ActorGender | '')[] = ['', 'female', 'male', 'other'];

  step = signal<CastingWizardStep>('type');
  type = signal<CastingType>('specific');
  /** The saved draft (null until first saved). */
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

  details = this.fb.nonNullable.group({
    title:              ['', [Validators.required, Validators.maxLength(255)]],
    description:        ['', [Validators.required, Validators.maxLength(5000)]],
    deadline_at:        ['', [Validators.required, futureDate]],
    // Extended project fields — all optional
    project_type:       ['', Validators.maxLength(100)],
    genre:              ['', Validators.maxLength(100)],
    shooting_location:  ['', Validators.maxLength(200)],
    project_start_date: [''],
    project_end_date:   [''],
  });

  requirements = this.fb.nonNullable.group({
    min_age:          [null as number | null, [Validators.min(0), Validators.max(100)]],
    max_age:          [null as number | null, [Validators.min(0), Validators.max(100)]],
    gender_preference: ['' as ActorGender | ''],
    num_actors:       [null as number | null, [Validators.min(1), Validators.max(999)]],
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
    this.auth.getMe().subscribe({ next: me => this.me.set(me), error: () => { /* shown as unknown */ } });
  }

  /** Edit an existing draft: only drafts can be changed (the API answers 409 otherwise). */
  private loadCall(id: number): void {
    this.loading.set(true);
    this.casting.getCall(id).subscribe({
      next: (c) => {
        this.loading.set(false);
        this.call.set(c);
        if (c.status !== 'draft') {
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
        });
        this.requirements.patchValue({
          min_age: c.min_age ?? null,
          max_age: c.max_age ?? null,
          gender_preference: c.gender_preference ?? '',
          num_actors: c.num_actors ?? null,
        });
        this.setRoles(c.roles);
        this.type.set(c.roles.length > 1 ? 'various' : 'specific');
        this.restoreDraft(); // unsaved local edits win over the server copy
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
      case 'type': this.goTo('details'); break;
      case 'details':
        this.details.markAllAsTouched();
        if (this.details.invalid) { this.focusFirstInvalid(); return; }
        this.goTo('roles');
        break;
      case 'roles':
        this.roles.markAllAsTouched();
        this.requirements.markAllAsTouched();
        if (this.roles.invalid || this.requirements.invalid) { this.focusFirstInvalid(); return; }
        this.goTo('review');
        this.loadQuote();
        break;
    }
  }

  back(): void {
    const i = STEPS.indexOf(this.step());
    if (i > 0 && this.step() !== 'result') this.goTo(STEPS[i - 1]);
  }

  /** From the review: jump to one section; everything else is kept. */
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

  // ── Save / pay ─────────────────────────────────────────────────────────

  /** Save as a draft on the server (create, or update the existing draft). */
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

  /** Save, then pay the announcement fee; the server publishes once the payment is confirmed. */
  payAndPublish(): void {
    if (this.purchase() || this.saving()) return;
    const deadline = this.details.controls.deadline_at;
    deadline.updateValueAndValidity();
    if (deadline.invalid) {
      this.saveError.set('marketplace.producerCasting.deadlineFuture');
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

  /** Closed without a confirmed payment: the draft stays a draft. */
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

  /** Keep the text in the session draft on every change. */
  persist(): void {
    if (this.step() === 'result') return;
    const v = this.details.getRawValue();
    const r = this.requirements.getRawValue();
    this.drafts.save<CastingWizardDraft>(this.draftKey, {
      step: this.step(), type: this.type(),
      title: v.title, description: v.description, deadline_at: v.deadline_at,
      project_type: v.project_type, genre: v.genre, shooting_location: v.shooting_location,
      project_start_date: v.project_start_date, project_end_date: v.project_end_date,
      roles: this.roles.getRawValue(),
      min_age: r.min_age, max_age: r.max_age,
      gender_preference: r.gender_preference, num_actors: r.num_actors,
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
    });
    this.requirements.patchValue({
      min_age: typeof d.min_age === 'number' ? d.min_age : null,
      max_age: typeof d.max_age === 'number' ? d.max_age : null,
      gender_preference: (d.gender_preference as ActorGender | '') ?? '',
      num_actors: typeof d.num_actors === 'number' ? d.num_actors : null,
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
    // Extended optional fields — omit empty/null values.
    if (v.project_type.trim())       base.project_type = v.project_type.trim();
    if (v.genre.trim())              base.genre = v.genre.trim();
    if (v.shooting_location.trim())  base.shooting_location = v.shooting_location.trim();
    if (v.project_start_date)        base.project_start_date = v.project_start_date;
    if (v.project_end_date)          base.project_end_date = v.project_end_date;
    if (r.min_age !== null)          base.min_age = r.min_age;
    if (r.max_age !== null)          base.max_age = r.max_age;
    if (r.gender_preference)         base.gender_preference = r.gender_preference;
    if (r.num_actors !== null)       base.num_actors = r.num_actors;
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

  /** Leave for My Castings after a result. */
  toMyCastings(): void {
    void this.router.navigate(['/producer/casting']);
  }
}

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return (control.value ?? '').trim() ? null : { required: true };
}
