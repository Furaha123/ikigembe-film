import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';
import { AdminMovie, FilmSubmissionItem } from '../../models/admin.interface';

type ActiveTab = 'submissions' | 'catalog';

@Component({
  selector: 'app-admin-movies',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-movies.component.html',
  styleUrl: './admin-movies.component.scss'
})
export class AdminMoviesComponent implements OnInit {
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
  submissions        = signal<FilmSubmissionItem[]>([]);
  submissionsLoading = signal(true);

  rejectSubmissionModal  = signal<FilmSubmissionItem | null>(null);
  rejectSubmissionReason = signal('');
  isRejectingSubmission  = signal(false);

  removeConfirmId = signal<number | null>(null);
  isRemoving      = signal(false);

  pendingCount = computed(() => this.submissions().filter(s => s.status === 'pending_admin_review').length);

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

  loadSubmissions() {
    this.submissionsLoading.set(true);
    this.adminService.getFilmSubmissions().subscribe({
      next: (data) => { this.submissions.set(data); this.submissionsLoading.set(false); },
      error: () => {
        this.submissions.set(MOCK_SUBMISSIONS);
        this.submissionsLoading.set(false);
      },
    });
  }

  // ── Submission actions ───────────────────────────────
  approveSubmission(id: number) {
    this.actionId.set(id);
    this.adminService.approveFilm(id).subscribe({
      next: () => {
        this.submissions.update(list => list.map(s => s.id === id ? { ...s, status: 'approved' as const } : s));
        this.actionId.set(null);
      },
      error: () => this.actionId.set(null),
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
    return 'Under Review';
  }

  statusClass(s: FilmSubmissionItem['status']): string {
    if (s === 'approved') return 'badge-approved';
    if (s === 'rejected') return 'badge-rejected';
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
