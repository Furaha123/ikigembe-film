import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AdminMoviesComponent } from './admin-movies.component';
import { AdminService } from '../../services/admin.service';
import { FilmLifecycleResult, FilmSubmissionItem } from '../../models/admin.interface';

const film = (over: Partial<FilmSubmissionItem> = {}): FilmSubmissionItem => ({
  id: 7, title: 'Umurage', producer_name: 'Aline', studio_name: null, submission_date: '2026-10-01',
  genre: 'Drama', duration_minutes: 95, status: 'approved', rejection_reason: null, thumbnail_url: null,
  lifecycle_status: 'unpublished', is_active: false, release_at: null, ...over,
});
const result = (over: Partial<FilmLifecycleResult> = {}): FilmLifecycleResult => ({
  id: 7, lifecycle_status: 'published', approval_status: 'approved', is_active: true,
  release_at: '2026-10-15T08:00:00Z', detail: '"Umurage" is published.', ...over,
});

describe('AdminMoviesComponent — publication', () => {
  let fixture: ComponentFixture<AdminMoviesComponent>;
  let c: AdminMoviesComponent;
  let api: jasmine.SpyObj<AdminService>;
  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = (row: number) =>
    Array.from(el().querySelectorAll('tbody tr')[row].querySelectorAll('button')).map(b => b.textContent!.trim());

  function setup(rows: FilmSubmissionItem[]) {
    api = jasmine.createSpyObj<AdminService>('AdminService', [
      'getMovies', 'getFilmSubmissions', 'scheduleFilm', 'publishFilm', 'unpublishFilm',
    ]);
    api.getMovies.and.returnValue(of([]));
    api.getFilmSubmissions.and.returnValue(of({ submissions: rows, total_results: rows.length, total_pages: 1 }));
    TestBed.configureTestingModule({
      imports: [AdminMoviesComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminService, useValue: api }],
    });
    fixture = TestBed.createComponent(AdminMoviesComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('shows the lifecycle badge and only the actions the status allows', () => {
    setup([
      film(),
      film({ id: 8, lifecycle_status: 'published', is_active: true }),
      film({ id: 9, lifecycle_status: 'scheduled', is_active: true, release_at: '2030-11-01T18:00:00Z' }),
      film({ id: 10, status: 'pending_review', lifecycle_status: 'in_review' }),
    ]);
    expect(el().querySelectorAll('app-film-status-badge').length).toBe(4);
    expect(el().querySelectorAll('tbody tr')[2].textContent).toContain('filmStatus.scheduled');
    expect(buttons(0)).toEqual(jasmine.arrayContaining(['admin.movies.lifecycle.publish', 'admin.movies.lifecycle.schedule']));
    expect(buttons(0)).not.toContain('admin.movies.lifecycle.unpublish');
    expect(buttons(1)).toContain('admin.movies.lifecycle.unpublish');
    expect(buttons(1)).not.toContain('admin.movies.lifecycle.publish');
    expect(buttons(2)).toEqual(jasmine.arrayContaining([
      'admin.movies.lifecycle.publish', 'admin.movies.lifecycle.reschedule', 'admin.movies.lifecycle.unpublish',
    ]));
    expect(buttons(3).some(b => b.startsWith('admin.movies.lifecycle.'))).toBeFalse();
  });

  it('falls back to the approval status for rows without lifecycle_status', () => {
    setup([film({ lifecycle_status: undefined, is_active: true })]);
    expect(c.lifecycleOf(c.submissions()[0])).toBe('published');
  });

  it('reloads page 1 with the chosen lifecycle filter', () => {
    setup([film()]);
    c.setLifecycleFilter('scheduled');
    expect(api.getFilmSubmissions).toHaveBeenCalledWith(1, 'scheduled');
    c.setLifecycleFilter('bogus');
    expect(api.getFilmSubmissions).toHaveBeenCalledWith(1, '');
  });

  it('publishes and updates the row from the API result', () => {
    setup([film()]);
    api.publishFilm.and.returnValue(of(result()));
    c.openLifecycle(c.submissions()[0], 'publish');
    c.confirmLifecycle();
    expect(api.publishFilm).toHaveBeenCalledWith(7);
    expect(c.submissions()[0].lifecycle_status).toBe('published');
    expect(c.submissions()[0].is_active).toBeTrue();
    expect(c.lifecycleDialog()).toBeNull();
    expect(c.lifecycleNotice()).toBe('"Umurage" is published.');
  });

  it('schedules in Kigali time and pre-fills a reschedule with the current release', () => {
    setup([film({ lifecycle_status: 'scheduled', is_active: true, release_at: '2030-11-01T18:00:00Z' })]);
    api.scheduleFilm.and.returnValue(of(result({ lifecycle_status: 'scheduled', release_at: '2030-11-02T18:00:00Z' })));
    c.openLifecycle(c.submissions()[0], 'schedule');
    expect(c.lifecycleWhen()).toBe('2030-11-01T20:00');
    c.lifecycleWhen.set('2030-11-02T20:00');
    c.confirmLifecycle();
    expect(api.scheduleFilm).toHaveBeenCalledWith(7, '2030-11-02T20:00:00+02:00');
    expect(c.submissions()[0].release_at).toBe('2030-11-02T18:00:00Z');
  });

  it('refuses an empty or past schedule time without calling the API', () => {
    setup([film()]);
    c.openLifecycle(c.submissions()[0], 'schedule');
    c.confirmLifecycle();
    expect(c.lifecycleError()?.key).toBe('admin.movies.lifecycle.whenRequired');
    c.lifecycleWhen.set('2020-01-01T10:00');
    c.confirmLifecycle();
    expect(c.lifecycleError()?.key).toBe('admin.movies.lifecycle.whenPast');
    expect(api.scheduleFilm).not.toHaveBeenCalled();
  });

  it('unpublishes with the trimmed reason', () => {
    setup([film({ lifecycle_status: 'published', is_active: true })]);
    api.unpublishFilm.and.returnValue(of(result({ lifecycle_status: 'unpublished', is_active: false })));
    c.openLifecycle(c.submissions()[0], 'unpublish');
    c.lifecycleReason.set('  Rights dispute  ');
    c.confirmLifecycle();
    expect(api.unpublishFilm).toHaveBeenCalledWith(7, 'Rights dispute');
    expect(c.submissions()[0].lifecycle_status).toBe('unpublished');
  });

  it('keeps the dialog open with the API message when the change is refused', () => {
    setup([film()]);
    api.publishFilm.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 409,
      error: { error: 'This film cannot be published yet. Missing: a poster (thumbnail).', code: 'missing_requirements' },
    })));
    c.openLifecycle(c.submissions()[0], 'publish');
    c.confirmLifecycle();
    fixture.detectChanges();
    expect(c.lifecycleDialog()).not.toBeNull();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Missing: a poster');
    expect(c.submissions()[0].lifecycle_status).toBe('unpublished');
  });
});
