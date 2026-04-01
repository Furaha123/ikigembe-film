import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';
import { ProducerItem } from '../../models/admin.interface';

@Component({
  selector: 'app-admin-movie-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-movie-form.component.html',
  styleUrl: './admin-movie-form.component.scss'
})
export class AdminMovieFormComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  isSaving = signal(false);
  saveError = signal<string | null>(null);
  producers = signal<ProducerItem[]>([]);

  ngOnInit() {
    this.adminService.getProducers().subscribe({
      next: (data) => this.producers.set(Array.isArray(data) ? data : (data as any).results ?? []),
      error: () => {},
    });
  }

  // File selections
  thumbnailFile = signal<File | null>(null);
  videoFile = signal<File | null>(null);
  backdropFile = signal<File | null>(null);
  trailerFile = signal<File | null>(null);

  // Validation errors for required files
  filesError = signal<{ thumbnail?: string; video?: string }>({});

  form = this.fb.group({
    title:                    ['', Validators.required],
    overview:                 ['', Validators.required],
    release_date:             ['', Validators.required],
    price:                    [0, [Validators.min(0)]],
    duration_minutes:         [0, [Validators.min(0)]],
    trailer_duration_seconds: [0, [Validators.min(0)]],
    cast:                     [''],
    genres:                   [''],
    producer:                 [''],
    is_active:                [true],
    has_free_preview:         [false],
  });

  onFileChange(event: Event, field: 'thumbnail' | 'video' | 'backdrop' | 'trailer') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (field === 'thumbnail') {
      this.thumbnailFile.set(file);
      this.filesError.update(e => ({ ...e, thumbnail: undefined }));
    } else if (field === 'video') {
      this.videoFile.set(file);
      this.filesError.update(e => ({ ...e, video: undefined }));
    } else if (field === 'backdrop') {
      this.backdropFile.set(file);
    } else {
      this.trailerFile.set(file);
    }
  }

  removeFile(field: 'thumbnail' | 'video' | 'backdrop' | 'trailer') {
    if (field === 'thumbnail') this.thumbnailFile.set(null);
    else if (field === 'video') this.videoFile.set(null);
    else if (field === 'backdrop') this.backdropFile.set(null);
    else this.trailerFile.set(null);
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  cancel() {
    this.router.navigate(['/admin/movies']);
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const errors: { thumbnail?: string; video?: string } = {};
    if (!this.thumbnailFile()) errors.thumbnail = 'Thumbnail is required';
    if (!this.videoFile()) errors.video = 'Video file is required';
    if (Object.keys(errors).length) { this.filesError.set(errors); return; }

    this.isSaving.set(true);
    this.saveError.set(null);

    const v = this.form.value;
    const fd = new FormData();

    fd.append('title',                    v.title ?? '');
    fd.append('overview',                 v.overview ?? '');
    fd.append('release_date',             v.release_date ?? '');
    fd.append('price',                    String(v.price ?? 0));
    fd.append('duration_minutes',         String(v.duration_minutes ?? 0));
    fd.append('trailer_duration_seconds', String(v.trailer_duration_seconds ?? 0));
    fd.append('is_active',                String(v.is_active ?? true));
    fd.append('has_free_preview',         String(v.has_free_preview ?? false));

    if (v.cast?.trim())     fd.append('cast',     v.cast.trim());
    if (v.genres?.trim())   fd.append('genres',   v.genres.trim());
    if (v.producer?.trim()) fd.append('producer', v.producer.trim());

    fd.append('thumbnail',   this.thumbnailFile()!);
    fd.append('video_file',  this.videoFile()!);
    if (this.backdropFile()) fd.append('backdrop',     this.backdropFile()!);
    if (this.trailerFile())  fd.append('trailer_file', this.trailerFile()!);

    this.adminService.createMovie(fd).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.router.navigate(['/admin/movies']);
      },
      error: (err) => {
        this.isSaving.set(false);
        const body = err?.error;
        if (typeof body === 'object') {
          const first = Object.values(body)[0];
          this.saveError.set(Array.isArray(first) ? first[0] as string : String(first));
        } else {
          this.saveError.set('Something went wrong. Please try again.');
        }
      },
    });
  }
}
