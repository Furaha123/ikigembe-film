import { Component, inject, OnInit, OnDestroy, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProducerService, ProducerMovie } from '../../services/producer.service';

type SortCol = 'title' | 'views' | 'price' | 'release_date' | 'created_at';
type StatusTab = 'all' | 'live' | 'pending' | 'rejected';

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western',
];

const CHUNK_SIZE = 10 * 1024 * 1024;

@Component({
  selector: 'app-producer-movies',
  imports: [TranslatePipe, TranslateDirective, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './producer-movies.component.html',
  styleUrl: './producer-movies.component.scss',
})
export class ProducerMoviesComponent implements OnInit, OnDestroy {
  private readonly producerService = inject(ProducerService);
  private readonly fb              = inject(FormBuilder);
  private readonly router          = inject(Router);
  private readonly platformId      = inject(PLATFORM_ID);
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
  editGenres  = signal<Set<string>>(new Set());

  editForm = this.fb.group({
    title:            ['', [Validators.required, Validators.minLength(2)]],
    overview:         [''],
    price:            [0, [Validators.required, Validators.min(0)]],
    has_free_preview: [false],
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
    price:        [0, [Validators.min(0)]],
  });

  // Trailer upload
  resubmitTrailerFile  = signal<File | null>(null);
  resubmitTrailerKey   = signal<string | null>(null);
  resubmitTrailerPct   = signal(0);
  isUploadingRTrailer  = signal(false);
  resubmitTrailerError = signal<string | null>(null);
  isDraggingRTrailer   = signal(false);
  private rTrailerCtx: { uploadId: string; fileKey: string } | null = null;

  // Film upload
  resubmitFilmFile   = signal<File | null>(null);
  resubmitFilmKey    = signal<string | null>(null);
  resubmitFilmPct    = signal(0);
  isUploadingRFilm   = signal(false);
  resubmitFilmError  = signal<string | null>(null);
  isDraggingRFilm    = signal(false);
  private rFilmCtx: { uploadId: string; fileKey: string } | null = null;

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
      price:            movie.price,
      has_free_preview: movie.has_free_preview,
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

    const v = this.editForm.value;
    this.producerService.updateFilm(movie.id, {
      title:            v.title!,
      overview:         v.overview ?? null,
      price:            v.price!,
      has_free_preview: v.has_free_preview ?? false,
      genres:           Array.from(this.editGenres()),
    }).subscribe({
      next: (updated) => {
        this.movies.update(list => list.map(m => m.id === updated.id ? updated : m));
        this.isSaving.set(false);
        this.closeEdit();
      },
      error: () => {
        this.isSaving.set(false);
        this.saveError.set('Failed to save changes. Please try again.');
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
    this.rTrailerCtx = null;
    this.rFilmCtx = null;
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
      price:        movie.price,
    });
  }

  closeResubmit(): void {
    this.abortPendingUploads();
    this.resubmitMovie.set(null);
  }

  private abortPendingUploads(): void {
    if (this.rTrailerCtx && !this.resubmitTrailerKey()) {
      this.producerService.abortUpload(this.rTrailerCtx.uploadId, this.rTrailerCtx.fileKey).subscribe();
      this.rTrailerCtx = null;
    }
    if (this.rFilmCtx && !this.resubmitFilmKey()) {
      this.producerService.abortUpload(this.rFilmCtx.uploadId, this.rFilmCtx.fileKey).subscribe();
      this.rFilmCtx = null;
    }
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
    if (this.rTrailerCtx && !this.resubmitTrailerKey()) {
      this.producerService.abortUpload(this.rTrailerCtx.uploadId, this.rTrailerCtx.fileKey).subscribe();
      this.rTrailerCtx = null;
    }
    this.resubmitTrailerFile.set(null);
    this.resubmitTrailerKey.set(null);
    this.resubmitTrailerPct.set(0);
    this.resubmitTrailerError.set(null);
  }

  private handleRTrailerFile(file: File): void {
    this.resubmitTrailerError.set(null);
    if (!file.name.match(/\.(mp4|mov)$/i)) {
      this.resubmitTrailerError.set('Only .mp4 and .mov formats are accepted.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      this.resubmitTrailerError.set('File size must not exceed 100 MB.');
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
    if (this.rFilmCtx && !this.resubmitFilmKey()) {
      this.producerService.abortUpload(this.rFilmCtx.uploadId, this.rFilmCtx.fileKey).subscribe();
      this.rFilmCtx = null;
    }
    this.resubmitFilmFile.set(null);
    this.resubmitFilmKey.set(null);
    this.resubmitFilmPct.set(0);
    this.resubmitFilmError.set(null);
  }

  private handleRFilmFile(file: File): void {
    this.resubmitFilmError.set(null);
    if (!file.name.match(/\.(mp4|mov)$/i)) {
      this.resubmitFilmError.set('Only .mp4 and .mov formats are accepted.');
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      this.resubmitFilmError.set('File size must not exceed 200 MB.');
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

    this.doRMultipartUpload(
      file,
      fieldName,
      pct => { if (isTrailer) this.resubmitTrailerPct.set(pct); else this.resubmitFilmPct.set(pct); },
      ctx  => { if (isTrailer) this.rTrailerCtx = ctx; else this.rFilmCtx = ctx; },
    ).then(key => {
      if (isTrailer) { this.resubmitTrailerKey.set(key); this.isUploadingRTrailer.set(false); }
      else           { this.resubmitFilmKey.set(key);    this.isUploadingRFilm.set(false); }
    }).catch(err => {
      const msg = err?.message ?? 'Upload failed. Please try again.';
      if (isTrailer) { this.resubmitTrailerError.set(msg); this.isUploadingRTrailer.set(false); }
      else           { this.resubmitFilmError.set(msg);    this.isUploadingRFilm.set(false); }
    });
  }

  private async doRMultipartUpload(
    file: File,
    fieldName: 'video_file' | 'trailer_file',
    onProgress: (pct: number) => void,
    onInitiated: (ctx: { uploadId: string; fileKey: string }) => void,
  ): Promise<string> {
    const { upload_id, file_key } = await firstValueFrom(
      this.producerService.initiateUpload(file.name, file.type, fieldName)
    );
    onInitiated({ uploadId: upload_id, fileKey: file_key });

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const parts: { PartNumber: number; ETag: string }[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const { url } = await firstValueFrom(this.producerService.signPart(upload_id, file_key, i + 1));
      const res = await fetch(url, { method: 'PUT', body: chunk });
      if (!res.ok) throw new Error(`Part ${i + 1} failed (${res.status})`);
      parts.push({ PartNumber: i + 1, ETag: res.headers.get('ETag') ?? '' });
      onProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    await firstValueFrom(this.producerService.completeUpload(upload_id, file_key, parts));
    return file_key;
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
    if (v.price !== null && v.price !== undefined && Number(v.price) !== movie.price) { fd.append('price', String(v.price)); changed = true; }

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
      this.resubmitError.set('Make at least one change before resubmitting.');
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
        this.resubmitError.set(err?.error?.detail ?? 'Failed to resubmit. Please try again.');
      },
    });
  }

  // ── Status helpers ────────────────────────────────────
  statusLabel(m: ProducerMovie): string {
    if (m.approval_status === 'rejected') return 'movies.chips.rejected';
    if (m.approval_status === 'approved') return 'movies.chips.live';
    if (m.approval_status === 'approved_pending_contract') return 'movies.chips.approvedPendingContract';
    if (m.approval_status === 'changes_requested') return 'Changes Requested';
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

  isEditable(m: ProducerMovie): boolean {
    return m.approval_status === 'pending_review' || m.approval_status === 'rejected';
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
    }).catch(() => {});
  }

  goToUpload() { this.router.navigate(['/producer/upload']); }
  goToContract() { this.router.navigate(['/producer/contracts/start']); }

  ngOnDestroy(): void {
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.abortPendingUploads();
  }
}
