import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminCmsService } from '../../services/admin-cms.service';
import { AD_PLACEMENTS, AdPlacement, AdminAd, AdminAdPayload } from '../../../shared/models/cms.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { CmsTabsComponent } from './cms-tabs.component';
import { fieldErrors } from './admin-cms-pages.component';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';

import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
/** Group validator: the campaign must end after it starts. */
export function endsAfterStarts(group: AbstractControl): ValidationErrors | null {
  const { starts_at, ends_at } = group.value as { starts_at: string; ends_at: string };
  if (!starts_at || !ends_at) return null;
  return new Date(ends_at).getTime() > new Date(starts_at).getTime() ? null : { endsBeforeStart: true };
}

const HTTP_URL = /^https?:\/\/\S+$/i;

/** `datetime-local` value (local time) for an ISO timestamp. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-admin-cms-ads',
  standalone: true,
  imports: [ModalBackdropDirective, CommonModule, ReactiveFormsModule, TranslatePipe, CmsTabsComponent, AdminSectionTabsComponent],
  templateUrl: './admin-cms-ads.component.html',
  styleUrls: ['../movies/admin-movies.component.scss', './admin-cms.scss'],
})
export class AdminCmsAdsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly cms = inject(AdminCmsService);

  readonly placements = AD_PLACEMENTS;

  ads          = signal<AdminAd[]>([]);
  loading      = signal(true);
  error        = signal<string | null>(null);
  editorOpen   = signal(false);
  editing      = signal<AdminAd | null>(null);
  creative     = signal<File | null>(null);
  creativeError = signal<string | null>(null);
  saving       = signal(false);
  saveError    = signal<string | null>(null);
  fieldErrs    = signal<Record<string, string>>({});
  confirmDelete = signal<AdminAd | null>(null);

  form = this.fb.nonNullable.group({
    name:       ['', [Validators.required, Validators.maxLength(255)]],
    target_url: ['', [Validators.required, Validators.pattern(HTTP_URL), Validators.maxLength(500)]],
    placement:  ['home_banner' as AdPlacement, Validators.required],
    starts_at:  ['', Validators.required],
    ends_at:    ['', Validators.required],
    is_active:  [true],
    priority:   [0, [Validators.required, Validators.min(0), Validators.max(32767)]],
  }, { validators: endsAfterStarts });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.cms.listAds().subscribe({
      next: (list) => { this.ads.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'admin.cms.loadFailed');
      },
    });
  }

  openNew(): void {
    this.editing.set(null);
    this.form.reset({ name: '', target_url: '', placement: 'home_banner', starts_at: '', ends_at: '', is_active: true, priority: 0 });
    this.openEditor();
  }

  edit(ad: AdminAd): void {
    this.editing.set(ad);
    this.form.reset({
      name: ad.name, target_url: ad.target_url, placement: ad.placement,
      starts_at: toLocalInput(ad.starts_at), ends_at: toLocalInput(ad.ends_at),
      is_active: ad.is_active, priority: ad.priority,
    });
    this.openEditor();
  }

  closeEditor(): void {
    this.editorOpen.set(false);
  }

  onCreative(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file && !file.type.startsWith('image/')) {
      this.creative.set(null);
      this.creativeError.set('admin.cms.creativeImage');
      return;
    }
    this.creativeError.set(null);
    this.creative.set(file);
  }

  save(): void {
    this.form.markAllAsTouched();
    const isNew = !this.editing();
    if (isNew && !this.creative()) this.creativeError.set('admin.cms.creativeRequired');
    if (this.form.invalid || (isNew && !this.creative()) || this.saving()) return;

    const v = this.form.getRawValue();
    const payload: AdminAdPayload = {
      ...v,
      name: v.name.trim(),
      target_url: v.target_url.trim(),
      starts_at: new Date(v.starts_at).toISOString(),
      ends_at: new Date(v.ends_at).toISOString(),
      creative: this.creative(),
    };
    const current = this.editing();
    const req = current ? this.cms.updateAd(current.id, payload) : this.cms.createAd(payload);

    this.saving.set(true);
    this.saveError.set(null);
    this.fieldErrs.set({});
    req.subscribe({
      next: () => { this.saving.set(false); this.editorOpen.set(false); this.load(); },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const fe = fieldErrors(err);
        this.fieldErrs.set(fe);
        if (!Object.keys(fe).length) this.saveError.set(apiErrorMessage(err) ?? 'admin.cms.saveFailed');
      },
    });
  }

  remove(): void {
    const ad = this.confirmDelete();
    if (!ad) return;
    this.cms.deleteAd(ad.id).subscribe({
      next: () => { this.confirmDelete.set(null); this.load(); },
      error: (err: HttpErrorResponse) => {
        this.confirmDelete.set(null);
        this.error.set(apiErrorMessage(err) ?? 'admin.cms.deleteFailed');
      },
    });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  private openEditor(): void {
    this.creative.set(null);
    this.creativeError.set(null);
    this.saveError.set(null);
    this.fieldErrs.set({});
    this.editorOpen.set(true);
  }
}
