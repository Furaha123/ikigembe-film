import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminCmsService } from '../../services/admin-cms.service';
import { CmsPageBodyComponent } from '../../../shared/components/cms-page-body/cms-page-body.component';
import { AdminCmsPage, AdminCmsPagePayload } from '../../../shared/models/cms.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { CmsTabsComponent } from './cms-tabs.component';

/** Lowercase letters, numbers and single hyphens (e.g. `terms`, `privacy-rw`). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** DRF `{ field: ["msg"] }` → `{ field: "msg" }`. */
export function fieldErrors(err: HttpErrorResponse): Record<string, string> {
  const out: Record<string, string> = {};
  const body: unknown = err.error;
  if (body && typeof body === 'object' && !('error' in body)) {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      out[k] = Array.isArray(v) ? String(v[0]) : String(v);
    }
  }
  return out;
}

@Component({
  selector: 'app-admin-cms-pages',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, CmsPageBodyComponent, CmsTabsComponent],
  templateUrl: './admin-cms-pages.component.html',
  styleUrls: ['../movies/admin-movies.component.scss', './admin-cms.scss'],
})
export class AdminCmsPagesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly cms = inject(AdminCmsService);

  pages       = signal<AdminCmsPage[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);
  editorOpen  = signal(false);
  editingId   = signal<number | null>(null);
  preview     = signal(false);
  saving      = signal(false);
  saveError   = signal<string | null>(null);
  fieldErrs   = signal<Record<string, string>>({});
  confirmDelete = signal<AdminCmsPage | null>(null);

  form = this.fb.nonNullable.group({
    slug:         ['', [Validators.required, Validators.maxLength(100), Validators.pattern(SLUG_PATTERN)]],
    title:        ['', [Validators.required, Validators.maxLength(255)]],
    body:         [''],
    is_published: [false],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.cms.listPages().subscribe({
      next: (list) => { this.pages.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'admin.cms.loadFailed');
      },
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ slug: '', title: '', body: '', is_published: false });
    this.openEditor();
  }

  edit(p: AdminCmsPage): void {
    this.editingId.set(p.id);
    this.form.reset({ slug: p.slug, title: p.title, body: p.body, is_published: p.is_published });
    this.openEditor();
  }

  closeEditor(): void {
    this.editorOpen.set(false);
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const payload: AdminCmsPagePayload = { ...v, slug: v.slug.trim().toLowerCase(), title: v.title.trim() };
    const id = this.editingId();
    const req = id ? this.cms.updatePage(id, payload) : this.cms.createPage(payload);

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
    const p = this.confirmDelete();
    if (!p) return;
    this.cms.deletePage(p.id).subscribe({
      next: () => { this.confirmDelete.set(null); this.load(); },
      error: (err: HttpErrorResponse) => {
        this.confirmDelete.set(null);
        this.error.set(apiErrorMessage(err) ?? 'admin.cms.deleteFailed');
      },
    });
  }

  invalid(name: 'slug' | 'title'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  private openEditor(): void {
    this.preview.set(false);
    this.saveError.set(null);
    this.fieldErrs.set({});
    this.editorOpen.set(true);
  }
}
