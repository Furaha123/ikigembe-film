import { Component, inject, signal, computed } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProducerService } from '../../services/producer.service';
import { MultipartUploadService } from '../../../shared/services/multipart-upload.service';
import { ALLOWED_DOCUMENT_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS, DOCUMENT_ACCEPT, extensionList, hasAllowedExtension, VIDEO_ACCEPT } from '../../../shared/models/upload.constants';
import { uploadErrorMessage } from '../../../shared/utils/upload-error';
import { DatePickerComponent } from '../../../shared/components/date-picker/date-picker';
import { toLocalDateString } from '../../../shared/utils/local-date';

type WizardStep = 'rules' | 'details' | 'trailer' | 'movie' | 'copyright' | 'review';

const UPLOAD_RULES = [
  'producerUi.upload.rules.duration',
  'producerUi.upload.rules.size',
  'producerUi.upload.rules.quality',
  'producerUi.upload.rules.sound',
  'producerUi.upload.rules.subtitles',
  'producerUi.upload.rules.original',
];

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western',
];

@Component({
  selector: 'app-producer-upload',
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule, DatePickerComponent],
  templateUrl: './producer-upload.component.html',
  styleUrl: './producer-upload.component.scss',
})
export class ProducerUploadComponent {
  private readonly fb              = inject(FormBuilder);
  private readonly producerService = inject(ProducerService);
  private readonly uploader        = inject(MultipartUploadService);
  private readonly router          = inject(Router);
  private readonly translate       = inject(TranslateService);

  readonly RULES      = UPLOAD_RULES;
  readonly ALL_GENRES = ALL_GENRES;

  currentStep   = signal<WizardStep>('rules');
  submitSuccess = signal(false);

  // ── Details form ─────────────────────────────────────
  detailsForm = this.fb.group({
    title:        ['', [Validators.required, Validators.minLength(2)]],
    logline:     ['', [Validators.required, Validators.minLength(10), Validators.maxLength(200)]],
    synopsis:     ['', [Validators.required, Validators.minLength(20), Validators.maxLength(600)]],
    release_date: ['', Validators.required],
    cast:         [''],
    director:     [''],
    writer:       [''],
  });

  // ── Genre selection ───────────────────────────────────
  selectedGenres = signal<Set<string>>(new Set());

