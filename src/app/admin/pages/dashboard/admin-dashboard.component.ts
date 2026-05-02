import {
  Component, signal, computed, inject, OnInit, OnDestroy,
  AfterViewChecked, ViewChild, ElementRef, PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  Chart, CategoryScale, LinearScale, Tooltip,
  LineController, LineElement, PointElement, Filler,
} from 'chart.js';
import { AdminService } from '../../services/admin.service';
import type { DashboardOverview, RevenueTrendItem, TransactionHistory } from '../../models/admin.interface';

Chart.register(CategoryScale, LinearScale, Tooltip, LineController, LineElement, PointElement, Filler);

type ChartTab = 'revenue' | 'commission' | 'producer';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly platformId   = inject(PLATFORM_ID);

  @ViewChild('trendChart') chartCanvas!: ElementRef<HTMLCanvasElement>;

  overview  = signal<DashboardOverview | null>(null);
  trend     = signal<RevenueTrendItem[]>([]);
  txHistory = signal<TransactionHistory | null>(null);

  loadingOverview = signal(true);
  loadingTrend    = signal(true);
  loadingTx       = signal(true);

  activeTab = signal<ChartTab>('revenue');

  readonly today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  totalRevenue   = computed(() => this.overview()?.financials.total_revenue     ?? 0);
  totalComm      = computed(() => this.overview()?.financials.platform_commission ?? 0);
  producerPayout = computed(() => this.overview()?.financials.producer_revenue   ?? 0);
  pendingCount   = computed(() => this.txHistory()?.pending_withdrawals.length   ?? 0);
  recentPayments = computed(() => (this.txHistory()?.payments ?? []).slice(0, 5));

  private chart: Chart | null = null;
  private needsBuild = false;
  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.loadOverview();
    this.loadTrend();
    this.loadTransactions();
  }

  private loadOverview(): void {
    this.subs.push(
      this.adminService.getOverview().subscribe({
        next: (d) => { this.overview.set(d); this.loadingOverview.set(false); },
        error: ()  => { this.loadingOverview.set(false); },
      })
    );
  }

  private loadTrend(): void {
    const to   = new Date();
    const from = new Date(to);
    from.setFullYear(from.getFullYear() - 1);
    this.subs.push(
      this.adminService.getRevenueTrend(
        'monthly',
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
      ).subscribe({
        next: (d)  => { this.trend.set(d.trend ?? []); this.loadingTrend.set(false); this.needsBuild = true; },
        error: ()  => { this.loadingTrend.set(false); },
      })
    );
  }

  private loadTransactions(): void {
    this.subs.push(
      this.adminService.getTransactions().subscribe({
        next: (d) => { this.txHistory.set(d); this.loadingTx.set(false); },
        error: ()  => { this.loadingTx.set(false); },
      })
    );
  }

  setTab(tab: ChartTab): void {
    this.activeTab.set(tab);
    this.buildChart();
  }

  ngAfterViewChecked(): void {
    if (!this.needsBuild || !isPlatformBrowser(this.platformId) || !this.chartCanvas?.nativeElement) return;
    this.needsBuild = false;
    this.buildChart();
  }

  private buildChart(): void {
    this.chart?.destroy();
    if (!this.chartCanvas?.nativeElement) return;

    const data   = this.trend();
    const tab    = this.activeTab();
    const labels = data.map(d => this.shortMonth(d.period_start));

    const colorMap: Record<ChartTab, string> = {
      revenue:    '#C8A84B',
      commission: '#818cf8',
      producer:   '#34d399',
    };
    const dataMap: Record<ChartTab, number[]> = {
      revenue:    data.map(d => d.total_revenue),
      commission: data.map(d => d.platform_commission),
      producer:   data.map(d => d.producer_share),
    };

    const color = colorMap[tab];
    this.chart = new Chart(this.chartCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: dataMap[tab],
          borderColor: color,
          backgroundColor: color + '18',
          fill: true,
          tension: 0.45,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: color,
          pointBorderColor: '#0f0f0f',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1c1c',
            borderColor: '#333',
            borderWidth: 1,
            titleColor: '#888',
            bodyColor: '#e5e5e5',
            padding: 10,
            callbacks: {
              label: (ctx) => `  ${this.fmt(ctx.parsed.y as number)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#555', font: { size: 11 } },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: {
              color: '#555',
              font: { size: 11 },
              callback: (v) =>
                Number(v) >= 1_000_000 ? (Number(v) / 1_000_000).toFixed(1) + 'M' :
                Number(v) >= 1_000     ? (Number(v) / 1_000).toFixed(0) + 'K' :
                String(v),
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { display: false },
          },
        },
      },
    });
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  fmtNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  fmtDate(s: string): string {
    return new Date(s).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  private shortMonth(s: string): string {
    if (!s) return '';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.chart?.destroy();
  }
}
