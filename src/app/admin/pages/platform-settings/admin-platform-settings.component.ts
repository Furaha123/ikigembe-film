import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { apiErrorMessage, firstFieldError } from '../../../shared/utils/api-error';

export interface PlatformSettings {
  default_film_price: number;
  single_view_window_hours: number;
  /** null until an admin sets it explicitly — finance allocation refuses to run without it. */
  tax_rate_percent: string | null;
  operations_percent: string;
  updated_at: string | null;
  updated_by: string | null;
}

/** Deployment switches: set in the server environment, shown read-only. */
export interface PlatformEnvironment {
  enforce_single_device_view: boolean;
  payment_gateway: string;
  payment_demo_mode: boolean;
  default_producer_percent: number;
}

const URL = `${environment.apiUrl}/admin/dashboard/platform-settings/`;

/** Admin-editable platform values (validated and audited by the API). New values never rewrite history. */
@Component({
  selector: 'app-admin-platform-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-platform-settings.component.html',
  styleUrl: '../payments/admin-payments.component.scss',
})
export class AdminPlatformSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  loadError = signal<string | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);
  saved = signal(false);
  env = signal<PlatformEnvironment | null>(null);
  meta = signal<{ updated_at: string | null; updated_by: string | null } | null>(null);

  form = this.fb.group({
    default_film_price: [null as number | null, [Validators.required, Validators.min(1)]],
    single_view_window_hours: [null as number | null, [Validators.required, Validators.min(1), Validators.max(720)]],
    tax_rate_percent: [null as number | null, [Validators.min(0), Validators.max(100)]],
    operations_percent: [null as number | null, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.http.get<{ settings: PlatformSettings; environment: PlatformEnvironment }>(URL).subscribe({
      next: ({ settings, environment: env }) => {
        this.apply(settings);
        this.env.set(env);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err) ?? 'admin.platformSettings.loadFailed');
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving() || this.loadError()) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    this.saved.set(false);
    this.http.put<{ settings: PlatformSettings; environment: PlatformEnvironment }>(URL, {
      ...v,
      // An empty tax field means "not set" — never 0 by accident.
      tax_rate_percent: v.tax_rate_percent === null || (v.tax_rate_percent as unknown) === '' ? null : v.tax_rate_percent,
    }).subscribe({
      next: ({ settings }) => {
        this.apply(settings);
        this.saving.set(false);
        this.saved.set(true);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(firstFieldError(err) ?? apiErrorMessage(err) ?? 'admin.platformSettings.saveFailed');
      },
    });
  }

  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  private apply(s: PlatformSettings): void {
    this.form.reset({
      default_film_price: s.default_film_price,
      single_view_window_hours: s.single_view_window_hours,
      tax_rate_percent: s.tax_rate_percent === null ? null : Number(s.tax_rate_percent),
      operations_percent: Number(s.operations_percent),
    });
    this.meta.set({ updated_at: s.updated_at, updated_by: s.updated_by });
  }
}
