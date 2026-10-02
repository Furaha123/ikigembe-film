import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../actor-nav/actor-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorGender, ActorProfilePayload } from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { toLocalDateString } from '../../../shared/utils/local-date';

/** Split a comma-separated input into trimmed, non-empty values. */
export function splitList(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map(v => v.trim()).filter(Boolean);
}

@Component({
  selector: 'app-actor-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, HeaderComponent, FooterComponent, ActorNavComponent],
  templateUrl: './actor-profile.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(ActorMarketplaceService);

  readonly genders: ActorGender[] = ['female', 'male', 'other'];
  readonly today = toLocalDateString(new Date());

  loading   = signal(true);
  saving    = signal(false);
  isNew     = signal(true);
  saved     = signal(false);
  error     = signal<string | null>(null);
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

  ngOnInit(): void {
    this.marketplace.getProfile().subscribe({
      next: (p) => {
        this.isNew.set(false);
        this.form.patchValue({ ...p, languages: p.languages.join(', '), skills: p.skills.join(', ') });
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status !== 404) this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

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
    this.saved.set(false);
    this.error.set(null);
    this.fieldErrors.set({});
    this.marketplace.saveProfile(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.isNew.set(false);
        this.saved.set(true);
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
