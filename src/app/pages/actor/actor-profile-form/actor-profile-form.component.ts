import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorGender, ActorProfile, ActorProfilePayload } from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';

/** Split a comma-separated input into trimmed, non-empty values. */
export function splitList(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * Create/edit form for the viewer's actor profile (`PUT /marketplace/profile/`).
 * Used by the profile page and the "show your talent" wizard. Extra buttons
 * (e.g. Back) can be projected into the actions row.
 */
@Component({
  selector: 'app-actor-profile-form',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './actor-profile-form.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorProfileFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(ActorMarketplaceService);

  /** Existing profile to edit, or null to create one. */
  @Input() set profile(p: ActorProfile | null) {
    if (p) this.form.patchValue({ ...p, languages: p.languages.join(', '), skills: p.skills.join(', ') });
  }
  /** Translation key for the submit button. */
  @Input() submitKey = 'marketplace.common.save';
  @Output() saved = new EventEmitter<ActorProfile>();

  readonly genders: ActorGender[] = ['female', 'male', 'other'];
  readonly today = new Date().toISOString().slice(0, 10);

  saving      = signal(false);
  error       = signal<string | null>(null);
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

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const payload: ActorProfilePayload = {
      ...v,
      languages: splitList(v.languages),
      skills: splitList(v.skills),
    };

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    this.marketplace.saveProfile(payload).subscribe({
      next: (profile) => {
        this.saving.set(false);
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
          this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.saveFailed');
        }
      },
    });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }
}
