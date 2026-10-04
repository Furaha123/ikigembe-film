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
import { CastingCall, CastingCallPayload, ServicePurchase, ServiceQuote } from '../../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../../shared/utils/marketplace-error';
import { firstFieldError } from '../../../../shared/utils/api-error';
import { castingPublicationClass, castingPublicationState } from '../../../../shared/utils/marketplace-status';

export type CastingType = 'specific' | 'various';
export type CastingWizardStep = 'type' | 'details' | 'roles' | 'review' | 'result';
const STEPS: readonly CastingWizardStep[] = ['type', 'details', 'roles', 'review', 'result'];

export interface CastingWizardDraft {
  step: CastingWizardStep;
  type: CastingType;
  title: string;
  description: string;
  deadline_at: string;
  roles: string[];
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
 * Post a casting: type → project details → roles → review → payment → the
 * server's publication state. Only the fields the API stores are asked for
 * (title, description, roles, application deadline). Saving creates or updates
 * a draft; paying the announcement fee lets the server publish it. "Published"
 * is shown only when the server reports it.
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

  details = this.fb.nonNullable.group({
    title:       ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.required, Validators.maxLength(5000)]],
    deadline_at: ['', [Validators.required, futureDate]],
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
        this.details.setValue({ title: c.title, description: c.description, deadline_at: toLocalInput(c.deadline_at) });
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
      // Keep the first role; the rest stay in the draft until the type changes back.
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
        if (this.roles.invalid) { this.focusFirstInvalid(); return; }
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
    if (this.details.invalid || this.roles.invalid) {
      this.details.markAllAsTouched();
      this.roles.markAllAsTouched();
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
    this.drafts.save<CastingWizardDraft>(this.draftKey, {
      step: this.step(), type: this.type(), title: v.title, description: v.description,
      deadline_at: v.deadline_at, roles: this.roles.getRawValue(),
    });
  }

  hasUnsavedChanges(): boolean {
    if (this.step() === 'result' || this.saving() || this.purchase()) return false;
    return this.details.dirty || this.roles.dirty;
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
    return {
      title: v.title.trim(),
      description: v.description.trim(),
      roles: this.roles.getRawValue().map(r => r.trim()).filter(Boolean),
      deadline_at: new Date(v.deadline_at).toISOString(),
    };
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
    setTimeout(() => document.querySelector<HTMLElement>('app-casting-wizard .ng-invalid.ng-touched:not(form):not([formArrayName])')?.focus());
  }

  /** Leave for My Castings after a result. */
  toMyCastings(): void {
    void this.router.navigate(['/producer/casting']);
  }
}

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return (control.value ?? '').trim() ? null : { required: true };
}
