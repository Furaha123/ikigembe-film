import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, Subject, interval } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { AdminService } from '../../services/admin.service';
import { AdminMovie, FilmLifecycleResult, FilmSubmissionItem } from '../../models/admin.interface';
import { FilmStatusBadgeComponent } from '../../../shared/components/film-status-badge/film-status-badge.component';
import { ErrorReferenceComponent } from '../../../shared/components/error-reference/error-reference.component';
import {
  kigaliInputToIso, kigaliInputValue, LIFECYCLE_STATUSES, LifecycleStatus, lifecycleFromApproval, lifecycleLabelKey,
} from '../../../shared/utils/film-status';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { RevenueSharesDialogComponent } from '../../shared/components/revenue-shares/revenue-shares-dialog.component';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';

import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
type ActiveTab = 'submissions' | 'catalog';
type LifecycleAction = 'schedule' | 'publish' | 'unpublish';

@Component({
  selector: 'app-admin-movies',
  imports: [ModalBackdropDirective, CommonModule, ReactiveFormsModule, TranslatePipe, VideoPlayerComponent, RevenueSharesDialogComponent, AdminSectionTabsComponent, FilmStatusBadgeComponent, ErrorReferenceComponent],
  templateUrl: './admin-movies.component.html',
  styleUrl: './admin-movies.component.scss'
})
export class AdminMoviesComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  goToCreate() { this.router.navigate(['/admin/movies/create']); }
  goToEdit(id: number) { this.router.navigate(['/admin/movies/edit', id]); }

  activeTab = signal<ActiveTab>('submissions');

  // ── Catalog (existing) ──────────────────────────────
  movies    = signal<AdminMovie[]>([]);
  isLoading = signal(true);
  actionId  = signal<number | null>(null);
  confirmDelete = signal<number | null>(null);

  // ── Submissions ─────────────────────────────────────
  submissions          = signal<FilmSubmissionItem[]>([]);
  submissionsLoading   = signal(true);
  submissionsError     = signal(false);
  submissionsPage      = signal(1);
  submissionsTotalPages = signal(1);
  submissionsTotalCount = signal(0);

  rejectSubmissionModal  = signal<FilmSubmissionItem | null>(null);
  rejectSubmissionReason = signal('');
  isRejectingSubmission  = signal(false);

  removeConfirmId = signal<number | null>(null);
  isRemoving      = signal(false);

  pendingCount = computed(() => this.submissions().filter(s => s.status === 'pending_review' || s.status === 'pending_admin_review').length);

  selectedSubmission = signal<FilmSubmissionItem | null>(null);

  // ── Publication (lifecycle) ─────────────────────────
  readonly lifecycleStatuses = LIFECYCLE_STATUSES;
  readonly lifecycleLabelKey = lifecycleLabelKey;
  lifecycleFilter  = signal<LifecycleStatus | ''>('');
  lifecycleDialog  = signal<{ film: FilmSubmissionItem; action: LifecycleAction } | null>(null);
  lifecycleWhen    = signal('');
  lifecycleReason  = signal('');
  lifecycleBusy    = signal(false);
  lifecycleError   = signal<{ text: string | null; key: string; err: unknown } | null>(null);
  /** The API's confirmation of the last change ("… is scheduled for 1 Nov 2026 at 20:00 (Kigali time)."). */
  lifecycleNotice  = signal<string | null>(null);

  // ── HLS status polling ───────────────────────────────
  private readonly pollingStop$ = new Subject<void>();

  // ── Inline video player ──────────────────────────────
  isWatching   = signal(false);
  watchSrc     = signal('');
  watchPoster  = signal('');
  watchTitle   = signal('');
  watchLoading = signal<number | null>(null);
  watchError   = signal<string | null>(null);

  // ── Revenue splits (per film) ────────────────────────
  revenueMovie = signal<AdminMovie | null>(null);

  // ── Request Changes ──────────────────────────────────
  requestChangesModal  = signal<FilmSubmissionItem | null>(null);
  requestChangesNote   = signal('');
  isRequestingChanges  = signal(false);
  requestChangesError  = signal<string | null>(null);

  openSubmissionDetail(s: FilmSubmissionItem): void {
    this.selectedSubmission.set(s);
    this.watchError.set(null);
    if (s.hls_status === 'processing') {
      this.startPolling(s.id);
    }
  }

  closeSubmissionDetail(): void {
    this.pollingStop$.next();
    this.watchError.set(null);
    this.selectedSubmission.set(null);
  }

  private startPolling(id: number): void {
    this.pollingStop$.next(); // cancel any existing poll first

    interval(10_000).pipe(
      switchMap(() => this.adminService.getFilmHlsStatus(id)),
      takeUntil(this.pollingStop$),
    ).subscribe({
      next: (res) => {
        // hls_url is a tokenised, expiring URL — don't keep it; watchFilm() fetches a fresh one.
        const patch = { hls_status: res.hls_status, hls_error_message: res.hls_error_message };

        this.submissions.update(list =>
          list.map(s => s.id === id ? { ...s, ...patch } : s)
        );

        const sel = this.selectedSubmission();
        if (sel?.id === id) {
          this.selectedSubmission.set({ ...sel, ...patch });
        }

        if (res.hls_status === 'ready' || res.hls_status === 'failed') {
          this.pollingStop$.next();
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.pollingStop$.next();
    this.pollingStop$.complete();
  }

  form = this.fb.group({
    title:           ['', Validators.required],
    producer:        ['', Validators.required],
    duration_minutes:[0, [Validators.required, Validators.min(1)]],
    price:           [0, [Validators.required, Validators.min(0)]],
    release_date:    ['', Validators.required],
    trailer_url:     [''],
  });

  ngOnInit() {
    this.loadMovies();
    this.loadSubmissions();
  }

  loadMovies() {
    this.isLoading.set(true);
    this.adminService.getMovies().subscribe({
      next: (data) => { this.movies.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  loadSubmissions(page = 1) {
    this.submissionsLoading.set(true);
    this.submissionsError.set(false);
    this.adminService.getFilmSubmissions(page, this.lifecycleFilter()).subscribe({
      next: ({ submissions, total_results, total_pages }) => {
        this.submissions.set(submissions);
        this.submissionsPage.set(page);
        this.submissionsTotalPages.set(total_pages);
        this.submissionsTotalCount.set(total_results);
        this.submissionsLoading.set(false);
      },
      error: () => {
        // Show the failure instead of pretending there are no (or fake) submissions.
        this.submissions.set([]);
        this.submissionsError.set(true);
        this.submissionsLoading.set(false);
      },
    });
  }

  prevSubmissionsPage() {
    if (this.submissionsPage() > 1) this.loadSubmissions(this.submissionsPage() - 1);
  }

  nextSubmissionsPage() {
    if (this.submissionsPage() < this.submissionsTotalPages()) this.loadSubmissions(this.submissionsPage() + 1);
  }

  setLifecycleFilter(value: string) {
    this.lifecycleFilter.set((LIFECYCLE_STATUSES as readonly string[]).includes(value) ? value as LifecycleStatus : '');
    this.loadSubmissions(1);
  }

  /** From the API; rows from an older API fall back to the approval status. */
  lifecycleOf(s: FilmSubmissionItem): LifecycleStatus {
    return s.lifecycle_status ?? lifecycleFromApproval(s.status, s.is_active);
  }

  // The API has the final say (approval, required assets, already released); these only pick the buttons.
  canPublish(s: FilmSubmissionItem): boolean {
    return s.status === 'approved' && this.lifecycleOf(s) !== 'published';
  }

  canSchedule(s: FilmSubmissionItem): boolean {
    const lc = this.lifecycleOf(s);
    return s.status === 'approved' && (lc === 'scheduled' || lc === 'unpublished');
  }

  canUnpublish(s: FilmSubmissionItem): boolean {
    const lc = this.lifecycleOf(s);
    return lc === 'scheduled' || lc === 'published';
  }

  /** Earliest value for the schedule field: now, in Kigali time. */
  scheduleMin(): string { return kigaliInputValue(new Date()); }

  openLifecycle(film: FilmSubmissionItem, action: LifecycleAction) {
    this.lifecycleDialog.set({ film, action });
    this.lifecycleWhen.set(action === 'schedule' && this.lifecycleOf(film) === 'scheduled' ? kigaliInputValue(film.release_at) : '');
    this.lifecycleReason.set('');
    this.lifecycleError.set(null);
  }

  closeLifecycle() {
    if (this.lifecycleBusy()) return;
    this.lifecycleDialog.set(null);
  }

  confirmLifecycle() {
    const dialog = this.lifecycleDialog();
    if (!dialog || this.lifecycleBusy()) return;
    const { film, action } = dialog;
    let request: Observable<FilmLifecycleResult>;
    if (action === 'schedule') {
      const releaseAt = kigaliInputToIso(this.lifecycleWhen());
      if (!releaseAt) {
        this.lifecycleError.set({ text: null, key: 'admin.movies.lifecycle.whenRequired', err: null });
        return;
      }
      if (new Date(releaseAt).getTime() <= Date.now()) {
        this.lifecycleError.set({ text: null, key: 'admin.movies.lifecycle.whenPast', err: null });
        return;
      }
      request = this.adminService.scheduleFilm(film.id, releaseAt);
    } else if (action === 'publish') {
      request = this.adminService.publishFilm(film.id);
    } else {
      request = this.adminService.unpublishFilm(film.id, this.lifecycleReason().trim());
    }
    this.lifecycleBusy.set(true);
    this.lifecycleError.set(null);
    request.subscribe({
      next: (res) => {
        this.applyLifecycle(res);
        this.lifecycleNotice.set(res.detail || null);
        this.lifecycleBusy.set(false);
        this.lifecycleDialog.set(null);
      },
      error: (err) => {
        this.lifecycleBusy.set(false);
        this.lifecycleError.set({ text: apiErrorMessage(err), key: 'admin.movies.lifecycle.failed', err });
      },
    });
  }

  private applyLifecycle(res: FilmLifecycleResult) {
    const patch = (s: FilmSubmissionItem): FilmSubmissionItem => s.id !== res.id ? s : {
      ...s, lifecycle_status: res.lifecycle_status, status: res.approval_status, is_active: res.is_active, release_at: res.release_at,
    };
    this.submissions.update(list => list.map(patch));
    const sel = this.selectedSubmission();
    if (sel) this.selectedSubmission.set(patch(sel));
  }

  canWatchFilm(s: FilmSubmissionItem): boolean {
    return s.hls_status === 'ready';
  }

  isProcessingStuck(s: FilmSubmissionItem): boolean {
    if (s.hls_status !== 'processing') return false;
    const submittedMs = new Date(s.submission_date).getTime();
    return (Date.now() - submittedMs) > 24 * 60 * 60 * 1000;
  }

  processingHoursElapsed(s: FilmSubmissionItem): number {
    const submittedMs = new Date(s.submission_date).getTime();
    return Math.floor((Date.now() - submittedMs) / (1000 * 60 * 60));
  }

  watchDisabledReason(s: FilmSubmissionItem): string {
    if (s.hls_status === 'processing')   return 'admin.movies.watchDisabled.processing';
    if (s.hls_status === 'failed')       return 'admin.movies.watchDisabled.failed';
    if (s.hls_status === 'not_started')  return 'admin.movies.watchDisabled.notStarted';
    return '';
  }

  hlsStatusLabel(status: string): string {
    const map: Record<string, string> = {
      not_started: 'admin.movies.hls.notStarted',
      processing:  'admin.movies.hls.processing',
      ready:       'admin.movies.hls.ready',
      failed:      'admin.movies.hls.failed',
    };
    return map[status] ?? status;
  }

  watchFilm(s: FilmSubmissionItem, type: 'full' | 'trailer'): void {
    if (type === 'trailer') {
      if (!s.trailer_url) return;
      this.openPlayer(s.trailer_url, s.thumbnail_url ?? '', this.translate.instant('admin.movies.trailerTitle', { title: s.title }));
      return;
    }

    // Always fetch a fresh tokenised URL — never reuse one from the list or a previous open.
    this.watchLoading.set(s.id);
    this.watchError.set(null);
    this.adminService.getFilmHlsStatus(s.id).subscribe({
      next: (res) => {
        this.watchLoading.set(null);
        this.submissions.update(list => list.map(i =>
          i.id === s.id ? { ...i, hls_status: res.hls_status, hls_error_message: res.hls_error_message } : i
        ));
        if (res.hls_url) {
          this.openPlayer(res.hls_url, s.thumbnail_url ?? '', s.title);
        } else {
          this.watchError.set('admin.movies.errors.notAvailable');
        }
      },
      error: () => {
        this.watchLoading.set(null);
        this.watchError.set('admin.movies.errors.loadVideo');
      },
    });
  }

  private openPlayer(src: string, poster: string, title: string): void {
    this.watchSrc.set(src);
    this.watchPoster.set(poster);
    this.watchTitle.set(title);
    this.isWatching.set(true);
  }

  closeWatchOverlay(): void {
    this.isWatching.set(false);
    this.watchSrc.set('');
  }

  // ── Submission actions ───────────────────────────────
  approveSubmission(id: number) {
    this.actionId.set(id);
    this.adminService.approveFilm(id).subscribe({
      next: (res) => {
        const newStatus = res?.approval_status ?? 'approved';
        this.submissions.update(list => list.map(s =>
          s.id === id ? { ...s, status: newStatus } : s
        ));
        this.actionId.set(null);
      },
      error: () => this.actionId.set(null),
    });
  }

  openRequestChanges(film: FilmSubmissionItem) {
    this.requestChangesModal.set(film);
    this.requestChangesNote.set('');
    this.requestChangesError.set(null);
  }

  closeRequestChanges() { this.requestChangesModal.set(null); }

  confirmRequestChanges() {
    const film = this.requestChangesModal();
    if (!film || this.requestChangesNote().trim().length < 10) return;
    this.isRequestingChanges.set(true);
    this.requestChangesError.set(null);
    this.adminService.requestChanges(film.id, this.requestChangesNote()).subscribe({
      next: () => {
        this.submissions.update(list => list.map(s =>
          s.id === film.id ? { ...s, status: 'changes_requested' as const } : s
        ));
        this.isRequestingChanges.set(false);
        this.closeRequestChanges();
        this.closeSubmissionDetail();
      },
      error: (err) => {
        this.isRequestingChanges.set(false);
        this.requestChangesError.set(err?.error?.detail ?? 'admin.movies.errors.requestChanges');
      },
    });
  }

  openRejectSubmission(film: FilmSubmissionItem) {
    this.rejectSubmissionModal.set(film);
    this.rejectSubmissionReason.set('');
  }

  closeRejectSubmission() { this.rejectSubmissionModal.set(null); }

  confirmRejectSubmission() {
    const film = this.rejectSubmissionModal();
    if (!film) return;
    this.isRejectingSubmission.set(true);
    this.adminService.rejectFilm(film.id, this.rejectSubmissionReason()).subscribe({
      next: () => {
        this.submissions.update(list => list.map(s =>
          s.id === film.id ? { ...s, status: 'rejected' as const, rejection_reason: this.rejectSubmissionReason() } : s
        ));
        this.isRejectingSubmission.set(false);
        this.closeRejectSubmission();
      },
      error: () => this.isRejectingSubmission.set(false),
    });
  }

  openRemoveConfirm(id: number) { this.removeConfirmId.set(id); }
  cancelRemove() { this.removeConfirmId.set(null); }

  confirmRemove() {
    const id = this.removeConfirmId();
    if (id === null) return;
    this.isRemoving.set(true);
    this.adminService.removeFilm(id).subscribe({
      next: () => {
        this.submissions.update(list => list.filter(s => s.id !== id));
        this.movies.update(list => list.filter(m => m.id !== id));
        this.isRemoving.set(false);
        this.removeConfirmId.set(null);
      },
      error: () => this.isRemoving.set(false),
    });
  }

  // ── Catalog actions ──────────────────────────────────
  toggleFeatured(movie: AdminMovie, event: Event): void {
    event.stopPropagation();
    const next = !movie.is_featured;
    this.adminService.featureMovie(movie.id, next).subscribe({
      next: () => this.movies.update(list =>
        list.map(m => m.id === movie.id ? { ...m, is_featured: next } : m)
      ),
    });
  }

  confirmDeleteMovie(id: number) { this.confirmDelete.set(id); }
  cancelDelete() { this.confirmDelete.set(null); }

  deleteMovie(id: number) {
    this.actionId.set(id);
    this.adminService.deleteMovie(id).subscribe({
      next: () => {
        this.movies.update(list => list.filter(m => m.id !== id));
        this.actionId.set(null);
        this.confirmDelete.set(null);
      },
      error: () => this.actionId.set(null),
    });
  }

  formatDuration(minutes: number): string {
    if (minutes <= 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
