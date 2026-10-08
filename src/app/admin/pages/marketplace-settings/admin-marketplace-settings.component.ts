import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  AdminMarketplaceService, MarketplaceSettings, MarketplaceSettingsPayload,
} from '../../services/admin-marketplace.service';

@Component({
  selector: 'app-admin-marketplace-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './admin-marketplace-settings.component.html',
  styleUrl: './admin-marketplace-settings.component.scss',
})
export class AdminMarketplaceSettingsComponent implements OnInit, OnDestroy {
  private readonly svc = inject(AdminMarketplaceService);
  private readonly fb  = inject(FormBuilder);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  loading = signal(true);
  saving  = signal(false);
  toast   = signal<{ kind: 'success' | 'error'; msgKey: string } | null>(null);

  updatedAt: string | null = null;

  form = this.fb.group({
    actor_video_fee_under_30: [5000, [Validators.required, Validators.min(1)]],
    actor_video_fee_30_plus:  [10000, [Validators.required, Validators.min(1)]],
    casting_announcement_fee: [20000, [Validators.required, Validators.min(1)]],
    actor_search_fee:         [15000, [Validators.required, Validators.min(1)]],
    actor_search_access_days: [30, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    this.svc.getSettings().subscribe({
      next: (s: MarketplaceSettings) => {
        this.form.patchValue({
          actor_video_fee_under_30: s.actor_video_fee_under_30,
          actor_video_fee_30_plus:  s.actor_video_fee_30_plus,
          casting_announcement_fee: s.casting_announcement_fee,
          actor_search_fee:         s.actor_search_fee,
          actor_search_access_days: s.actor_search_access_days,
        });
        this.updatedAt = s.updated_at;
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'admin.marketplaceSettings.loadFailed');
      },
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.toast.set(null);

    const payload = this.form.getRawValue() as MarketplaceSettingsPayload;
    this.svc.updateSettings(payload).subscribe({
      next: (s: MarketplaceSettings) => {
        this.updatedAt = s.updated_at;
        this.saving.set(false);
        this.showToast('success', 'admin.marketplaceSettings.saved');
      },
      error: () => {
        this.saving.set(false);
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
