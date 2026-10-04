import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorGender, ActorProfile, ActorProfilePayload } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { toLocalDateString } from '../../../shared/utils/local-date';

/** Split a comma-separated input into trimmed, non-empty values. */
export function splitList(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * Create or edit the actor profile (PUT /marketplace/profile/). Used by the
 * profile page and the talent-video wizard. A new profile starts from the
 * account's name and email.
 */
@Component({
  selector: 'app-actor-profile-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './actor-profile-form.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorProfileFormComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly auth = inject(AuthService);

  /** The saved profile, or null when there is none yet. */
  @Input() profile: ActorProfile | null = null;
  /** Translation key for the submit button; defaults to create/save. */
  @Input() submitKey: string | null = null;
  @Output() saved = new EventEmitter<ActorProfile>();

  readonly genders: ActorGender[] = ['female', 'male', 'other'];
  readonly today = toLocalDateString(new Date());

  saving = signal(false);
  error = signal<string | null>(null);
  fieldErrors = signal<Record<string, string>>({});

  form = this.fb.nonNullable.group({
    stage_name:    ['', [Validators.required, Validators.maxLength(150)]],
    bio:           [''],
    gender:        ['' as ActorGender | ''],
    location:      ['', Validators.maxLength(150)],
    languages:     [''],
    skills:        [''],
    contact_email: ['', Validators.email],
    contact_phone: ['', Validators.maxLength(20)],
    is_listed:     [true],
    date_of_birth: ['', Validators.required],
  });

  get isNew(): boolean {
    return !this.profile;
  }

  ngOnChanges(): void {
    const p = this.profile;
    if (p) {
      this.form.patchValue({ ...p, languages: p.languages.join(', '), skills: p.skills.join(', ') });
    } else if (this.form.pristine) {
      this.form.patchValue({ stage_name: this.auth.userName(), contact_email: this.auth.userEmail() });
    }
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    if (this.saving()) return;
    const v = this.form.getRawValue();
    const payload: ActorProfilePayload = {
      ...v,
      stage_name: v.stage_name.trim(),
      languages: splitList(v.languages),
      skills: splitList(v.skills),
    };

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    this.marketplace.saveProfile(payload).subscribe({
      next: (profile) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.saved.emit(profile);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const body = err.error;
        if (err.status === 400 && body && typeof body === 'object' && !('error' in body)) {
          // DRF field errors: { field: ["message"] }
          const map: Record<string, string> = {};
          for (const [k, msgs] of Object.entries(body as Record<string, unknown>)) {
            map[k] = Array.isArray(msgs) ? String(msgs[0]) : String(msgs);
          }
          this.fieldErrors.set(map);
        } else {
          this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.saveFailed');
        }
      },
    });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  private focusFirstInvalid(): void {
    if (typeof document === 'undefined') return;
    setTimeout(() => document.querySelector<HTMLElement>('app-actor-profile-form [aria-invalid="true"]')?.focus());
  }
}
