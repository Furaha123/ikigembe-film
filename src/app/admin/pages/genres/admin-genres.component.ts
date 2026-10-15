import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdminGenre, AdminGenrePage, AdminGenresService, GenreStatusFilter,
} from '../../services/admin-genres.service';
import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { apiErrorMessage, firstFieldError } from '../../../shared/utils/api-error';

const PAGE_SIZE = 25;

/** A readable message for a failed genre call (`{ error }`, `{ name: [...] }`, or a fallback). */
export function genreErrorMessage(err: unknown, fallback: string): string {
  return apiErrorMessage(err) ?? firstFieldError(err) ?? fallback;
}

/**
 * Genre vocabulary (audited). Films keep their genre names; renaming rewrites them, deactivating hides a
 * genre from the catalog filter and the film editors, and only unused genres can be deleted.
 */
@Component({
  selector: 'app-admin-genres',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalBackdropDirective, AdminSectionTabsComponent],
  templateUrl: './admin-genres.component.html',
  styleUrls: ['../payments/admin-payments.component.scss', './admin-genres.component.scss'],
})
export class AdminGenresComponent implements OnInit {
  private readonly api = inject(AdminGenresService);

  q = '';
  status: GenreStatusFilter = '';
  page = 1;

  data = signal<AdminGenrePage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);

  // Create
  newName = '';
  newSortOrder: number | null = null;
  creating = signal(false);
  createError = signal<string | null>(null);

  // Edit dialog
  editing = signal<AdminGenre | null>(null);
  editName = '';
  editSortOrder = 0;
  saving = signal(false);
  editError = signal<string | null>(null);

  // Row actions
  busyId = signal<number | null>(null);
  rowError = signal<{ id: number; message: string } | null>(null);
  confirmDeleteId = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list({ q: this.q.trim(), status: this.status, page: this.page, page_size: PAGE_SIZE }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(genreErrorMessage(err, 'Could not load genres.'));
      },
    });
  }

  search(page = 1): void {
    this.page = page;
    this.load();
  }

  reset(): void {
    this.q = '';
    this.status = '';
    this.search();
  }

  create(): void {
    const name = this.newName.trim();
    if (!name) { this.createError.set('Enter a genre name.'); return; }
    this.creating.set(true);
    this.createError.set(null);
    this.notice.set(null);
    const order = this.newSortOrder;
    const body = order !== null && order !== undefined ? { name, sort_order: order } : { name };
    this.api.create(body).subscribe({
      next: (g) => {
        this.creating.set(false);
        this.newName = '';
        this.newSortOrder = null;
        this.notice.set(`Added "${g.name}".`);
        this.load();
      },
      error: (err: unknown) => {
        this.creating.set(false);
        this.createError.set(genreErrorMessage(err, 'Could not add this genre.'));
      },
    });
  }

  openEdit(genre: AdminGenre): void {
    this.editing.set(genre);
    this.editName = genre.name;
    this.editSortOrder = genre.sort_order;
    this.editError.set(null);
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  saveEdit(): void {
    const genre = this.editing();
    if (!genre) return;
    const name = this.editName.trim();
    if (!name) { this.editError.set('Enter a genre name.'); return; }
    const body: { name?: string; sort_order?: number } = {};
    if (name !== genre.name) body.name = name;
    if (this.editSortOrder !== genre.sort_order) body.sort_order = this.editSortOrder;
    if (!Object.keys(body).length) { this.closeEdit(); return; }
    this.saving.set(true);
    this.editError.set(null);
    this.api.update(genre.id, body).subscribe({
      next: (g) => {
        this.saving.set(false);
        this.replace(g);
        this.closeEdit();
        this.notice.set(body.name && g.film_count
          ? `Renamed to "${g.name}" on ${g.film_count} film${g.film_count === 1 ? '' : 's'}.`
          : `Saved "${g.name}".`);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.editError.set(genreErrorMessage(err, 'Could not save this genre.'));
      },
    });
  }

  toggleActive(genre: AdminGenre): void {
    this.busyId.set(genre.id);
    this.rowError.set(null);
    this.notice.set(null);
    this.api.update(genre.id, { is_active: !genre.is_active }).subscribe({
      next: (g) => {
        this.busyId.set(null);
        this.replace(g);
        this.notice.set(g.is_active
          ? `"${g.name}" is active again.`
          : `"${g.name}" is hidden from filters and film forms. Films keep it.`);
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.rowError.set({ id: genre.id, message: genreErrorMessage(err, 'Could not change this genre.') });
      },
    });
  }

  askDelete(genre: AdminGenre): void {
    this.rowError.set(null);
    this.confirmDeleteId.set(genre.id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  delete(genre: AdminGenre): void {
    this.busyId.set(genre.id);
    this.rowError.set(null);
    this.api.remove(genre.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirmDeleteId.set(null);
        this.notice.set(`Deleted "${genre.name}".`);
        this.load();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.confirmDeleteId.set(null);
        this.rowError.set({ id: genre.id, message: genreErrorMessage(err, 'Could not delete this genre.') });
      },
    });
  }

  private replace(genre: AdminGenre): void {
    this.data.update(d => d && { ...d, results: d.results.map(g => (g.id === genre.id ? genre : g)) });
  }
}
