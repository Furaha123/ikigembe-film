import {
  Component, inject, signal, computed, OnInit,
  AfterViewChecked, ViewChild, ElementRef, PLATFORM_ID, OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  ProducerService, ProducerEarningsTrendItem, ProducerEarningsKpis,
} from '../../../services/producer.service';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  LineController, LineElement, PointElement, Filler,
} from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, LineController, LineElement, PointElement, Filler);

const NULL_KPIS: ProducerEarningsKpis = {
  total_gross_revenue: 0,
  total_net_earnings: 0,
  total_platform_commission: 0,
  total_purchases: 0,
  total_movies: 0,
  avg_revenue_per_movie: 0,
  avg_completion_rate: 0,
  best_movie: null,
};

@Component({
  selector: 'app-producer-revenue-trend',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './producer-revenue-trend.component.html',
  styleUrl: './producer-revenue-trend.component.scss',
})
export class ProducerRevenueTrendComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly producerService = inject(ProducerService);
  private readonly platformId      = inject(PLATFORM_ID);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

  kpis       = signal<ProducerEarningsKpis>(NULL_KPIS);
  trend      = signal<ProducerEarningsTrendItem[]>([]);
  isLoading  = signal(true);
  hasError   = signal(false);
  activeTab: 'revenue' | 'share' = 'revenue';

  totalRevenue   = computed(() => this.kpis().total_gross_revenue);
  totalShare     = computed(() => this.kpis().total_net_earnings);
  totalPurchases = computed(() => this.kpis().total_purchases);
  commission     = computed(() => this.kpis().total_platform_commission);

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
        this.kpis.set(data.kpis ?? NULL_KPIS);
        this.trend.set(data.trend ?? []);
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

  switchTab(tab: 'revenue' | 'share'): void {
    this.activeTab = tab;
    this.buildChart();
  }

  private buildChart(): void {
    this.chart?.destroy();
    if (!this.canvas?.nativeElement) return;
    const data   = this.trend();
    const labels = data.map(d => this.shortMonth(d.period_start));
    const colorMap = { revenue: '#C5A253', share: '#34d399' };
    const labelMap = { revenue: 'Gross Revenue', share: 'Your Earnings' };
    const dataMap  = {
      revenue: data.map(d => d.gross_revenue),
      share:   data.map(d => d.producer_earnings),
    };
    const color = colorMap[this.activeTab];
    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: labelMap[this.activeTab],
          data: dataMap[this.activeTab],
          borderColor: color,
          backgroundColor: color + '14',
          fill: true, tension: 0.45,
          pointRadius: 4, pointHoverRadius: 7,
          pointBackgroundColor: color, pointBorderColor: '#0f0f0f', pointBorderWidth: 2,
          borderWidth: 2.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1c1c', borderColor: '#333', borderWidth: 1,
            titleColor: '#888', bodyColor: '#e5e5e5', padding: 10,
            callbacks: { label: (ctx: any) => `  RWF ${ctx.parsed.y.toLocaleString()}` },
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
    const k = this.kpis();
    const rows: (string | number | null)[][] = [
      ['REVENUE TREND REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['SUMMARY'],
      ['Gross Revenue (RWF)', 'Net Earnings (RWF)', 'Platform Commission (RWF)', 'Purchases'],
      [k.total_gross_revenue, k.total_net_earnings, k.total_platform_commission, k.total_purchases],
      [],
      ['TREND'],
      ['Period', 'Gross Revenue (RWF)', 'Platform Commission (RWF)', 'Your Earnings (RWF)', 'Transactions'],
      ...this.trend().map(d => [
        new Date(d.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        d.gross_revenue, d.platform_commission, d.producer_earnings, d.transactions,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 26 }, { wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Trend');
    XLSX.writeFile(wb, `revenue_trend_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
