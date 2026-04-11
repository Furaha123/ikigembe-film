import {
  Component, inject, signal, OnInit, OnDestroy, AfterViewChecked,
  ViewChild, ElementRef, PLATFORM_ID, computed
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AdminService } from '../../services/admin.service';
import { DatePickerComponent, type DateRange } from '../../../shared/components/date-picker/date-picker';
import {
  RevenueTrendItem, TopMovieItem, UserGrowthItem, WithdrawalSummaryItem
} from '../../models/admin.interface';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  BarElement, BarController,
  LineController, LineElement, PointElement, Filler,
} from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, BarElement, BarController, LineController, LineElement, PointElement, Filler);

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
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

  // ── Date range ─────────────────────────────────────────
  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

  private defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  onDateRangeChange(range: DateRange) {
    if (range.start) this.dateFrom.set(range.start.toISOString().slice(0, 10));
    if (range.end)   this.dateTo.set(range.end.toISOString().slice(0, 10));
    if (range.start && range.end) this.load();
  }

  // all data is server-filtered by start_date/end_date on load()
  filteredTrend       = computed(() => this.revenueTrend());
  filteredGrowth      = computed(() => this.userGrowth());
  filteredWithdrawals = computed(() => this.withdrawalSummary());

  // ── Computed KPI totals ────────────────────────────────
  totalRevenue       = computed(() => this.filteredTrend().reduce((s, d) => s + d.total_revenue, 0));
  totalCommission    = computed(() => this.filteredTrend().reduce((s, d) => s + d.ikigembe_commission, 0));
  totalProducerShare = computed(() => this.filteredTrend().reduce((s, d) => s + d.producer_share, 0));
  totalPurchases     = computed(() => this.filteredTrend().reduce((s, d) => s + d.purchase_count, 0));
  totalUsers         = computed(() => this.filteredGrowth().reduce((s, d) => s + d.total, 0));

  revenueChange    = computed(() => this.pctChange(this.filteredTrend(), d => d.total_revenue));
  commissionChange = computed(() => this.pctChange(this.filteredTrend(), d => d.ikigembe_commission));
  purchaseChange   = computed(() => this.pctChange(this.filteredTrend(), d => d.purchase_count));
  userChange       = computed(() => this.pctChange(this.filteredGrowth(), (d: any) => d.total));

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
      revenue:     this.adminService.getRevenueTrend('monthly', this.dateFrom(), this.dateTo()),
      topMovies:   this.adminService.getTopMovies(10, this.topSort, this.dateFrom(), this.dateTo()),
      userGrowth:  this.adminService.getUserGrowth(this.dateFrom(), this.dateTo()),
      withdrawals: this.adminService.getWithdrawalSummary(this.dateFrom(), this.dateTo()),
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
    const data   = this.filteredTrend();
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
    const data   = this.filteredGrowth();
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
    const data   = this.filteredWithdrawals();
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
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    // ── Sheet 1: Revenue Trend ──────────────────────────
    const revRows: (string | number)[][] = [
      ['IKIGEMBE PLATFORM REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['REVENUE TREND'],
      ['Period', 'Total Revenue (RWF)', 'Producer Share (RWF)', 'Commission (RWF)', 'Purchases'],
      ...this.filteredTrend().map(d => [
        new Date(d.period_start).toLocaleDateString('en-GB', { month:'long', year:'numeric' }),
        d.total_revenue, d.producer_share, d.ikigembe_commission, d.purchase_count
      ]),
      [],
      ['', 'TOTALS', this.totalProducerShare(), this.totalCommission(), this.totalPurchases()],
    ];
    const wsRev = XLSX.utils.aoa_to_sheet(revRows);
    wsRev['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 12 }];
    wsRev['!rows'] = [{ hpt: 20 }, { hpt: 14 }, { hpt: 6 }]; // title row taller
    XLSX.utils.book_append_sheet(wb, wsRev, 'Revenue Trend');

    // ── Sheet 2: Top Movies ─────────────────────────────
    const movRows: (string | number)[][] = [
      ['TOP MOVIES'],
      [`Generated: ${dateLabel}`],
      [],
      ['Title', 'Producer', 'Views', 'Purchases', 'Revenue (RWF)', 'Producer Share (RWF)'],
      ...this.topMovies().map(d => [
        d.title, d.producer, d.views, d.purchase_count, d.total_revenue, d.producer_share
      ]),
    ];
    const wsMov = XLSX.utils.aoa_to_sheet(movRows);
    wsMov['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsMov, 'Top Movies');

    // ── Sheet 3: User Growth ────────────────────────────
    const growRows: (string | number)[][] = [
      ['USER GROWTH'],
      [`Generated: ${dateLabel}`],
      [],
      ['Month', 'Viewers', 'Producers', 'Total'],
      ...this.filteredGrowth().map(d => [d.month, d.viewers, d.producers, d.total]),
    ];
    const wsGrow = XLSX.utils.aoa_to_sheet(growRows);
    wsGrow['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsGrow, 'User Growth');

    // ── Sheet 4: Withdrawal Summary ─────────────────────
    const wdRows: (string | number)[][] = [
      ['WITHDRAWAL SUMMARY'],
      [`Generated: ${dateLabel}`],
      [],
      ['Month', 'Completed', 'Pending', 'Rejected', 'Total Requests'],
      ...this.filteredWithdrawals().map(d => [
        d.month, d.completed, d.pending, d.rejected, d.request_count
      ]),
    ];
    const wsWd = XLSX.utils.aoa_to_sheet(wdRows);
    wsWd['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsWd, 'Withdrawals');

    XLSX.writeFile(wb, `ikigembe_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
