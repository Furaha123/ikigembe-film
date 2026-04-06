import {
  Component, inject, signal, OnInit, OnDestroy, AfterViewChecked,
  ViewChild, ElementRef, PLATFORM_ID, computed
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { forkJoin } from 'rxjs';
import {
  ProducerService, ProducerRevenueTrendItem, ProducerTopMovieItem, ProducerReportData
} from '../../services/producer.service';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  BarElement, BarController,
  LineController, LineElement, PointElement, Filler,
} from 'chart.js';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, BarElement, BarController, LineController, LineElement, PointElement, Filler);

@Component({
  selector: 'app-producer-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './producer-reports.component.html',
  styleUrl: './producer-reports.component.scss',
})
export class ProducerReportsComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly producerService = inject(ProducerService);
  private readonly platformId      = inject(PLATFORM_ID);

  revenueTrend = signal<ProducerRevenueTrendItem[]>([]);
  topMovies    = signal<ProducerTopMovieItem[]>([]);

  isLoading = signal(true);
  loadError = signal(false);
  topSort: 'revenue' | 'views' = 'revenue';
  activeRevenueTab: 'revenue' | 'share' = 'revenue';

  // ── Computed KPI totals ────────────────────────────────
  totalRevenue   = computed(() => this.revenueTrend().reduce((s, d) => s + d.total_revenue, 0));
  totalShare     = computed(() => this.revenueTrend().reduce((s, d) => s + d.producer_share, 0));
  totalPurchases = computed(() => this.revenueTrend().reduce((s, d) => s + d.purchase_count, 0));
  totalViews     = computed(() => this.topMovies().reduce((s, m) => s + m.views, 0));

  revenueChange  = computed(() => this.pctChange(this.revenueTrend(), d => d.total_revenue));
  shareChange    = computed(() => this.pctChange(this.revenueTrend(), d => d.producer_share));
  purchaseChange = computed(() => this.pctChange(this.revenueTrend(), d => d.purchase_count));

  @ViewChild('revenueCanvas') revenueCanvas!: ElementRef<HTMLCanvasElement>;

  private charts: Record<string, Chart | null> = { revenue: null };
  private chartsBuilt = false;

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.chartsBuilt = false;
    forkJoin({
      trend: this.producerService.getRevenueTrend(),
      report: this.producerService.getReport(),
    }).subscribe({
      next: (data) => {
        this.revenueTrend.set(data.trend.trend ?? []);
        this.topMovies.set(data.report.top_movies ?? []);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); this.loadError.set(true); },
    });
  }

  ngAfterViewChecked() {
    if (this.isLoading() || this.chartsBuilt || !isPlatformBrowser(this.platformId)) return;
    if (!this.revenueCanvas?.nativeElement) return;
    this.chartsBuilt = true;
    this.buildRevenueChart();
  }

  switchRevenueTab(tab: 'revenue' | 'share') {
    this.activeRevenueTab = tab;
    this.buildRevenueChart();
  }

  switchTopSort(sort: 'revenue' | 'views') {
    this.topSort = sort;
  }

  getBarWidth(movie: ProducerTopMovieItem): number {
    const list = this.topMovies();
    if (!list.length) return 0;
    const max = Math.max(...list.map(m => this.topSort === 'revenue' ? m.total_revenue : m.views));
    if (!max) return 0;
    return Math.round(((this.topSort === 'revenue' ? movie.total_revenue : movie.views) / max) * 100);
  }

  private buildRevenueChart() {
    this.charts['revenue']?.destroy();
    const data   = this.revenueTrend();
    const labels = data.map(d => this.shortMonth(d.period_start));

    const colorMap = { revenue: '#C5A253', share: '#34d399' };
    const labelMap = { revenue: 'Total Revenue', share: 'Your Share' };
    const dataMap  = {
      revenue: data.map(d => d.total_revenue),
      share:   data.map(d => d.producer_share),
    };

    const color = colorMap[this.activeRevenueTab];

    this.charts['revenue'] = new Chart(this.revenueCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: labelMap[this.activeRevenueTab],
          data: dataMap[this.activeRevenueTab],
          borderColor: color,
          backgroundColor: color.replace(')', ', 0.08)').replace('rgb', 'rgba'),
          fill: true, tension: 0.45,
          pointRadius: 4, pointHoverRadius: 7,
          pointBackgroundColor: color,
          pointBorderColor: '#0f0f0f',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }],
      },
      options: this.lineOpts(),
    });
  }

  private lineOpts() {
    return {
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
    };
  }

  // ── Export ─────────────────────────────────────────────
  exportAll() {
    const rows: string[] = [];
    rows.push('IKIGEMBE PRODUCER REPORT — ' + new Date().toDateString());
    rows.push('');
    rows.push('REVENUE TREND');
    rows.push('Period,Total Revenue (RWF),Your Share (RWF),Purchases');
    this.revenueTrend().forEach(d =>
      rows.push(`${d.period_start},${d.total_revenue},${d.producer_share},${d.purchase_count}`)
    );
    rows.push('');
    rows.push('TOP MOVIES');
    rows.push('Title,Views,Purchases,Revenue (RWF),Your Share (RWF)');
    this.topMovies().forEach(d =>
      rows.push(`"${d.title}",${d.views},${d.purchase_count},${d.total_revenue},${d.producer_share}`)
    );
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `ikigembe_producer_report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private pctChange<T>(arr: T[], getValue: (item: T) => number): number {
    if (arr.length < 2) return 0;
    const curr = getValue(arr[arr.length - 1]);
    const prev = getValue(arr[arr.length - 2]);
    if (!prev) return 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  private shortMonth(s: string): string {
    if (!s) return '';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  ngOnDestroy() {
    Object.values(this.charts).forEach(c => c?.destroy());
  }
}
