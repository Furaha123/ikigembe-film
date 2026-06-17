import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ProducerService, ProducerMovie } from '../../services/producer.service';

type SortCol = 'title' | 'views' | 'price' | 'release_date' | 'created_at';
type StatusTab = 'all' | 'live' | 'pending' | 'rejected';

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western',
];

@Component({
  selector: 'app-producer-movies',
  imports: [TranslatePipe, TranslateDirective, CommonModule, FormsModule, ReactiveFormsModule],
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
    return m.approval_status === 'pending_review' || m.approval_status === 'rejected' || m.approval_status === 'changes_requested';
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
  goToContract() { this.router.navigate(['/producer/contracts/start']); }
}
