import { Component, inject, OnInit, OnDestroy, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProducerService, ProducerMovie } from '../../services/producer.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { ALLOWED_VIDEO_EXTENSIONS, extensionList, hasAllowedExtension, VIDEO_ACCEPT } from '../../../shared/models/upload.constants';
import { uploadErrorMessage } from '../../../shared/utils/upload-error';
import { apiErrorMessage } from '../../../shared/utils/api-error';

type SortCol = 'title' | 'views' | 'price' | 'release_date' | 'created_at';
type StatusTab = 'all' | 'live' | 'pending' | 'rejected';

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western',
];


@Component({
  selector: 'app-producer-movies',
  imports: [TranslatePipe, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './producer-movies.component.html',
  styleUrl: './producer-movies.component.scss',
})
export class ProducerMoviesComponent implements OnInit, OnDestroy {
  private readonly producerService = inject(ProducerService);
  private readonly uploader        = inject(MultipartUploadService);
  private readonly fb              = inject(FormBuilder);
  private readonly router          = inject(Router);
  private readonly platformId      = inject(PLATFORM_ID);
  private readonly translate       = inject(TranslateService);
  readonly videoAccept             = VIDEO_ACCEPT;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  readonly ALL_GENRES = ALL_GENRES;

  movies       = signal<ProducerMovie[]>([]);
  copiedMovieId = signal<number | null>(null);
  isLoading = signal(true);
  search    = signal('');
  activeTab = signal<StatusTab>('all');
  sortCol   = signal<SortCol>('created_at');
  sortDir   = signal<'asc' | 'desc'>('desc');

  // ── Edit modal ────────────────────────────────────────
  editMovie        = signal<ProducerMovie | null>(null);
  expandedReasons  = signal<Set<number>>(new Set());
  isSaving    = signal(false);
  saveError   = signal<string | null>(null);
  /** Backend message for a failed save, shown instead of the generic key when present. */
  saveErrorText = signal<string | null>(null);
  editGenres  = signal<Set<string>>(new Set());

  editForm = this.fb.group({
    title:            ['', [Validators.required, Validators.minLength(2)]],
    overview:         [''],
  });

  // ── Resubmit drawer ───────────────────────────────────
  resubmitMovie        = signal<ProducerMovie | null>(null);
  resubmitTab          = signal<'metadata' | 'trailer' | 'film'>('metadata');
  resubmitGenres       = signal<Set<string>>(new Set());
  resubmitCast         = signal<string[]>([]);
  resubmitCastInput    = signal('');

  resubmitForm = this.fb.group({
    title:        ['', [Validators.required, Validators.minLength(2)]],
    overview:     [''],
    release_date: [''],
  });

  // Trailer upload
  resubmitTrailerFile  = signal<File | null>(null);
  resubmitTrailerKey   = signal<string | null>(null);
  resubmitTrailerPct   = signal(0);
  isUploadingRTrailer  = signal(false);
  resubmitTrailerError = signal<string | null>(null);
  isDraggingRTrailer   = signal(false);
  private rTrailerUpload: AbortController | null = null;

  // Film upload
  resubmitFilmFile   = signal<File | null>(null);
  resubmitFilmKey    = signal<string | null>(null);
  resubmitFilmPct    = signal(0);
  isUploadingRFilm   = signal(false);
  resubmitFilmError  = signal<string | null>(null);
  isDraggingRFilm    = signal(false);
  private rFilmUpload: AbortController | null = null;

  // Image uploads
  resubmitThumbnailFile    = signal<File | null>(null);
  resubmitThumbnailPreview = signal<string | null>(null);
  resubmitBackdropFile     = signal<File | null>(null);
  resubmitBackdropPreview  = signal<string | null>(null);

  // Submit state
  isResubmitting  = signal(false);
  resubmitError   = signal<string | null>(null);

  tabCounts = computed(() => {
    const all = this.movies();
    return {
      all:      all.length,
      live:     all.filter(m => m.approval_status === 'approved').length,
      pending:  all.filter(m => m.approval_status === 'pending_review' || m.approval_status === 'approved_pending_contract' || m.approval_status === 'changes_requested').length,
      rejected: all.filter(m => m.approval_status === 'rejected').length,
    };
  });

  filtered = computed(() => {
    const tab = this.activeTab();
    const q   = this.search().toLowerCase().trim();

    let list = this.movies();
    if (tab === 'live')     list = list.filter(m => m.approval_status === 'approved');
    if (tab === 'pending')  list = list.filter(m => m.approval_status === 'pending_review' || m.approval_status === 'approved_pending_contract' || m.approval_status === 'changes_requested');
    if (tab === 'rejected') list = list.filter(m => m.approval_status === 'rejected');
    if (q) list = list.filter(m => m.title.toLowerCase().includes(q));

    const col = this.sortCol();
    const dir = this.sortDir();
    return [...list].sort((a, b) => {
      let va: string | number = (a[col as keyof ProducerMovie] as string | number) ?? 0;
      let vb: string | number = (b[col as keyof ProducerMovie] as string | number) ?? 0;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 :  1;
      if (va > vb) return dir === 'asc' ?  1 : -1;
      return 0;
    });
  });

  ngOnInit(): void {
    this.producerService.getMovies().subscribe({
      next: (data) => {
        this.movies.set(Array.isArray(data) ? data : (data as { results: ProducerMovie[] }).results ?? []);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  setSort(col: SortCol): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('desc');
    }
  }

  viewDetail(id: number): void {
    this.router.navigate(['/producer/movies', id]);
  }

  // ── Edit modal ────────────────────────────────────────
  openEdit(movie: ProducerMovie, event: Event): void {
    event.stopPropagation();
    this.editMovie.set(movie);
    this.editGenres.set(new Set(movie.genres));
    this.saveError.set(null);
    this.editForm.reset({
      title:            movie.title,
      overview:         movie.overview ?? '',
    });
  }

  closeEdit(): void {
    this.editMovie.set(null);
    this.saveError.set(null);
  }

  toggleEditGenre(genre: string): void {
    this.editGenres.update(set => {
      const next = new Set(set);
      if (next.has(genre)) next.delete(genre); else next.add(genre);
      return next;
    });
  }

  saveEdit(): void {
    if (this.editForm.invalid || this.isSaving()) return;
    const movie = this.editMovie();
    if (!movie) return;

    this.isSaving.set(true);
    this.saveError.set(null);
    this.saveErrorText.set(null);

    const v = this.editForm.value;
    if (this.isRequestMode(movie)) {
      // Approved film: the change waits for an admin (nothing changes until then).
      this.producerService.requestFilmChange(movie.id, {
        kind: 'edit',
        changes: { title: v.title!, overview: v.overview ?? '', genres: Array.from(this.editGenres()) },
      }).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.markPending(movie.id, 'edit');
          this.closeEdit();
          this.requestNotice.set(this.translate.instant('producerUi.movies.changeRequestSent'));
        },
        error: (err: unknown) => {
          this.isSaving.set(false);
          this.saveErrorText.set(apiErrorMessage(err));
          this.saveError.set('producerUi.movies.saveFailed');
        },
      });
      return;
    }
    this.producerService.updateFilm(movie.id, {
      title:            v.title!,
      overview:         v.overview ?? null,
      genres:           Array.from(this.editGenres()),
    }).subscribe({
      next: (updated) => {
        this.movies.update(list => list.map(m => m.id === updated.id ? updated : m));
        this.isSaving.set(false);
        this.closeEdit();
      },
      error: (err: unknown) => {
        this.isSaving.set(false);
        this.saveErrorText.set(apiErrorMessage(err));
        this.saveError.set('producerUi.movies.saveFailed');
      },
    });
  }

  toggleReason(id: number, event: Event): void {
    event.stopPropagation();
    this.expandedReasons.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  setTab(tab: StatusTab): void { this.activeTab.set(tab); }

  // ── Resubmit drawer ───────────────────────────────────
  openResubmit(movie: ProducerMovie, event: Event): void {
    event.stopPropagation();
    this.resubmitMovie.set(movie);
    this.resubmitTab.set('metadata');
    this.resubmitGenres.set(new Set(movie.genres));
    this.resubmitCast.set([]);
    this.resubmitCastInput.set('');
    this.resubmitTrailerFile.set(null);
    this.resubmitTrailerKey.set(null);
    this.resubmitTrailerPct.set(0);
    this.isUploadingRTrailer.set(false);
    this.resubmitTrailerError.set(null);
    this.resubmitFilmFile.set(null);
    this.resubmitFilmKey.set(null);
    this.resubmitFilmPct.set(0);
    this.isUploadingRFilm.set(false);
    this.resubmitFilmError.set(null);
    this.rTrailerUpload = null;
    this.rFilmUpload = null;
    this.resubmitThumbnailFile.set(null);
    this.resubmitThumbnailPreview.set(null);
    this.resubmitBackdropFile.set(null);
    this.resubmitBackdropPreview.set(null);
    this.isResubmitting.set(false);
    this.resubmitError.set(null);
    this.resubmitForm.reset({
      title:        movie.title,
      overview:     movie.overview ?? '',
      release_date: movie.release_date ?? '',
    });
  }

  closeResubmit(): void {
    this.abortPendingUploads();
    this.resubmitMovie.set(null);
  }

  private abortPendingUploads(): void {
    this.rTrailerUpload?.abort();
    this.rTrailerUpload = null;
    this.rFilmUpload?.abort();
    this.rFilmUpload = null;
  }

  // Cast tag input
  addCastMember(raw: string): void {
    const name = raw.trim();
    if (!name) return;
    this.resubmitCast.update(list => list.includes(name) ? list : [...list, name]);
    this.resubmitCastInput.set('');
  }

  onCastKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addCastMember(this.resubmitCastInput());
    }
  }

  removeCastMember(name: string): void {
    this.resubmitCast.update(list => list.filter(n => n !== name));
  }

  toggleResubmitGenre(genre: string): void {
    this.resubmitGenres.update(set => {
      const next = new Set(set);
      if (next.has(genre)) next.delete(genre); else next.add(genre);
      return next;
    });
  }

  onRThumbnailSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
    this.resubmitThumbnailFile.set(file);
    const reader = new FileReader();
    reader.onload = (ev) => this.resubmitThumbnailPreview.set(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeRThumbnail(): void {
    this.resubmitThumbnailFile.set(null);
    this.resubmitThumbnailPreview.set(null);
  }

  onRBackdropSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
    this.resubmitBackdropFile.set(file);
    const reader = new FileReader();
    reader.onload = (ev) => this.resubmitBackdropPreview.set(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeRBackdrop(): void {
    this.resubmitBackdropFile.set(null);
    this.resubmitBackdropPreview.set(null);
  }

  // Trailer drag/drop
  onRTrailerDragOver(e: DragEvent): void { e.preventDefault(); this.isDraggingRTrailer.set(true); }
  onRTrailerDragLeave(): void { this.isDraggingRTrailer.set(false); }
  onRTrailerDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDraggingRTrailer.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this.handleRTrailerFile(f);
  }
  onRTrailerSelect(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.handleRTrailerFile(f);
  }

  removeRTrailer(): void {
    this.rTrailerUpload?.abort();
    this.rTrailerUpload = null;
    this.resubmitTrailerFile.set(null);
    this.resubmitTrailerKey.set(null);
    this.resubmitTrailerPct.set(0);
    this.resubmitTrailerError.set(null);
  }

  private handleRTrailerFile(file: File): void {
    this.resubmitTrailerError.set(null);
    if (!hasAllowedExtension(file.name, ALLOWED_VIDEO_EXTENSIONS)) {
      this.resubmitTrailerError.set(this.translate.instant('uploadErrors.videoType', { types: extensionList(ALLOWED_VIDEO_EXTENSIONS) }));
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      this.resubmitTrailerError.set(this.translate.instant('producerUi.common.fileTooLarge', { size: 100 }));
      return;
    }
    this.resubmitTrailerFile.set(file);
    this.resubmitTrailerKey.set(null);
    this.startRUpload(file, 'trailer_file');
  }

  // Film drag/drop
  onRFilmDragOver(e: DragEvent): void { e.preventDefault(); this.isDraggingRFilm.set(true); }
  onRFilmDragLeave(): void { this.isDraggingRFilm.set(false); }
  onRFilmDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDraggingRFilm.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this.handleRFilmFile(f);
  }
  onRFilmSelect(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.handleRFilmFile(f);
  }

  removeRFilm(): void {
    this.rFilmUpload?.abort();
    this.rFilmUpload = null;
    this.resubmitFilmFile.set(null);
    this.resubmitFilmKey.set(null);
    this.resubmitFilmPct.set(0);
    this.resubmitFilmError.set(null);
  }

  private handleRFilmFile(file: File): void {
    this.resubmitFilmError.set(null);
    if (!hasAllowedExtension(file.name, ALLOWED_VIDEO_EXTENSIONS)) {
      this.resubmitFilmError.set(this.translate.instant('uploadErrors.videoType', { types: extensionList(ALLOWED_VIDEO_EXTENSIONS) }));
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      this.resubmitFilmError.set(this.translate.instant('producerUi.common.fileTooLarge', { size: 200 }));
      return;
    }
    this.resubmitFilmFile.set(file);
    this.resubmitFilmKey.set(null);
    this.startRUpload(file, 'video_file');
  }

  private startRUpload(file: File, fieldName: 'video_file' | 'trailer_file'): void {
    const isTrailer = fieldName === 'trailer_file';
    if (isTrailer) {
      this.isUploadingRTrailer.set(true);
      this.resubmitTrailerPct.set(0);
      this.resubmitTrailerError.set(null);
    } else {
      this.isUploadingRFilm.set(true);
      this.resubmitFilmPct.set(0);
      this.resubmitFilmError.set(null);
    }

    const controller = new AbortController();
    if (isTrailer) { this.rTrailerUpload?.abort(); this.rTrailerUpload = controller; }
    else           { this.rFilmUpload?.abort();    this.rFilmUpload = controller; }

    this.uploader.upload(file, this.producerService.movieUploadApi(fieldName), {
      signal: controller.signal,
      onProgress: pct => { if (isTrailer) this.resubmitTrailerPct.set(pct); else this.resubmitFilmPct.set(pct); },
    }).then(key => {
      if (isTrailer) { this.resubmitTrailerKey.set(key); this.isUploadingRTrailer.set(false); this.rTrailerUpload = null; }
      else           { this.resubmitFilmKey.set(key);    this.isUploadingRFilm.set(false);    this.rFilmUpload = null; }
    }).catch(err => {
      if (err instanceof UploadAbortedError) {
        // Leave the flag alone if a newer upload replaced this one.
        const current = isTrailer ? this.rTrailerUpload : this.rFilmUpload;
        if (current === null || current === controller) {
          if (isTrailer) this.isUploadingRTrailer.set(false); else this.isUploadingRFilm.set(false);
        }
        return;
      }
      const msg = uploadErrorMessage(err, 'producerUi.common.uploadFailed');
      if (isTrailer) { this.resubmitTrailerError.set(msg); this.isUploadingRTrailer.set(false); }
      else           { this.resubmitFilmError.set(msg);    this.isUploadingRFilm.set(false); }
    });
  }

  submitResubmit(): void {
    const movie = this.resubmitMovie();
    if (!movie || this.resubmitForm.invalid || this.isResubmitting()) return;

    const v = this.resubmitForm.value;
    const fd = new FormData();
    let changed = false;

    if (v.title && v.title.trim() !== movie.title) { fd.append('title', v.title.trim()); changed = true; }
    if ((v.overview ?? '') !== (movie.overview ?? '')) { fd.append('overview', v.overview ?? ''); changed = true; }
    if (v.release_date && v.release_date !== movie.release_date) { fd.append('release_date', v.release_date); changed = true; }

    const newGenres = [...this.resubmitGenres()].sort().join(',');
    const oldGenres = [...(movie.genres ?? [])].sort().join(',');
    if (newGenres !== oldGenres) { fd.append('genres', JSON.stringify([...this.resubmitGenres()])); changed = true; }

    const cast = this.resubmitCast();
    if (cast.length) { fd.append('cast', JSON.stringify(cast)); changed = true; }

    if (this.resubmitTrailerKey())    { fd.append('trailer_key', this.resubmitTrailerKey()!);       changed = true; }
    if (this.resubmitFilmKey())       { fd.append('video_key',   this.resubmitFilmKey()!);          changed = true; }
    if (this.resubmitThumbnailFile()) { fd.append('thumbnail',   this.resubmitThumbnailFile()!);    changed = true; }
    if (this.resubmitBackdropFile())  { fd.append('backdrop',    this.resubmitBackdropFile()!);     changed = true; }

    if (!changed) {
      this.resubmitError.set('producerUi.resubmit.noChanges');
      return;
    }

    this.isResubmitting.set(true);
    this.resubmitError.set(null);

    this.producerService.resubmitFilm(movie.id, fd).subscribe({
      next: () => {
        this.movies.update(list => list.map(m =>
          m.id === movie.id ? { ...m, approval_status: 'pending_review' as const, changes_requested_note: null } : m
        ));
        this.isResubmitting.set(false);
        this.resubmitMovie.set(null);
      },
      error: (err) => {
        this.isResubmitting.set(false);
        this.resubmitError.set(err?.error?.detail ?? 'producerUi.resubmit.failed');
      },
    });
  }

  // ── Status helpers ────────────────────────────────────
  statusLabel(m: ProducerMovie): string {
    if (m.approval_status === 'rejected') return 'movies.chips.rejected';
    if (m.approval_status === 'approved') return 'movies.chips.live';
    if (m.approval_status === 'approved_pending_contract') return 'movies.chips.approvedPendingContract';
    if (m.approval_status === 'changes_requested') return 'producerUi.movies.changesRequested';
    return 'movies.chips.pendingApproval';
  }

  statusClass(m: ProducerMovie): string {
    if (m.approval_status === 'rejected') return 'status-rejected';
    if (m.approval_status === 'approved') return 'status-live';
    if (m.approval_status === 'approved_pending_contract') return 'status-contract';
    if (m.approval_status === 'changes_requested') return 'status-changes';
    return 'status-review';
  }

  movieType(m: ProducerMovie): string {
    return m.price > 0 ? 'movies.chips.paid' : 'movies.chips.free';
  }

  isLive(m: ProducerMovie): boolean { return m.approval_status === 'approved'; }

  /** Server rule (apps/movies/editing.py): direct edits only before approval; approved films go through a request. */
  isEditable(m: ProducerMovie): boolean {
    const mode = m.edit_mode ?? (m.approval_status === 'rejected' ? 'direct' : 'locked');
    return mode === 'direct' || (mode === 'request' && !m.pending_change_requests?.includes('edit'));
  }

  isRequestMode(m: ProducerMovie | null): boolean {
    return m?.edit_mode === 'request';
  }

  canRequestUnpublish(m: ProducerMovie): boolean {
    return m.edit_mode === 'request' && m.is_active && !m.pending_change_requests?.includes('unpublish');
  }

  // ── Unpublish request ─────────────────────────────────
  unpublishMovie = signal<ProducerMovie | null>(null);
  unpublishReason = signal('');
  unpublishError = signal<string | null>(null);
  requestNotice = signal<string | null>(null);

  sendUnpublish(): void {
    const m = this.unpublishMovie();
    if (!m || this.isSaving()) return;
    if (!this.unpublishReason().trim()) { this.unpublishError.set(this.translate.instant('producerUi.movies.reasonRequired')); return; }
    this.isSaving.set(true);
    this.producerService.requestFilmChange(m.id, { kind: 'unpublish', reason: this.unpublishReason().trim() }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.markPending(m.id, 'unpublish');
        this.unpublishMovie.set(null);
        this.requestNotice.set(this.translate.instant('producerUi.movies.unpublishSent'));
      },
      error: (err: unknown) => {
        this.isSaving.set(false);
        this.unpublishError.set(apiErrorMessage(err) ?? this.translate.instant('producerUi.movies.saveFailed'));
      },
    });
  }

  private markPending(id: number, kind: 'edit' | 'unpublish'): void {
    this.movies.update(list => list.map(x => x.id === id
      ? { ...x, pending_change_requests: [...(x.pending_change_requests ?? []), kind] } : x));
  }

  isChangesRequested(m: ProducerMovie): boolean {
    return m.approval_status === 'changes_requested';
  }

  genreLabel(m: ProducerMovie): string {
    return m.genres?.length ? m.genres.join(', ') : '—';
  }

  fmtNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  formatCurrency(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  shareMovie(movie: ProducerMovie, event: Event): void {
    event.stopPropagation();
    if (!isPlatformBrowser(this.platformId)) return;
    const url = `${window.location.origin}/preview/${movie.id}`;
    navigator.clipboard.writeText(url).then(() => {
      this.copiedMovieId.set(movie.id);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copiedMovieId.set(null), 2500);
    }).catch(() => { /* clipboard refused: the link stays visible to copy by hand */ });
  }

  goToUpload() { this.router.navigate(['/producer/upload']); }
  goToContract() { this.router.navigate(['/producer/contracts/start']); }

  ngOnDestroy(): void {
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.abortPendingUploads();
  }
}
