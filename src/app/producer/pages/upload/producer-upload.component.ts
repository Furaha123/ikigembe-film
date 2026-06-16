import { Component, inject, signal, computed } from '@angular/core';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProducerService } from '../../services/producer.service';
import { DatePickerComponent } from '../../../shared/components/date-picker/date-picker';

type WizardStep = 'rules' | 'details' | 'trailer' | 'movie' | 'copyright' | 'review';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

const UPLOAD_RULES = [
  'Movie must be between 10 and 30 minutes.',
  'File size must not exceed 200 MB per file.',
  'Video quality must be 4K or HD.',
  'Good sound quality and clear visuals are required.',
  'Your movie must have subtitles.',
  'The story must be original and of high quality.',
];

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western',
];

@Component({
  selector: 'app-producer-upload',
  imports: [TranslatePipe, TranslateDirective, CommonModule, ReactiveFormsModule, DatePickerComponent],
  templateUrl: './producer-upload.component.html',
  styleUrl: './producer-upload.component.scss',
})
export class ProducerUploadComponent {
  private readonly fb              = inject(FormBuilder);
  private readonly producerService = inject(ProducerService);
  private readonly router          = inject(Router);

  readonly RULES      = UPLOAD_RULES;
  readonly ALL_GENRES = ALL_GENRES;

  currentStep   = signal<WizardStep>('rules');
  submitSuccess = signal(false);

  // ── Details form ─────────────────────────────────────
  detailsForm = this.fb.group({
    title:            ['', [Validators.required, Validators.minLength(2)]],
    longline:         ['', [Validators.required, Validators.minLength(10), Validators.maxLength(200)]],
    synopsis:         ['', [Validators.required, Validators.minLength(20), Validators.maxLength(600)]],
    release_date:     ['', Validators.required],
    price:            [0, [Validators.required, Validators.min(0)]],
    duration_minutes: [null as number | null, Validators.min(1)],
    cast:             [''],
    director:         [''],
    writer:           [''],
    has_free_preview: [false],
  });

  // ── Genre selection ───────────────────────────────────
  selectedGenres = signal<Set<string>>(new Set());

  toggleGenre(genre: string) {
    this.selectedGenres.update(set => {
      const next = new Set(set);
      next.has(genre) ? next.delete(genre) : next.add(genre);
      return next;
    });
  }

  isGenreSelected(genre: string) { return this.selectedGenres().has(genre); }
  genresDisplay = computed(() => Array.from(this.selectedGenres()).join(', '));

  // ── Thumbnail ─────────────────────────────────────────
  thumbnailFile    = signal<File | null>(null);
  thumbnailPreview = signal<string | null>(null);
  thumbnailError   = signal<string | null>(null);

  // ── Trailer ───────────────────────────────────────────
  trailerFile        = signal<File | null>(null);
  trailerKey         = signal<string | null>(null);
  trailerUploadPct   = signal(0);
  isUploadingTrailer = signal(false);
  trailerUploadError = signal<string | null>(null);
  isDraggingTrailer  = signal(false);

  // ── Full Movie ────────────────────────────────────────
  movieFile        = signal<File | null>(null);
  movieKey         = signal<string | null>(null);
  movieUploadPct   = signal(0);
  isUploadingMovie = signal(false);
  movieUploadError = signal<string | null>(null);
  movieErrors      = signal<string[]>([]);
  isDraggingMovie  = signal(false);

  // ── Copyright Document ────────────────────────────────
  copyrightFile  = signal<File | null>(null);
  copyrightError = signal<string | null>(null);

  // ── Submit ────────────────────────────────────────────
  isSubmitting = signal(false);
  submitError  = signal<string | null>(null);

  // ── Computed ──────────────────────────────────────────
  stepIndex = computed(() => {
    const map: Record<WizardStep, number> = { rules: -1, details: 0, trailer: 1, movie: 2, copyright: 3, review: 4 };
    return map[this.currentStep()];
  });

  // trailer is optional: done if no file chosen OR upload completed
  trailerReady    = computed(() => !this.trailerFile() || !!this.trailerKey());
  movieReady      = computed(() => !!this.movieKey());
  copyrightReady  = computed(() => !!this.copyrightFile());

  get title()           { return this.detailsForm.get('title'); }
  get longline()        { return this.detailsForm.get('longline'); }
  get synopsis()        { return this.detailsForm.get('synopsis'); }
  get releaseDate()     { return this.detailsForm.get('release_date'); }
  get price()           { return this.detailsForm.get('price'); }
  get durationMinutes() { return this.detailsForm.get('duration_minutes'); }
  get cast()            { return this.detailsForm.get('cast'); }
  get director()        { return this.detailsForm.get('director'); }
  get writer()          { return this.detailsForm.get('writer'); }

