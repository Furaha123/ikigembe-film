import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { AdminService } from '../../services/admin.service';
import { AdminMovie, FilmSubmissionItem } from '../../models/admin.interface';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';

type ActiveTab = 'submissions' | 'catalog';

@Component({
  selector: 'app-admin-movies',
  imports: [CommonModule, ReactiveFormsModule, VideoPlayerComponent],
  templateUrl: './admin-movies.component.html',
  styleUrl: './admin-movies.component.scss'
})
export class AdminMoviesComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

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

  // ── HLS status polling ───────────────────────────────
  private readonly pollingStop$ = new Subject<void>();

  // ── Inline video player ──────────────────────────────
  isWatching   = signal(false);
  watchSrc     = signal('');
  watchPoster  = signal('');
  watchTitle   = signal('');
  watchLoading = signal<number | null>(null);
  watchError   = signal<string | null>(null);

  // ── Per-film reviewer notes (pre-fill rejection reason) ──
  notesMap = signal<Map<number, string>>(new Map());

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
        const patch = { hls_status: res.hls_status, hls_url: res.hls_url };

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
    this.adminService.getFilmSubmissions(page).subscribe({
      next: ({ submissions, total_results, total_pages }) => {
        this.submissions.set(submissions);
        this.submissionsPage.set(page);
        this.submissionsTotalPages.set(total_pages);
        this.submissionsTotalCount.set(total_results);
        this.submissionsLoading.set(false);
      },
      error: () => {
        this.submissions.set(MOCK_SUBMISSIONS);
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

  // ── Reviewer notes ───────────────────────────────────
  getNote(id: number): string { return this.notesMap().get(id) ?? ''; }

  setNote(id: number, text: string): void {
    this.notesMap.update(m => { const n = new Map(m); n.set(id, text); return n; });
  }

  canWatchFilm(s: FilmSubmissionItem): boolean {
    return s.hls_status !== 'processing';
  }

  watchFilm(s: FilmSubmissionItem, type: 'full' | 'trailer'): void {
    if (type === 'trailer') {
      if (!s.trailer_url) return;
      this.openPlayer(s.trailer_url, s.thumbnail_url ?? '', `${s.title} — Trailer`);
      return;
    }

    const cached = s.hls_url ?? s.video_url;
    if (cached) {
      this.openPlayer(cached, s.thumbnail_url ?? '', s.title);
      return;
    }

    this.watchLoading.set(s.id);
    this.watchError.set(null);
    this.adminService.getFilmHlsStatus(s.id).subscribe({
      next: (res) => {
        this.watchLoading.set(null);
        this.submissions.update(list => list.map(i =>
          i.id === s.id ? { ...i, hls_status: res.hls_status, hls_url: res.hls_url } : i
        ));
        if (res.hls_url) {
          this.openPlayer(res.hls_url, s.thumbnail_url ?? '', s.title);
        } else {
          this.watchError.set('No video available for this film yet.');
        }
      },
      error: () => {
        this.watchLoading.set(null);
        this.watchError.set('Could not load video. Please try again.');
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
      next: (res: any) => {
        const newStatus = res?.approval_status ?? 'approved';
        this.submissions.update(list => list.map(s =>
          s.id === id ? { ...s, status: newStatus } : s
        ));
        this.actionId.set(null);
      },
      error: () => this.actionId.set(null),
    });
  }

  openRejectSubmission(film: FilmSubmissionItem) {
    this.rejectSubmissionModal.set(film);
    this.rejectSubmissionReason.set(this.getNote(film.id));
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

  statusLabel(s: FilmSubmissionItem['status']): string {
    if (s === 'approved') return 'Approved';
    if (s === 'rejected') return 'Rejected';
    if (s === 'approved_pending_contract') return 'Pending Contract';
    return 'Under Review'; // pending_review | pending_admin_review
  }

  statusClass(s: FilmSubmissionItem['status']): string {
    if (s === 'approved') return 'badge-approved';
    if (s === 'rejected') return 'badge-rejected';
    if (s === 'approved_pending_contract') return 'badge-contract';
    return 'badge-review';
  }

  formatDuration(minutes: number): string {
    if (minutes <= 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}

const MOCK_SUBMISSIONS: FilmSubmissionItem[] = [
  { id: 101, title: 'The Red Hills', producer_name: 'Amahoro Jean', studio_name: 'Kigali Studio', submission_date: '2025-05-01', genre: 'Drama', duration_minutes: 95, status: 'pending_admin_review', rejection_reason: null, thumbnail_url: null },
  { id: 102, title: 'Lagos Summer', producer_name: 'Chidi Okafor', studio_name: 'Lagos Films', submission_date: '2025-04-20', genre: 'Comedy', duration_minutes: 110, status: 'pending_admin_review', rejection_reason: null, thumbnail_url: null },
  { id: 103, title: 'Nairobi Nights', producer_name: 'Wanjiru Kamau', studio_name: null, submission_date: '2025-04-15', genre: 'Thriller', duration_minutes: 85, status: 'approved', rejection_reason: null, thumbnail_url: null },
  { id: 104, title: 'Sahara Dreams', producer_name: 'Fatima Diallo', studio_name: 'Dakar Creatives', submission_date: '2025-03-30', genre: 'Documentary', duration_minutes: 70, status: 'rejected', rejection_reason: 'Copyright document missing.', thumbnail_url: null },
];