  toggleGenre(genre: string) {
    this.selectedGenres.update(set => {
      const next = new Set(set);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  }

  isGenreSelected(genre: string) { return this.selectedGenres().has(genre); }
  genresDisplay = computed(() => Array.from(this.selectedGenres()).join(', '));

  // ── Thumbnail ─────────────────────────────────────────
  thumbnailFile    = signal<File | null>(null);
  thumbnailPreview = signal<string | null>(null);
  thumbnailError   = signal<string | null>(null);

  // ── Backdrop ──────────────────────────────────────────
  backdropFile    = signal<File | null>(null);
  backdropPreview = signal<string | null>(null);
  backdropError   = signal<string | null>(null);

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
  isSubmitting  = signal(false);
  submitError   = signal<string | null>(null);
  termsAccepted = signal(false);

  // ── Computed ──────────────────────────────────────────
  stepIndex = computed(() => {
    const map: Record<WizardStep, number> = { rules: -1, details: 0, trailer: 1, movie: 2, copyright: 3, review: 4 };
    return map[this.currentStep()];
  });

  // trailer is optional: done if no file chosen OR upload completed
  trailerReady    = computed(() => !this.trailerFile() || !!this.trailerKey());
  movieReady      = computed(() => !!this.movieKey());
  copyrightReady  = computed(() => !!this.copyrightFile());

  get title()       { return this.detailsForm.get('title'); }
  get logline()    { return this.detailsForm.get('logline'); }
  get synopsis()    { return this.detailsForm.get('synopsis'); }
  get releaseDate() { return this.detailsForm.get('release_date'); }
  get cast()        { return this.detailsForm.get('cast'); }
  get director()    { return this.detailsForm.get('director'); }
  get writer()      { return this.detailsForm.get('writer'); }

  onReleaseDateChange(date: Date): void {
    const iso = toLocalDateString(date); // YYYY-MM-DD
    this.detailsForm.get('release_date')!.setValue(iso);
    this.detailsForm.get('release_date')!.markAsTouched();
  }

  // ── Navigation ────────────────────────────────────────
  startUpload() { this.currentStep.set('details'); }

  nextFromDetails() {
    this.detailsForm.markAllAsTouched();
    if (this.detailsForm.invalid) return;
    if (this.selectedGenres().size === 0) return;
    if (!this.thumbnailFile()) { this.thumbnailError.set('producerUi.upload.thumbnailRequired'); return; }
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
      this.thumbnailError.set('producerUi.common.imageTypeInvalid');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.thumbnailError.set('producerUi.common.imageTooLarge');
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

  // ── Backdrop handlers ─────────────────────────────────
  onBackdropSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.backdropError.set('producerUi.common.imageTypeInvalid');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.backdropError.set('producerUi.common.imageTooLarge');
      return;
    }
    this.backdropError.set(null);
    this.backdropFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.backdropPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeBackdrop() {
    this.backdropFile.set(null);
    this.backdropPreview.set(null);
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
    if (!hasAllowedExtension(file.name, ALLOWED_VIDEO_EXTENSIONS)) {
      this.trailerUploadError.set(this.translate.instant('uploadErrors.videoType', { types: extensionList(ALLOWED_VIDEO_EXTENSIONS) }));
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      this.trailerUploadError.set(this.translate.instant('producerUi.common.fileTooLarge', { size: 100 }));
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
    if (!hasAllowedExtension(file.name, ALLOWED_VIDEO_EXTENSIONS)) errors.push(this.translate.instant('uploadErrors.videoType', { types: extensionList(ALLOWED_VIDEO_EXTENSIONS) }));
    if (file.size > 200 * 1024 * 1024) errors.push(this.translate.instant('producerUi.common.fileTooLarge', { size: 200 }));
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
    if (!hasAllowedExtension(file.name, ALLOWED_DOCUMENT_EXTENSIONS)) {
      this.copyrightError.set(this.translate.instant('uploadErrors.documentType', { types: extensionList(ALLOWED_DOCUMENT_EXTENSIONS) }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.copyrightError.set('producerUi.upload.copyrightSize');
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

    this.uploader.upload(file, this.producerService.movieUploadApi(fieldName), {
      onProgress: pct => {
        if (isTrailer) this.trailerUploadPct.set(pct);
        else           this.movieUploadPct.set(pct);
      },
    }).then(key => {
      if (isTrailer) {
        this.trailerKey.set(key);
        this.isUploadingTrailer.set(false);
      } else {
        this.movieKey.set(key);
        this.isUploadingMovie.set(false);
      }
    }).catch(err => {
      const msg = uploadErrorMessage(err, 'producerUi.common.uploadFailed'); // null = cancelled
      if (isTrailer) {
        this.trailerUploadError.set(msg);
        this.isUploadingTrailer.set(false);
      } else {
        this.movieUploadError.set(msg);
        this.isUploadingMovie.set(false);
      }
    });
  }

  readonly videoAccept = VIDEO_ACCEPT;
  readonly documentAccept = DOCUMENT_ACCEPT;

  // ── Submit ────────────────────────────────────────────
  submit() {
    this.isSubmitting.set(true);
    this.submitError.set(null);

    const v = this.detailsForm.value;
    const fd = new FormData();

    fd.append('title',            v.title!);
    fd.append('overview',         v.synopsis!);
    fd.append('release_date',     v.release_date!);
    fd.append('is_active', 'false');
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
    if (this.backdropFile())  fd.append('backdrop',  this.backdropFile()!);
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
          this.submitError.set('producerUi.upload.submitFailed');
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