  onReleaseDateChange(date: Date): void {
    const iso = date.toISOString().split('T')[0]; // YYYY-MM-DD
    this.detailsForm.get('release_date')!.setValue(iso);
    this.detailsForm.get('release_date')!.markAsTouched();
  }

  // ── Navigation ────────────────────────────────────────
  startUpload() { this.currentStep.set('details'); }

  nextFromDetails() {
    this.detailsForm.markAllAsTouched();
    if (this.detailsForm.invalid) return;
    if (this.selectedGenres().size === 0) return;
    if (!this.thumbnailFile()) { this.thumbnailError.set('Thumbnail image is required.'); return; }
    this.currentStep.set('trailer');
  }

  nextFromTrailer() {
    if (this.isUploadingTrailer()) return;
    this.currentStep.set('movie');
  }

  nextFromMovie() {
    if (!this.movieReady()) return;
    this.currentStep.set('copyright');
  }

  nextFromCopyright() {
    if (!this.copyrightReady()) {
      this.copyrightError.set('Copyright proof document is required.');
      return;
    }
    this.currentStep.set('review');
  }

  goBack() {
    const prev: Record<WizardStep, WizardStep | null> = {
      rules: null, details: 'rules', trailer: 'details',
      movie: 'trailer', copyright: 'movie', review: 'copyright',
    };
    const p = prev[this.currentStep()];
    if (p) this.currentStep.set(p);
  }

  // ── Thumbnail ─────────────────────────────────────────
  onThumbnailSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.thumbnailError.set('Only image files are accepted (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.thumbnailError.set('Image must be under 5 MB.');
      return;
    }
    this.thumbnailError.set(null);
    this.thumbnailFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.thumbnailPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeThumbnail() {
    this.thumbnailFile.set(null);
    this.thumbnailPreview.set(null);
  }

  // ── Trailer handlers ──────────────────────────────────
  onTrailerDragOver(e: DragEvent) { e.preventDefault(); this.isDraggingTrailer.set(true); }
  onTrailerDragLeave()            { this.isDraggingTrailer.set(false); }
  onTrailerDrop(e: DragEvent) {
    e.preventDefault();
    this.isDraggingTrailer.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this.handleTrailerFile(f);
  }
  onTrailerSelect(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.handleTrailerFile(f);
  }

  private handleTrailerFile(file: File) {
    this.trailerUploadError.set(null);
    if (!file.name.match(/\.(mp4|mov)$/i)) {
      this.trailerUploadError.set('Only .mp4 and .mov formats are accepted.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      this.trailerUploadError.set('File size must not exceed 100 MB.');
      return;
    }
    this.trailerFile.set(file);
    this.trailerKey.set(null);
    this.startS3Upload(file, 'trailer_file');
  }

  retryTrailer() {
    const f = this.trailerFile();
    if (f) {
      this.trailerKey.set(null);
      this.startS3Upload(f, 'trailer_file');
    }
  }

  // ── Movie handlers ────────────────────────────────────
  onMovieDragOver(e: DragEvent) { e.preventDefault(); this.isDraggingMovie.set(true); }
  onMovieDragLeave()            { this.isDraggingMovie.set(false); }
  onMovieDrop(e: DragEvent) {
    e.preventDefault();
    this.isDraggingMovie.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this.handleMovieFile(f);
  }
  onMovieSelect(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.handleMovieFile(f);
  }

  private handleMovieFile(file: File) {
    const errors: string[] = [];
    if (!file.name.match(/\.(mp4|mov)$/i)) errors.push('Only .mp4 and .mov formats are accepted.');
    if (file.size > 200 * 1024 * 1024) errors.push('File size must not exceed 200 MB.');
    if (errors.length) { this.movieErrors.set(errors); return; }
    this.movieErrors.set([]);
    this.movieFile.set(file);
    this.movieKey.set(null);
    this.startS3Upload(file, 'video_file');
  }

  retryMovie() {
    const f = this.movieFile();
    if (f) {
      this.movieKey.set(null);
      this.startS3Upload(f, 'video_file');
    }
  }

  // ── Copyright handlers ────────────────────────────────
  onCopyrightSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.handleCopyrightFile(file);
  }

