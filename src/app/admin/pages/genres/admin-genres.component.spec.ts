import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AdminGenresComponent, genreErrorMessage } from './admin-genres.component';
import { AdminGenre, AdminGenrePage, AdminGenresService } from '../../services/admin-genres.service';

const genre = (over: Partial<AdminGenre> = {}): AdminGenre => ({
  id: 1, name: 'Drama', slug: 'drama', is_active: true, sort_order: 0, film_count: 2,
  created_at: '2026-10-14T10:00:00Z', updated_at: '2026-10-14T10:00:00Z', ...over,
});
const page = (results: AdminGenre[]): AdminGenrePage => ({
  page: 1, page_size: 25, total_results: results.length, total_pages: 1, results,
});
const conflict = (body: object) => new HttpErrorResponse({ status: 409, error: body });

describe('AdminGenresComponent', () => {
  let fixture: ComponentFixture<AdminGenresComponent>;
  let component: AdminGenresComponent;
  let api: jasmine.SpyObj<AdminGenresService>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    api = jasmine.createSpyObj<AdminGenresService>('AdminGenresService', ['list', 'create', 'update', 'remove']);
    api.list.and.returnValue(of(page([genre(), genre({ id: 2, name: 'Old', slug: 'old', is_active: false, film_count: 0 })])));
    TestBed.configureTestingModule({
      imports: [AdminGenresComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminGenresService, useValue: api }],
    });
    fixture = TestBed.createComponent(AdminGenresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lists genres with status and film counts', () => {
    expect(api.list).toHaveBeenCalledWith({ q: '', status: '', page: 1, page_size: 25 });
    const rows = el().querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Drama');
    expect(rows[0].textContent).toContain('Active');
    expect(rows[1].textContent).toContain('Inactive');
  });

  it('searches with the filters', () => {
    component.q = ' dra ';
    component.status = 'active';
    component.search();
    expect(api.list).toHaveBeenCalledWith({ q: 'dra', status: 'active', page: 1, page_size: 25 });
  });

  it('shows a load error with retry', () => {
    api.list.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500, error: { error: 'Boom' } })));
    component.load();
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Boom');
  });

  it('creates a genre and reports duplicates', () => {
    component.newName = '';
    component.create();
    expect(component.createError()).toBe('Enter a genre name.');
    expect(api.create).not.toHaveBeenCalled();

    api.create.and.returnValue(throwError(() => conflict({ error: 'A genre called "Drama" already exists.', code: 'genre_exists' })));
    component.newName = 'drama';
    component.create();
    expect(component.createError()).toContain('already exists');

    api.create.and.returnValue(of(genre({ id: 3, name: 'Horror', film_count: 0 })));
    component.newName = 'Horror';
    component.newSortOrder = 4;
    component.create();
    expect(api.create).toHaveBeenCalledWith({ name: 'Horror', sort_order: 4 });
    expect(component.notice()).toBe('Added "Horror".');
    expect(component.newName).toBe('');
  });

  it('renames through the edit dialog and sends only what changed', () => {
    api.update.and.returnValue(of(genre({ name: 'Family Drama' })));
    component.openEdit(component.data()!.results[0]);
    component.editName = 'Family Drama';
    component.saveEdit();
    expect(api.update).toHaveBeenCalledWith(1, { name: 'Family Drama' });
    expect(component.editing()).toBeNull();
    expect(component.notice()).toBe('Renamed to "Family Drama" on 2 films.');
    expect(component.data()!.results[0].name).toBe('Family Drama');
  });

  it('toggles active state', () => {
    api.update.and.returnValue(of(genre({ is_active: false })));
    component.toggleActive(component.data()!.results[0]);
    expect(api.update).toHaveBeenCalledWith(1, { is_active: false });
    expect(component.data()!.results[0].is_active).toBeFalse();
    expect(component.notice()).toContain('Films keep it');
  });

  it('explains why a genre in use cannot be deleted', () => {
    api.remove.and.returnValue(throwError(() => conflict({
      error: '2 film(s) use "Drama". Deactivate it instead to hide it from filters.', code: 'genre_in_use', film_count: 2,
    })));
    const drama = component.data()!.results[0];
    component.askDelete(drama);
    expect(component.confirmDeleteId()).toBe(1);
    component.delete(drama);
    fixture.detectChanges();
    expect(component.rowError()).toEqual({ id: 1, message: '2 film(s) use "Drama". Deactivate it instead to hide it from filters.' });
    expect(el().textContent).toContain('Deactivate it instead');
  });

  it('maps field errors and falls back', () => {
    expect(genreErrorMessage(new HttpErrorResponse({ status: 400, error: { name: ['Use at most 60 characters.'] } }), 'x'))
      .toBe('Use at most 60 characters.');
    expect(genreErrorMessage(new Error('?'), 'fallback')).toBe('fallback');
  });
});
