import {
  Component, inject, signal, computed, OnInit,
  AfterViewChecked, ViewChild, ElementRef, PLATFORM_ID, OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { ProducerService, ProducerEarningsReport, ProducerEarningsTrendItem } from '../../../services/producer.service';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  BarElement, BarController,
} from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, BarElement, BarController);

@Component({
  selector: 'app-producer-earnings-report',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './producer-earnings-report.component.html',
  styleUrl: './producer-earnings-report.component.scss',
})
export class ProducerEarningsReportComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly producerService = inject(ProducerService);
  private readonly platformId      = inject(PLATFORM_ID);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

  report    = signal<ProducerEarningsReport | null>(null);
  trend     = computed(() => this.report()?.trend ?? []);
  isLoading = signal(true);
  hasError  = signal(false);

  totalRevenue   = computed(() => this.report()?.kpis.total_gross_revenue ?? 0);
  totalShare     = computed(() => this.report()?.kpis.total_net_earnings ?? 0);
  totalPurchases = computed(() => this.report()?.kpis.total_purchases ?? 0);
  commission     = computed(() => this.report()?.kpis.total_platform_commission ?? 0);

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
    this.sub = this.producerService.getEarningsReport(
      'monthly',
      this.dateFrom() || undefined,
      this.dateTo()   || undefined,
    ).subscribe({
      next: (data) => {
        this.report.set(data);
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
    const data   = this.trend();
    const labels = data.map(d => this.shortMonth(d.period_start));
    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Gross Revenue',  data: data.map(d => d.gross_revenue),      backgroundColor: 'rgba(197,162,83,0.7)',  borderRadius: 5, borderSkipped: false as const },
          { label: 'Your Earnings',  data: data.map(d => d.producer_earnings),  backgroundColor: 'rgba(52,211,153,0.7)', borderRadius: 5, borderSkipped: false as const },
          { label: 'Commission',     data: data.map(d => d.platform_commission), backgroundColor: 'rgba(239,68,68,0.5)',  borderRadius: 5, borderSkipped: false as const },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#666', font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
          tooltip: {
            backgroundColor: '#1c1c1c', borderColor: '#333', borderWidth: 1,
            titleColor: '#888', bodyColor: '#e5e5e5', mode: 'index' as const,
            callbacks: { label: (ctx: any) => `  ${ctx.dataset.label}: RWF ${ctx.parsed.y.toLocaleString()}` },
          },
        },
        scales: {
          x: { ticks: { color: '#555', font: { size: 11 } }, grid: { display: false }, border: { display: false } },
          y: {
            ticks: { color: '#555', font: { size: 11 }, callback: (v: any) => Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : String(v) },
            grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
          },
        },
      },
    });
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['EARNINGS REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['SUMMARY'],
      ['Gross Revenue (RWF)', 'Net Earnings (RWF)', 'Commission (RWF)', 'Purchases'],
      [this.totalRevenue(), this.totalShare(), this.commission(), this.totalPurchases()],
      [],
      ['TREND'],
      ['Period', 'Gross Revenue (RWF)', 'Commission (RWF)', 'Your Earnings (RWF)', 'Transactions'],
      ...this.trend().map(d => [
        new Date(d.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        d.gross_revenue, d.platform_commission, d.producer_earnings, d.transactions,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Earnings Report');
    XLSX.writeFile(wb, `earnings_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
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

  private shortMonth(s: string): string {
    if (!s) return '';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); this.chart?.destroy(); }
}
