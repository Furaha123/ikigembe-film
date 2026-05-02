import {
  Component, inject, signal, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminService } from '../../../services/admin.service';
import { TopMovieItem } from '../../../models/admin.interface';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-top-movies',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './top-movies.component.html',
  styleUrl: './top-movies.component.scss',
})
export class TopMoviesComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

  movies    = signal<TopMovieItem[]>([]);
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

  setDateRange(from: string, to: string): void {
    this.dateFrom.set(from);
    this.dateTo.set(to);
    this.load();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.isLoading.set(true);
    this.hasError.set(false);
    this.sub = this.adminService.getTopMovies(
      10,
      this.sort,
      this.dateFrom() || undefined,
      this.dateTo()   || undefined,
    ).subscribe({
      next:  (data) => { this.movies.set(data.results ?? []); this.isLoading.set(false); },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  switchSort(sort: 'revenue' | 'views'): void {
    this.sort = sort;
    this.load();
  }

  getBarWidth(movie: TopMovieItem): number {
    const list = this.movies();
    if (!list.length) return 0;
    const max = Math.max(...list.map(m => this.sort === 'revenue' ? m.total_revenue : m.views));
    if (!max) return 0;
    return Math.round(((this.sort === 'revenue' ? movie.total_revenue : movie.views) / max) * 100);
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['TOP MOVIES REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['Rank', 'Title', 'Producer', 'Views', 'Purchases', 'Revenue (RWF)', 'Producer Share (RWF)'],
      ...this.movies().map((m, i) => [
        i + 1, m.title, m.producer, m.views, m.purchase_count, m.total_revenue, m.producer_share,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Top Movies');
    XLSX.writeFile(wb, `top_movies_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
