import {
  Component, inject, signal, OnInit,
  AfterViewChecked, ViewChild, ElementRef, PLATFORM_ID, OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminService } from '../../../services/admin.service';
import { UserGrowthItem } from '../../../models/admin.interface';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  BarElement, BarController,
} from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, BarElement, BarController);

@Component({
  selector: 'app-user-growth',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './user-growth.component.html',
  styleUrl: './user-growth.component.scss',
})
export class UserGrowthComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly platformId   = inject(PLATFORM_ID);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

  growth    = signal<UserGrowthItem[]>([]);
  isLoading = signal(true);
  hasError  = signal(false);

  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;
  private needsBuild = false;
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
    this.needsBuild = false;
    this.sub = this.adminService.getUserGrowth(
      this.dateFrom() || undefined,
      this.dateTo()   || undefined,
    ).subscribe({
      next: (data) => {
        this.growth.set(data.trend ?? []);
        this.isLoading.set(false);
        this.needsBuild = true;
      },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  ngAfterViewChecked(): void {
    if (!this.needsBuild || !isPlatformBrowser(this.platformId) || !this.canvas?.nativeElement) return;
    this.needsBuild = false;
    this.buildChart();
  }

  private buildChart(): void {
    this.chart?.destroy();
    if (!this.canvas?.nativeElement) return;
    const data   = this.growth();
    const labels = data.map(d => this.shortMonth(d.month));
    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Viewers',   data: data.map(d => d.viewers),   backgroundColor: 'rgba(96,165,250,0.75)',  borderRadius: 5, borderSkipped: false as const },
          { label: 'Producers', data: data.map(d => d.producers), backgroundColor: 'rgba(197,162,83,0.75)', borderRadius: 5, borderSkipped: false as const },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#666', font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
          tooltip: {
            backgroundColor: '#1c1c1c', borderColor: '#333', borderWidth: 1,
            titleColor: '#888', bodyColor: '#e5e5e5', mode: 'index' as const,
          },
        },
        scales: {
          x: { ticks: { color: '#555', font: { size: 11 } }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: '#555', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
        },
      },
    });
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['USER GROWTH REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['Month', 'Viewers', 'Producers', 'Total', 'Active Users', 'Paying Users'],
      ...this.growth().map(d => [d.month, d.viewers, d.producers, d.total, d.active_users, d.paying_users]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'User Growth');
    XLSX.writeFile(wb, `user_growth_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  private defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  private shortMonth(s: string): string {
    if (!s) return '';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.chart?.destroy();
  }
}
