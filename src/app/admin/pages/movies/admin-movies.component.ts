import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';
import { AdminMovie } from '../../models/admin.interface';

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

  movies = signal<AdminMovie[]>([]);
  isLoading = signal(true);
  actionId = signal<number | null>(null);
  confirmDelete = signal<number | null>(null);

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
  }

  loadMovies() {
    this.isLoading.set(true);
    this.adminService.getMovies().subscribe({
      next: (data) => { this.movies.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
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
