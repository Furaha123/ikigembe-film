import {
  Component, inject, signal, OnInit,
  AfterViewChecked, ViewChild, ElementRef, PLATFORM_ID, OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminService } from '../../../services/admin.service';
import { WithdrawalSummaryItem } from '../../../models/admin.interface';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  BarElement, BarController,
} from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, BarElement, BarController);

@Component({
  selector: 'app-withdrawal-summary',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './withdrawal-summary.component.html',
  styleUrl: './withdrawal-summary.component.scss',
})
export class WithdrawalSummaryComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly platformId   = inject(PLATFORM_ID);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

  summary   = signal<WithdrawalSummaryItem[]>([]);
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

  setDateRange(from: string, to: string): void {
    this.dateFrom.set(from);
    this.dateTo.set(to);
    this.load();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.isLoading.set(true);
    this.hasError.set(false);
    this.needsBuild = false;
    this.sub = this.adminService.getWithdrawalSummary(
      this.dateFrom() || undefined,
      this.dateTo()   || undefined,
    ).subscribe({
      next: (data) => {
        this.summary.set(data.trend ?? []);
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
    const data   = this.summary();
    const labels = data.map(d => this.shortMonth(d.month));
    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Completed', data: data.map(d => d.completed), backgroundColor: 'rgba(52,211,153,0.8)',  borderRadius: 5, borderSkipped: false as const },
          { label: 'Pending',   data: data.map(d => d.pending),   backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 5, borderSkipped: false as const },
          { label: 'Rejected',  data: data.map(d => d.rejected),  backgroundColor: 'rgba(239,68,68,0.8)',  borderRadius: 5, borderSkipped: false as const },
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
      ['WITHDRAWAL SUMMARY REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['Month', 'Completed', 'Pending', 'Rejected', 'Total Requests'],
      ...this.summary().map(d => [d.month, d.completed, d.pending, d.rejected, d.request_count]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Withdrawals');
    XLSX.writeFile(wb, `withdrawal_summary_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
