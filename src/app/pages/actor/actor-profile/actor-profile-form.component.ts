import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorGender, ActorProfile, ActorProfilePayload } from '../../../shared/models/marketplace.interface';
import { RWANDA_PROVINCES, districtsFor } from '../../../shared/models/rwanda-locations';
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

  @Input() profile: ActorProfile | null = null;
  @Input() submitKey: string | null = null;
  @Output() saved = new EventEmitter<ActorProfile>();

  readonly genders: ActorGender[] = ['female', 'male', 'other'];
  readonly provinces = RWANDA_PROVINCES;
  readonly today = toLocalDateString(new Date());

  saving = signal(false);
  error = signal<string | null>(null);
  fieldErrors = signal<Record<string, string>>({});

  form = this.fb.nonNullable.group({
    stage_name:    ['', [Validators.required, Validators.maxLength(150)]],
    bio:           [''],
    gender:        ['' as ActorGender | ''],
    province:      [''],
    district:      [''],
    languages:     [''],
    skills:        [''],
    contact_email: ['', Validators.email],
    contact_phone: ['', Validators.maxLength(20)],
    is_listed:     [true],
    date_of_birth: ['', Validators.required],
  });

  /** Reactive province value — bridges the FormControl observable into a Signal. */
  private readonly provinceValue = toSignal(
    this.form.controls.province.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );

  /** Districts available for the currently selected province. */
  readonly districts = computed(() => districtsFor(this.provinceValue() ?? ''));

  get isNew(): boolean {
    return !this.profile;
  }

  ngOnChanges(): void {
    const p = this.profile;
    if (p) {
      this.form.patchValue({
        ...p,
        languages: p.languages.join(', '),
        skills: p.skills.join(', '),
        province: p.province ?? '',
        district: p.district ?? '',
      });
    } else if (this.form.pristine) {
      this.form.patchValue({ stage_name: this.auth.userName(), contact_email: this.auth.userEmail() });
    }
  }

  onProvinceChange(): void {
    this.form.controls.district.setValue('');
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    if (this.saving()) return;
    const v = this.form.getRawValue();

    const province = v.province.trim();
    const district = v.district.trim();
    const locationParts = [district, province].filter(Boolean);
    const location = locationParts.join(', ');

    const payload: ActorProfilePayload = {
      stage_name: v.stage_name.trim(),
      bio: v.bio,
      gender: v.gender,
      location,
      province: province || undefined,
      district: district || undefined,
      languages: splitList(v.languages),
      skills: splitList(v.skills),
      contact_email: v.contact_email,
      contact_phone: v.contact_phone,
      is_listed: v.is_listed,
      date_of_birth: v.date_of_birth,
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
