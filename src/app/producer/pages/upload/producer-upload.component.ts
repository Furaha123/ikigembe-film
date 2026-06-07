import { Component, inject, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProducerService } from '../../services/producer.service';

type WizardStep = 'rules' | 'details' | 'trailer' | 'movie' | 'review';

const UPLOAD_RULES = [
  'Movie must be between 10 and 30 minutes.',
  'File size must not exceed 100 MB per file.',
  'Video quality must be 4K or HD.',
  'Good sound quality and clear visuals are required.',
  'Your movie must have subtitles.',
  'The story must be original and of high quality.',
];

@Component({
  selector: 'app-producer-upload',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './producer-upload.component.html',
  styleUrl: './producer-upload.component.scss',
})
export class ProducerUploadComponent {
  private readonly fb              = inject(FormBuilder);
  private readonly producerService = inject(ProducerService);
  private readonly router          = inject(Router);

  readonly RULES = UPLOAD_RULES;

  currentStep   = signal<WizardStep>('rules');
  submitSuccess = signal(false);

  // ── Details form ─────────────────────────────────────
  detailsForm = this.fb.group({
    title:    ['', [Validators.required, Validators.minLength(2)]],
    longline: ['', [Validators.required, Validators.minLength(10)]],
    synopsis: ['', [Validators.required, Validators.minLength(20)]],
  });

  // ── Trailer ───────────────────────────────────────────
  trailerFile        = signal<File | null>(null);
  trailerKey         = signal<string | null>(null);
  trailerDescription = signal('');
  trailerError       = signal<string | null>(null);
  isUploadingTrailer = signal(false);
  trailerProgress    = signal(0);
  isDraggingTrailer  = signal(false);

  // ── Full Movie ────────────────────────────────────────
  movieFile        = signal<File | null>(null);
  movieKey         = signal<string | null>(null);
  movieErrors      = signal<string[]>([]);
  isUploadingMovie = signal(false);
  movieProgress    = signal(0);
  isDraggingMovie  = signal(false);

  // ── Submit ────────────────────────────────────────────
  isSubmitting = signal(false);
  submitError  = signal<string | null>(null);

  // ── Computed ──────────────────────────────────────────
  stepIndex = computed(() => {
    const map: Record<WizardStep, number> = { rules: -1, details: 0, trailer: 1, movie: 2, review: 3 };
    return map[this.currentStep()];
  });

  detailsDone = computed(() => this.detailsForm.valid);
  trailerDone = computed(() => !!this.trailerKey());
  movieDone   = computed(() => !!this.movieKey());

  get title()    { return this.detailsForm.get('title'); }
  get longline() { return this.detailsForm.get('longline'); }
  get synopsis() { return this.detailsForm.get('synopsis'); }

  // ── Navigation ────────────────────────────────────────
  startUpload() { this.currentStep.set('details'); }

  nextFromDetails() {
    this.detailsForm.markAllAsTouched();
    if (this.detailsForm.invalid) return;
    this.currentStep.set('trailer');
  }

  nextFromTrailer() { this.currentStep.set('movie'); }
  nextFromMovie()   { this.currentStep.set('review'); }

  goBack() {
    const prev: Record<WizardStep, WizardStep | null> = {
      rules: null, details: 'rules', trailer: 'details', movie: 'trailer', review: 'movie',
    };
    const p = prev[this.currentStep()];
    if (p) this.currentStep.set(p);
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
  setTrailerDescription(e: Event) {
    this.trailerDescription.set((e.target as HTMLTextAreaElement).value);
  }

  private handleTrailerFile(file: File) {
    this.trailerError.set(null);
    if (!file.name.match(/\.(mp4|mov)$/i)) {
      this.trailerError.set('Only .mp4 and .mov formats are accepted.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      this.trailerError.set('File size must not exceed 100 MB.');
      return;
    }
    this.trailerFile.set(file);
    this.runSimulatedUpload(this.trailerProgress, this.isUploadingTrailer, () => {
      this.trailerKey.set(`uploads/trailers/${Date.now()}-${file.name.replace(/\s+/g, '_')}`);
    });
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
    if (file.size > 100 * 1024 * 1024) errors.push('File size must not exceed 100 MG.');
    if (errors.length) { this.movieErrors.set(errors); return; }
    this.movieErrors.set([]);
    this.movieFile.set(file);
    this.runSimulatedUpload(this.movieProgress, this.isUploadingMovie, () => {
      this.movieKey.set(`uploads/films/${Date.now()}-${file.name.replace(/\s+/g, '_')}`);
    });
  }

  private runSimulatedUpload(
    progress: WritableSignal<number>,
    uploading: WritableSignal<boolean>,
    onDone: () => void
  ) {
    uploading.set(true);
    progress.set(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      progress.set(Math.min(Math.round((step / 20) * 100), 100));
      if (step >= 20) {
        clearInterval(interval);
        uploading.set(false);
        onDone();
      }
    }, 100);
  }

  // ── Submit ────────────────────────────────────────────
  submit() {
    this.isSubmitting.set(true);
    this.submitError.set(null);
    const meta = this.detailsForm.value;
    this.producerService.submitFilm({
      video_key:         this.movieKey()!,
      copyright_key:     '',
      id_key:            '',
      terms_accepted:    true,
      terms_accepted_at: new Date().toISOString(),
      metadata: {
        title:            meta.title!,
        synopsis:         meta.synopsis!,
        genre:            '',
        duration_minutes: 0,
        director:         '',
        writer:           '',
        cast:             '',
        release_year:     new Date().getFullYear(),
        quality:          'HD (720p)',
      },
    }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.submitSuccess.set(true);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.submitError.set(err?.error?.detail ?? 'Submission failed. Please try again.');
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
