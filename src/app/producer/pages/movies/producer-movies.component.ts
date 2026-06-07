import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProducerService, ProducerMovie } from '../../services/producer.service';

type SortCol = 'title' | 'views' | 'price' | 'release_date' | 'created_at';

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western',
];

@Component({
  selector: 'app-producer-movies',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './producer-movies.component.html',
  styleUrl: './producer-movies.component.scss',
})
export class ProducerMoviesComponent implements OnInit {
  private readonly producerService = inject(ProducerService);
  private readonly fb              = inject(FormBuilder);
  private readonly router          = inject(Router);

  readonly ALL_GENRES = ALL_GENRES;

  movies    = signal<ProducerMovie[]>([]);
  isLoading = signal(true);
  search    = signal('');
  sortCol   = signal<SortCol>('created_at');
  sortDir   = signal<'asc' | 'desc'>('desc');

  // ── Edit modal ────────────────────────────────────────
  editMovie   = signal<ProducerMovie | null>(null);
  isSaving    = signal(false);
  saveError   = signal<string | null>(null);
  editGenres  = signal<Set<string>>(new Set());

  editForm = this.fb.group({
    title:            ['', [Validators.required, Validators.minLength(2)]],
    overview:         [''],
    price:            [0, [Validators.required, Validators.min(0)]],
    has_free_preview: [false],
  });

  filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const list = q
      ? this.movies().filter(m => m.title.toLowerCase().includes(q))
      : this.movies();

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

  // ── Status helpers ────────────────────────────────────
  statusLabel(m: ProducerMovie): string {
    if (!m.is_active) return 'Inactive';
    if (m.hls_status === 'processing') return 'Processing';
    if (m.hls_status === 'failed') return 'Processing Failed';
    return 'Active';
  }

  statusClass(m: ProducerMovie): string {
    if (!m.is_active) return 'status-review';
    if (m.hls_status === 'failed') return 'status-rejected';
    if (m.hls_status === 'processing') return 'status-review';
    return 'status-approved';
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

  goToUpload() { this.router.navigate(['/producer/upload']); }
}
