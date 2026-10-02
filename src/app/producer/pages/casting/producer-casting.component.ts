import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CastingService } from '../../services/casting.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { CastingCall, CastingCallPayload, ServicePurchase } from '../../../shared/models/marketplace.interface';
import { castingCallStatusClass, castingDisplayStatus } from '../../../shared/utils/marketplace-status';
import { apiErrorMessage } from '../../../shared/utils/api-error';

/** One role per line (commas also accepted). */
export function parseRoles(value: string): string[] {
  return value.split(/[\n,]/).map(r => r.trim()).filter(Boolean);
}

function futureDate(control: AbstractControl<string>): ValidationErrors | null {
  if (!control.value) return null;
  return new Date(control.value).getTime() > Date.now() ? null : { past: true };
}

function rolesRequired(control: AbstractControl<string>): ValidationErrors | null {
  return parseRoles(control.value ?? '').length ? null : { roles: true };
}

/** `datetime-local` value for an ISO timestamp, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-producer-casting',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, PaymentModalComponent],
  templateUrl: './producer-casting.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ProducerCastingComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly casting = inject(CastingService);

  calls       = signal<CastingCall[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);
  formOpen    = signal(false);
  editingId   = signal<number | null>(null);
  saving      = signal(false);
  formError   = signal<string | null>(null);
  purchase    = signal<ServicePurchase | null>(null);
  confirmCloseId = signal<number | null>(null);
  actionError = signal<string | null>(null);

  readonly statusClass = castingCallStatusClass;
  readonly displayStatus = castingDisplayStatus;

  form = this.fb.nonNullable.group({
    title:       ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', Validators.required],
    roles:       ['', rolesRequired],
    deadline_at: ['', [Validators.required, futureDate]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.casting.getMyCalls().subscribe({
      next: (list) => { this.calls.set(list); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset();
    this.formError.set(null);
    this.formOpen.set(true);
  }

  edit(c: CastingCall): void {
    this.editingId.set(c.id);
    this.form.setValue({
      title: c.title,
      description: c.description,
      roles: c.roles.join('\n'),
      deadline_at: toLocalInput(c.deadline_at),
    });
    this.formError.set(null);
    this.formOpen.set(true);
  }

  cancelForm(): void {
    this.formOpen.set(false);
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const payload: CastingCallPayload = {
      title: v.title.trim(),
      description: v.description.trim(),
      roles: parseRoles(v.roles),
      deadline_at: new Date(v.deadline_at).toISOString(),
    };
    const id = this.editingId();
    const req = id ? this.casting.updateCall(id, payload) : this.casting.createCall(payload);

    this.saving.set(true);
    this.formError.set(null);
    req.subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.load(); },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(apiErrorMessage(err) ?? firstFieldError(err) ?? 'marketplace.errors.saveFailed');
      },
    });
  }

  /** Pay the announcement fee — the call publishes itself once the payment completes. */
  publish(c: CastingCall): void {
    if (c.status !== 'draft' || c.payment_status === 'Pending') return;
    if (new Date(c.deadline_at).getTime() <= Date.now()) {
      this.actionError.set('marketplace.producerCasting.deadlineFuture');
      return;
    }
    this.purchase.set({
      titleKey: 'marketplace.producerCasting.publishTitle',
      descriptionKey: 'marketplace.producerCasting.publishDesc',
      quote: () => this.casting.getQuote('casting_announcement'),
      initiate: (phone) => this.casting.purchaseCall(c.id, phone),
    });
  }

  onPaid(): void {
    this.purchase.set(null);
    this.load();
  }

  closePurchase(): void {
    this.purchase.set(null);
    this.load();
  }

  closeCall(c: CastingCall): void {
    this.actionError.set(null);
    this.casting.closeCall(c.id).subscribe({
      next: () => { this.confirmCloseId.set(null); this.load(); },
      error: (err: unknown) => {
        this.confirmCloseId.set(null);
        this.actionError.set(apiErrorMessage(err) ?? 'marketplace.errors.actionFailed');
      },
    });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }
}

/** First message of a DRF `{ field: [msg] }` validation error. */
export function firstFieldError(err: HttpErrorResponse): string | null {
  const body: unknown = err.error;
  if (!body || typeof body !== 'object') return null;
  for (const v of Object.values(body as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length) return String(v[0]);
    if (typeof v === 'string') return v;
  }
  return null;
}
