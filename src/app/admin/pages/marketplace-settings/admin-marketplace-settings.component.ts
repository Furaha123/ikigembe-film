import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { firstFieldError } from '../../../shared/utils/api-error';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import {
  AdminMarketplaceService, MarketplaceSettings, MarketplaceSettingsPayload,
} from '../../services/admin-marketplace.service';

@Component({
  selector: 'app-admin-marketplace-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-marketplace-settings.component.html',
  styleUrl: './admin-marketplace-settings.component.scss',
})
export class AdminMarketplaceSettingsComponent implements OnInit, OnDestroy {
  private readonly svc = inject(AdminMarketplaceService);
  private readonly fb  = inject(FormBuilder);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  loading = signal(true);
  /** The form is only shown once the real values loaded, so defaults can never overwrite them. */
  loadFailed = signal(false);
  saving  = signal(false);
  serverError = signal<string | null>(null);
  toast   = signal<{ kind: 'success' | 'error'; msgKey: string } | null>(null);

  updatedAt: string | null = null;

  form = this.fb.group({
    actor_video_fee_under_30: [null as number | null, [Validators.required, Validators.min(1)]],
    actor_video_fee_30_plus:  [null as number | null, [Validators.required, Validators.min(1)]],
    casting_announcement_fee: [null as number | null, [Validators.required, Validators.min(1)]],
    actor_search_fee:         [null as number | null, [Validators.required, Validators.min(1)]],
    actor_search_access_days: [null as number | null, [Validators.required, Validators.min(1)]],
    talent_video_max_mb:      [null as number | null, [Validators.required, Validators.min(1), Validators.max(4096)]],
    talent_video_max_seconds: [null as number | null, [Validators.required, Validators.min(10), Validators.max(3600)]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.svc.getSettings().subscribe({
      next: (s: MarketplaceSettings) => {
        this.form.reset({
          actor_video_fee_under_30: s.actor_video_fee_under_30,
          actor_video_fee_30_plus:  s.actor_video_fee_30_plus,
          casting_announcement_fee: s.casting_announcement_fee,
          actor_search_fee:         s.actor_search_fee,
          actor_search_access_days: s.actor_search_access_days,
          talent_video_max_mb:      s.talent_video_max_mb,
          talent_video_max_seconds: s.talent_video_max_seconds,
        });
        this.updatedAt = s.updated_at;
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    if (this.loadFailed()) return;
    this.saving.set(true);
    this.toast.set(null);
    this.serverError.set(null);

    const payload = this.form.getRawValue() as MarketplaceSettingsPayload;
    this.svc.updateSettings(payload).subscribe({
      next: (s: MarketplaceSettings) => {
        this.updatedAt = s.updated_at;
        this.saving.set(false);
        this.form.markAsPristine();
        this.showToast('success', 'admin.marketplaceSettings.saved');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.serverError.set(firstFieldError(err));
        this.showToast('error', 'admin.marketplaceSettings.saveFailed');
      },
    });
  }

  private showToast(kind: 'success' | 'error', msgKey: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ kind, msgKey });
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }

  fieldError(name: string): boolean {
    const c = this.form.get(name);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }
}
