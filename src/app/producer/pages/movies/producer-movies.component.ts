import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProducerService, ProducerMovie } from '../../services/producer.service';

type SortCol = 'title' | 'views' | 'price' | 'release_date';

@Component({
  selector: 'app-producer-movies',
  imports: [CommonModule, FormsModule],
  templateUrl: './producer-movies.component.html',
  styleUrl: './producer-movies.component.scss',
})
export class ProducerMoviesComponent implements OnInit {
  private readonly producerService = inject(ProducerService);
  private readonly router          = inject(Router);

  movies    = signal<ProducerMovie[]>([]);
  isLoading = signal(true);
  search    = signal('');
  sortCol   = signal<SortCol>('release_date');
  sortDir   = signal<'asc' | 'desc'>('desc');

  filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const list = q
      ? this.movies().filter(m => m.title.toLowerCase().includes(q))
      : this.movies();

    const col = this.sortCol();
    const dir = this.sortDir();
    return [...list].sort((a, b) => {
      let va: string | number = (a[col] as string | number) ?? 0;
      let vb: string | number = (b[col] as string | number) ?? 0;
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
}