  onCopyrightDragOver(e: DragEvent)  { e.preventDefault(); }
  onCopyrightDrop(e: DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f) this.handleCopyrightFile(f);
  }

  removeCopyright() {
    this.copyrightFile.set(null);
    this.copyrightError.set(null);
  }

  private handleCopyrightFile(file: File) {
    const allowed = /\.(pdf|jpg|jpeg|png)$/i;
    if (!file.name.match(allowed)) {
      this.copyrightError.set('Only PDF, JPG, or PNG files are accepted.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.copyrightError.set('File must not exceed 10 MB.');
      return;
    }
    this.copyrightError.set(null);
    this.copyrightFile.set(file);
  }

  // ── S3 multipart upload ───────────────────────────────
  private startS3Upload(file: File, fieldName: 'video_file' | 'trailer_file') {
    const isTrailer = fieldName === 'trailer_file';

    if (isTrailer) {
      this.isUploadingTrailer.set(true);
      this.trailerUploadPct.set(0);
      this.trailerUploadError.set(null);
    } else {
      this.isUploadingMovie.set(true);
      this.movieUploadPct.set(0);
      this.movieUploadError.set(null);
    }

    this.doMultipartUpload(file, fieldName, pct => {
      if (isTrailer) this.trailerUploadPct.set(pct);
      else           this.movieUploadPct.set(pct);
    }).then(key => {
      if (isTrailer) {
        this.trailerKey.set(key);
        this.isUploadingTrailer.set(false);
      } else {
        this.movieKey.set(key);
        this.isUploadingMovie.set(false);
      }
    }).catch(err => {
      const msg = err?.message ?? 'Upload failed. Please try again.';
      if (isTrailer) {
        this.trailerUploadError.set(msg);
        this.isUploadingTrailer.set(false);
      } else {
        this.movieUploadError.set(msg);
        this.isUploadingMovie.set(false);
      }
    });
  }

  private async doMultipartUpload(
    file: File,
    fieldName: 'video_file' | 'trailer_file',
    onProgress: (pct: number) => void,
  ): Promise<string> {
    // Step 1: Initiate
    const { upload_id, file_key } = await firstValueFrom(
      this.producerService.initiateUpload(file.name, file.type, fieldName)
    );

    // Step 2: Upload each chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const parts: { PartNumber: number; ETag: string }[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = file.slice(start, start + CHUNK_SIZE);

      const { url } = await firstValueFrom(
        this.producerService.signPart(upload_id, file_key, i + 1)
      );

      const res = await fetch(url, { method: 'PUT', body: chunk });
      if (!res.ok) throw new Error(`Part ${i + 1} failed (${res.status})`);

      const etag = res.headers.get('ETag') ?? '';
      parts.push({ PartNumber: i + 1, ETag: etag });
      onProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    // Step 3: Complete
    await firstValueFrom(
      this.producerService.completeUpload(upload_id, file_key, parts)
    );

    return file_key;
  }

  // ── Submit ────────────────────────────────────────────
  submit() {
    this.isSubmitting.set(true);
    this.submitError.set(null);

    const v = this.detailsForm.value;
    const fd = new FormData();

    fd.append('title',            v.title!);
    fd.append('overview',         v.synopsis!);
    fd.append('release_date',     v.release_date!);
    fd.append('price',            String(v.price ?? 0));
    fd.append('duration_minutes', String(v.duration_minutes ?? 0));
    fd.append('is_active',        'false');
    fd.append('has_free_preview', String(v.has_free_preview ?? false));
    fd.append('video_key',        this.movieKey()!);

    if (this.trailerKey()) fd.append('trailer_key', this.trailerKey()!);

    const genres = Array.from(this.selectedGenres());
    if (genres.length) {
      fd.append('genres', JSON.stringify(genres));
    }
    if (v.cast?.trim()) {
      fd.append('cast', JSON.stringify(v.cast.split(',').map((s: string) => s.trim()).filter(Boolean)));
    }
    if (v.director?.trim()) fd.append('director', v.director.trim());
    if (v.writer?.trim())   fd.append('writer',   v.writer.trim());

    if (this.thumbnailFile()) fd.append('thumbnail', this.thumbnailFile()!);
    if (this.copyrightFile()) fd.append('copyright_document', this.copyrightFile()!);

    this.producerService.submitMovie(fd).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.submitSuccess.set(true);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const body = err?.error;
        if (typeof body === 'object' && body !== null) {
          const first = Object.values(body)[0];
          this.submitError.set(Array.isArray(first) ? (first[0] as string) : String(first));
        } else {
          this.submitError.set('Submission failed. Please try again.');
        }
      },
    });
  }

  goToDashboard() { this.router.navigate(['/producer/dashboard']); }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
}
