import {
  Component, inject, signal, OnInit, OnDestroy, AfterViewChecked,
  ViewChild, ElementRef, PLATFORM_ID, computed
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AdminService } from '../../services/admin.service';
import {
  RevenueTrendItem, TopMovieItem, UserGrowthItem, WithdrawalSummaryItem
} from '../../models/admin.interface';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  BarElement, BarController,
  LineController, LineElement, PointElement, Filler,
} from 'chart.js';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, BarElement, BarController, LineController, LineElement, PointElement, Filler);

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-reports.component.html',
  styleUrl: './admin-reports.component.scss',
})
export class AdminReportsComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly platformId   = inject(PLATFORM_ID);

  revenueTrend      = signal<RevenueTrendItem[]>([]);
  topMovies         = signal<TopMovieItem[]>([]);
  userGrowth        = signal<UserGrowthItem[]>([]);
  withdrawalSummary = signal<WithdrawalSummaryItem[]>([]);

  isLoading = signal(true);
  loadError = signal(false);
  topSort: 'revenue' | 'views' = 'revenue';
  activeRevenueTab: 'revenue' | 'commission' | 'producer' = 'revenue';

  // ── Computed KPI totals ────────────────────────────────
  totalRevenue       = computed(() => this.revenueTrend().reduce((s, d) => s + d.total_revenue, 0));
  totalCommission    = computed(() => this.revenueTrend().reduce((s, d) => s + d.ikigembe_commission, 0));
  totalProducerShare = computed(() => this.revenueTrend().reduce((s, d) => s + d.producer_share, 0));
  totalPurchases     = computed(() => this.revenueTrend().reduce((s, d) => s + d.purchase_count, 0));
  totalUsers         = computed(() => this.userGrowth().reduce((s, d) => s + d.total, 0));

  revenueChange = computed(() => this.pctChange(this.revenueTrend(), d => d.total_revenue));
  commissionChange = computed(() => this.pctChange(this.revenueTrend(), d => d.ikigembe_commission));
  purchaseChange = computed(() => this.pctChange(this.revenueTrend(), d => d.purchase_count));
  userChange = computed(() => this.pctChange(this.userGrowth(), (d: any) => d.total));

  @ViewChild('revenueCanvas')    revenueCanvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('growthCanvas')     growthCanvas!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('withdrawalCanvas') withdrawalCanvas!: ElementRef<HTMLCanvasElement>;

  private charts: Record<string, Chart | null> = { revenue: null, growth: null, withdrawal: null };
  private chartsBuilt = false;

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.chartsBuilt = false;
    forkJoin({
      revenue:     this.adminService.getRevenueTrend(),
      topMovies:   this.adminService.getTopMovies(10, this.topSort),
      userGrowth:  this.adminService.getUserGrowth(),
      withdrawals: this.adminService.getWithdrawalSummary(),
    }).subscribe({
      next: (data) => {
        this.revenueTrend.set(data.revenue.trend ?? []);
        this.topMovies.set(data.topMovies.results ?? []);
        this.userGrowth.set(data.userGrowth.trend ?? []);
        this.withdrawalSummary.set(data.withdrawals.trend ?? []);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); this.loadError.set(true); },
    });
  }

  ngAfterViewChecked() {
    if (this.isLoading() || this.chartsBuilt || !isPlatformBrowser(this.platformId)) return;
    if (!this.revenueCanvas?.nativeElement || !this.growthCanvas?.nativeElement || !this.withdrawalCanvas?.nativeElement) return;
    this.chartsBuilt = true;
    this.buildRevenueChart();
    this.buildGrowthChart();
    this.buildWithdrawalChart();
  }

  switchRevenueTab(tab: 'revenue' | 'commission' | 'producer') {
    this.activeRevenueTab = tab;
    this.buildRevenueChart();
  }

  switchTopSort(sort: 'revenue' | 'views') {
    this.topSort = sort;
    this.adminService.getTopMovies(10, sort).subscribe({
      next: (data) => this.topMovies.set(data.results ?? []),
    });
  }

  getBarWidth(movie: TopMovieItem): number {
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

    const colorMap = { revenue: '#C5A253', commission: '#818cf8', producer: '#34d399' };
    const labelMap = { revenue: 'Total Revenue', commission: 'Platform Commission', producer: 'Producer Share' };
    const dataMap  = {
      revenue:    data.map(d => d.total_revenue),
      commission: data.map(d => d.ikigembe_commission),
      producer:   data.map(d => d.producer_share),
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

  private buildGrowthChart() {
    this.charts['growth']?.destroy();
    const data   = this.userGrowth();
    const labels = data.map(d => this.shortMonth(d.month));
    this.charts['growth'] = new Chart(this.growthCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Viewers',   data: data.map(d => d.viewers),   backgroundColor: 'rgba(96,165,250,0.75)',  borderRadius: 5, borderSkipped: false },
          { label: 'Producers', data: data.map(d => d.producers), backgroundColor: 'rgba(197,162,83,0.75)', borderRadius: 5, borderSkipped: false },
        ],
      },
      options: this.barOpts(),
    });
  }

  private buildWithdrawalChart() {
    this.charts['withdrawal']?.destroy();
    const data   = this.withdrawalSummary();
    const labels = data.map(d => this.shortMonth(d.month));
    this.charts['withdrawal'] = new Chart(this.withdrawalCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Completed', data: data.map(d => d.completed), backgroundColor: 'rgba(52,211,153,0.8)',  borderRadius: 5, borderSkipped: false },
          { label: 'Pending',   data: data.map(d => d.pending),   backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 5, borderSkipped: false },
          { label: 'Rejected',  data: data.map(d => d.rejected),  backgroundColor: 'rgba(239,68,68,0.8)',  borderRadius: 5, borderSkipped: false },
        ],
      },
      options: this.barOpts(),
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

  private barOpts() {
    return {
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
    };
  }

  // ── Export ─────────────────────────────────────────────
  exportAll() {
    const rows: string[] = [];
    rows.push('IKIGEMBE PLATFORM REPORT — ' + new Date().toDateString());
    rows.push('');
    rows.push('REVENUE TREND');
    rows.push('Period,Total Revenue (RWF),Producer Share (RWF),Commission (RWF),Purchases');
    this.revenueTrend().forEach(d =>
      rows.push(`${d.period_start},${d.total_revenue},${d.producer_share},${d.ikigembe_commission},${d.purchase_count}`)
    );
    rows.push('');
    rows.push('TOP MOVIES');
    rows.push('Title,Producer,Views,Purchases,Revenue (RWF),Producer Share (RWF)');
    this.topMovies().forEach(d =>
      rows.push(`"${d.title}","${d.producer}",${d.views},${d.purchase_count},${d.total_revenue},${d.producer_share}`)
    );
    rows.push('');
    rows.push('USER GROWTH');
    rows.push('Month,Viewers,Producers,Total');
    this.userGrowth().forEach(d => rows.push(`${d.month},${d.viewers},${d.producers},${d.total}`));
    rows.push('');
    rows.push('WITHDRAWAL SUMMARY');
    rows.push('Month,Completed,Pending,Rejected,Total Requests');
    this.withdrawalSummary().forEach(d =>
      rows.push(`${d.month},${d.completed},${d.pending},${d.rejected},${d.request_count}`)
    );
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `ikigembe_report_${new Date().toISOString().slice(0,10)}.csv`;
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
