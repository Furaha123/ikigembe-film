import {
  Component, inject, signal, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ProducerService, ProducerTopMovieItem } from '../../../services/producer.service';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-producer-movies-performance',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './producer-movies-performance.component.html',
  styleUrl: './producer-movies-performance.component.scss',
})
export class ProducerMoviesPerformanceComponent implements OnInit, OnDestroy {
  private readonly producerService = inject(ProducerService);

  dateFrom  = signal<string>(this.defaultFrom());
  dateTo    = signal<string>(new Date().toISOString().slice(0, 10));

  movies    = signal<ProducerTopMovieItem[]>([]);
  isLoading = signal(true);
  hasError  = signal(false);
  sort: 'revenue' | 'views' = 'revenue';

  private sub: Subscription | null = null;

  ngOnInit(): void { this.load(); }

  onDateRangeChange(range: DateRange): void {
    if (range.start) this.dateFrom.set(range.start.toISOString().slice(0, 10));
    if (range.end)   this.dateTo.set(range.end.toISOString().slice(0, 10));
    if (range.start && range.end) this.load();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.isLoading.set(true);
    this.hasError.set(false);
    this.sub = this.producerService.getReport(
      this.dateFrom() || undefined,
      this.dateTo()   || undefined,
    ).subscribe({
      next: (data) => {
        this.movies.set(data.top_movies ?? []);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  switchSort(sort: 'revenue' | 'views'): void {
    this.sort = sort;
  }

  sortedMovies(): ProducerTopMovieItem[] {
    const list = [...this.movies()];
    return list.sort((a, b) =>
      this.sort === 'revenue'
        ? b.total_revenue - a.total_revenue
        : b.views - a.views
    );
  }

  getBarWidth(movie: ProducerTopMovieItem): number {
    const list = this.sortedMovies();
    if (!list.length) return 0;
    const max = Math.max(...list.map(m => this.sort === 'revenue' ? m.total_revenue : m.views));
    if (!max) return 0;
    return Math.round(((this.sort === 'revenue' ? movie.total_revenue : movie.views) / max) * 100);
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['MOVIES PERFORMANCE REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['Rank', 'Title', 'Views', 'Purchases', 'Total Revenue (RWF)', 'Your Share (RWF)'],
      ...this.sortedMovies().map((m, i) => [
        i + 1, m.title, m.views, m.purchase_count, m.total_revenue, m.producer_share,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Movies Performance');
    XLSX.writeFile(wb, `movies_performance_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  private defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
