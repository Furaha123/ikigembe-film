import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminService } from '../../services/admin.service';
import { MovieService } from '../../../shared/services/movie.service';
import { MovieUploadService } from '../../../shared/services/movie-upload.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { ProducerItem } from '../../models/admin.interface';
import { MovieDetailResponse } from '../../../shared/models/movie-api.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';

type ImageField = 'thumbnail' | 'backdrop';
type VideoField = 'video' | 'trailer';

/** State of a large file going through the multipart flow before the form is saved. */
export interface VideoUpload {
  file: File | null;
  key: string | null;
  pct: number;
  uploading: boolean;
  error: string | null; // translation key
}

const EMPTY_UPLOAD: VideoUpload = { file: null, key: null, pct: 0, uploading: false, error: null };

/** Detail response fields the edit form reads that IVideoContent doesn't declare. */
type EditableMovie = MovieDetailResponse & {
  cast?: string[] | string | null;
  genres?: string[] | string | null;
  producer?: string | null;
  is_active?: boolean;
};

/**
 * Admin create/edit film. Videos use the same multipart flow as producer uploads:
 * the video/trailer is uploaded to storage first and sent as `video_key` /
 * `trailer_key` — `/movies/create/` and `/movies/<id>/update/` ignore raw
 * `video_file` / `trailer_file` uploads. Images are sent as files.
 */
@Component({
  selector: 'app-admin-movie-form',
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './admin-movie-form.component.html',
  styleUrl: './admin-movie-form.component.scss'
})
export class AdminMovieFormComponent implements OnInit, OnDestroy {
  private readonly adminService  = inject(AdminService);
  private readonly movieService  = inject(MovieService);
  private readonly movieUpload   = inject(MovieUploadService);
  private readonly uploader      = inject(MultipartUploadService);
  private readonly fb            = inject(FormBuilder);
  private readonly router        = inject(Router);
  private readonly route         = inject(ActivatedRoute);

  // ── Mode ──────────────────────────────────────────────────────────────
  editId     = signal<number | null>(null);
  isEditMode = signal(false);
  isLoadingMovie = signal(false);

  // ── Data ──────────────────────────────────────────────────────────────
  producers  = signal<ProducerItem[]>([]);
  isSaving   = signal(false);
  saveError  = signal<string | null>(null);

  // ── File state ────────────────────────────────────────────────────────
  thumbnailFile = signal<File | null>(null);
  backdropFile  = signal<File | null>(null);
  video         = signal<VideoUpload>({ ...EMPTY_UPLOAD });
  trailer       = signal<VideoUpload>({ ...EMPTY_UPLOAD });

  /** Translation keys for missing required files. */
  filesError = signal<{ thumbnail?: string; video?: string; backdrop?: string }>({});

  uploading = computed(() => this.video().uploading || this.trailer().uploading);

  private readonly controllers: Partial<Record<VideoField, AbortController>> = {};

  form = this.fb.group({
    title:        ['', Validators.required],
    overview:     ['', Validators.required],
    release_date: ['', Validators.required],
    price:        [0, [Validators.min(0)]],
    cast:         [''],
    genres:       [''],
    producer:     [''],   // producer account id (sent as producer_profile)
    is_active:    [true],
  });

  ngOnInit() {
    this.adminService.getProducers().subscribe({
      next: (data) => {
        const list = data as ProducerItem[] | { results?: ProducerItem[] };
        this.producers.set(Array.isArray(list) ? list : list.results ?? []);
      },
      error: () => {},
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(+id);
      this.isEditMode.set(true);
      this.loadMovieForEdit(+id);
    }
  }

  ngOnDestroy(): void {
    // Leaving the page cancels unfinished uploads (and aborts them server-side).
    Object.values(this.controllers).forEach(c => c?.abort());
  }

  private loadMovieForEdit(id: number) {
    this.isLoadingMovie.set(true);
    this.movieService.getMovieDetails(id).subscribe({
      next: (res) => {
        const movie = res as EditableMovie;
        const list = (v: string[] | string | null | undefined) => Array.isArray(v) ? v.join(', ') : (v ?? '');
        this.form.patchValue({
          title:        movie.title ?? '',
          overview:     movie.overview ?? '',
          release_date: movie.release_date ?? '',
          price:        movie.price ?? 0,
          cast:         list(movie.cast),
          genres:       list(movie.genres),
          producer:     movie.producer_profile?.id ? String(movie.producer_profile.id) : '',
          is_active:    movie.is_active ?? true,
        });
        this.isLoadingMovie.set(false);
      },
      error: () => this.isLoadingMovie.set(false),
    });
  }

  // ── Images (sent as files) ──────────────────────────────────────────────
  onImageChange(event: Event, field: ImageField) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file && !file.type.startsWith('image/')) {
      this.filesError.update(e => ({ ...e, [field]: 'admin.movieForm.errors.imageType' }));
      return;
    }
    (field === 'thumbnail' ? this.thumbnailFile : this.backdropFile).set(file);
    this.filesError.update(e => ({ ...e, [field]: undefined }));
  }

  removeImage(field: ImageField) {
    (field === 'thumbnail' ? this.thumbnailFile : this.backdropFile).set(null);
  }

  // ── Videos (multipart upload, started on selection) ─────────────────────
  onVideoChange(event: Event, field: VideoField) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      this.state(field).set({ ...EMPTY_UPLOAD, error: 'admin.movieForm.errors.videoType' });
      return;
    }
    if (field === 'video') this.filesError.update(e => ({ ...e, video: undefined }));
    this.startUpload(field, file);
  }

  retryUpload(field: VideoField) {
    const file = this.state(field)().file;
    if (file) this.startUpload(field, file);
  }

  removeVideo(field: VideoField) {
    this.controllers[field]?.abort();
    delete this.controllers[field];
    this.state(field).set({ ...EMPTY_UPLOAD });
  }

  private startUpload(field: VideoField, file: File) {
    this.controllers[field]?.abort();
    const controller = new AbortController();
    this.controllers[field] = controller;
    const s = this.state(field);
    s.set({ file, key: null, pct: 0, uploading: true, error: null });

    this.uploader.upload(file, this.movieUpload.api(field === 'video' ? 'video_file' : 'trailer_file'), {
      signal: controller.signal,
      onProgress: pct => s.update(v => ({ ...v, pct })),
    }).then(key => {
      if (this.controllers[field] !== controller) return;
      s.set({ file, key, pct: 100, uploading: false, error: null });
    }).catch((err: unknown) => {
      if (this.controllers[field] !== controller || err instanceof UploadAbortedError) return;
      s.set({ file, key: null, pct: 0, uploading: false, error: 'admin.movieForm.errors.uploadFailed' });
    }).finally(() => {
      if (this.controllers[field] === controller) delete this.controllers[field];
    });
  }

  private state(field: VideoField) {
    return field === 'video' ? this.video : this.trailer;
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.uploading()) { this.saveError.set('admin.movieForm.errors.waitForUpload'); return; }

    if (!this.isEditMode()) {
      const errors: { thumbnail?: string; video?: string } = {};
      if (!this.thumbnailFile()) errors.thumbnail = 'admin.movieForm.errors.thumbnailRequired';
      if (!this.video().key)     errors.video = 'admin.movieForm.errors.videoRequired';
      if (Object.keys(errors).length) { this.filesError.set(errors); return; }
    }

    this.isSaving.set(true);
    this.saveError.set(null);

    const fd = this.buildFormData();
    const request$ = this.isEditMode()
      ? this.adminService.updateMovie(this.editId()!, fd)
      : this.adminService.createMovie(fd);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.router.navigate(['/admin/movies']);
      },
      error: (err: HttpErrorResponse) => {
        this.isSaving.set(false);
        this.saveError.set(apiErrorMessage(err) ?? firstFieldError(err) ?? 'admin.movieForm.errors.saveFailed');
      },
    });
  }

  /** multipart/form-data for /movies/create/ and /movies/<id>/update/. */
  buildFormData(): FormData {
    const v = this.form.value;
    const fd = new FormData();

    fd.append('title',        v.title ?? '');
    fd.append('overview',     v.overview ?? '');
    fd.append('release_date', v.release_date ?? '');
    fd.append('price',        String(v.price ?? 0));
    fd.append('is_active',    String(v.is_active ?? true));

    const list = (s: string | null | undefined) => JSON.stringify((s ?? '').split(',').map(x => x.trim()).filter(Boolean));
    if (v.cast?.trim())   fd.append('cast',   list(v.cast));
    if (v.genres?.trim()) fd.append('genres', list(v.genres));

    // Link the film to the producer's account (earnings, dashboard) and keep the display name.
    const producer = this.producers().find(p => String(p.id) === String(v.producer ?? ''));
    if (producer) {
      fd.append('producer_profile', String(producer.id));
      fd.append('producer', producer.studio_name || producer.name);
    }

    if (this.thumbnailFile()) fd.append('thumbnail', this.thumbnailFile()!);
    if (this.backdropFile())  fd.append('backdrop',  this.backdropFile()!);
    if (this.video().key)     fd.append('video_key',   this.video().key!);
    if (this.trailer().key)   fd.append('trailer_key', this.trailer().key!);

    return fd;
  }

  cancel() {
    this.router.navigate(['/admin/movies']);
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}

/** "field: message" from a DRF `{ field: [msg] }` validation error. */
function firstFieldError(err: HttpErrorResponse): string | null {
  const body: unknown = err.error;
  if (!body || typeof body !== 'object') return null;
  const [field, msgs] = Object.entries(body as Record<string, unknown>)[0] ?? [];
  if (!field) return null;
  const msg = Array.isArray(msgs) ? String(msgs[0]) : String(msgs);
  return `${field}: ${msg}`;
}
