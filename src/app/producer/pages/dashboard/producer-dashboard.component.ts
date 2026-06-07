import {
  Component, inject, signal, computed,
  AfterViewInit, OnDestroy, OnInit, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import {
  ProducerService, ProducerWallet, DashboardMovie, DashboardTransaction,
  AnalyticsResponse, ProducerWithdrawal, WithdrawalRequest,
} from '../../services/producer.service';
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Filler, Tooltip,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

type Range       = '7D' | '14D' | '28D' | '1M' | '2M' | '3M' | '6M' | '1Y';
type EarningsTab = 'earnings' | 'views';
type MetricKey   = 'views' | 'watchTime' | 'earnings';

interface TrendPoint {
  label:     string;
  views:     number;
  earnings:  number;
  watchTime: number;
}

const MONTHLY_LABELS = ['Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26'];

@Component({
  selector: 'app-producer-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './producer-dashboard.component.html',
  styleUrl: './producer-dashboard.component.scss',
})
export class ProducerDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('trendChart')       trendCanvas!:       ElementRef<HTMLCanvasElement>;
  @ViewChild('earningsChart')    earningsCanvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('movieDetailChart') movieDetailCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly authService     = inject(AuthService);
  private readonly producerService = inject(ProducerService);
  readonly fb                      = inject(FormBuilder);
  readonly ranges: Range[]         = ['7D', '14D', '28D', '1M', '2M', '3M', '6M', '1Y'];

  // ── Server data signals ──────────────────────────────
  wallet            = signal<ProducerWallet | null>(null);
  recentWithdrawals = signal<ProducerWithdrawal[]>([]);
  analyticsResponse = signal<AnalyticsResponse | null>(null);
  dashboardMovies   = signal<DashboardMovie[]>([]);
  allTransactions   = signal<DashboardTransaction[]>([]);

  // ── UI state ─────────────────────────────────────────
  selectedRange  = signal<Range>('6M');
  selectedMetric = signal<MetricKey>('views');
  earningsTab    = signal<EarningsTab>('earnings');
  expandedMovie  = signal<string | null>(null);
  isSaving       = signal(false);
  successMsg     = signal('');
  showAllTxns    = signal(false);
  paymentMethod  = signal<'Bank' | 'MoMo'>('MoMo');

  // ── Derived state ────────────────────────────────────
  trendData = computed<TrendPoint[]>(() => {
    const resp = this.analyticsResponse();
    if (!resp) return [];
    return resp.trend.map(p => ({
      label:     p.label,
      views:     p.views,
      earnings:  p.earnings,
      watchTime: p.watch_time_hours,
    }));
  });

  rangeStats = computed(() => {
    const resp = this.analyticsResponse();
    if (!resp) return { views: 0, earnings: 0, watchTime: 0, viewsGrowth: 0, watchGrowth: 0 };
    const t = resp.totals;
    return {
      views:       t.views,
      earnings:    t.earnings,
      watchTime:   t.watch_time_hours,
      viewsGrowth: t.views_growth_pct,
      watchGrowth: t.watch_time_growth_pct,
    };
  });

  visibleTxns = computed(() =>
    this.showAllTxns() ? this.allTransactions() : this.allTransactions().slice(0, 5)
  );

  withdrawForm = this.fb.group({
    amount:              [null as number | null, [Validators.required, Validators.min(5000)]],
    bank_name:           [''],
    account_number:      [''],
    account_holder_name: [''],
    momo_number:         ['', Validators.required],
    momo_provider:       ['MTN'],
  });

  withdrawAmount = signal<number>(0);

  taxBreakdown = computed(() => {
    const amount = this.withdrawAmount();
    if (!amount || amount <= 0) return null;
    const govTax        = Math.round(amount * 0.30);
    const totalDeducted = amount + govTax;
    return { amount, govTax, totalDeducted };
  });

  private trendChart:       Chart | null = null;
  private earningsChart:    Chart | null = null;
  private movieDetailChart: Chart | null = null;
  private analyticsSub:     Subscription | null = null;

  // ── Lifecycle ─────────────────────────────────────────
  ngOnInit(): void {
    this.producerService.getWallet().subscribe({
      next: (w) => this.wallet.set(w),
      error: (e) => console.error('[Dashboard] wallet error:', e),
    });

    this.producerService.getWithdrawals().subscribe({
      next: (resp) => this.recentWithdrawals.set(resp.results.slice(0, 3)),
      error: (e) => console.error('[Dashboard] withdrawals error:', e),
    });

    this.producerService.getDashboardMovies().subscribe({
      next: (movies) => this.dashboardMovies.set(movies),
      error: (e) => console.error('[Dashboard] movies error:', e),
    });

    this.producerService.getTransactions(1).subscribe({
      next: (resp) => this.allTransactions.set(resp.results),
      error: (e) => console.error('[Dashboard] transactions error:', e),
    });
  }

  ngAfterViewInit(): void {
    // Load analytics here so the canvas elements are guaranteed to exist
    this.fetchAnalytics(this.selectedRange());

    this.withdrawForm.get('amount')!.valueChanges.subscribe(v => {
      this.withdrawAmount.set(v ?? 0);
    });
  }

  private fetchAnalytics(range: Range, rebuildMovieDetail = false): void {
    this.analyticsSub?.unsubscribe();
    this.analyticsSub = this.producerService.getAnalytics(range).subscribe({
      next: (resp) => {
        this.analyticsResponse.set(resp);
        this.buildTrendChart();
        this.buildEarningsChart();
        if (rebuildMovieDetail) {
          const expanded = this.expandedMovie();
          if (expanded) {
            this.movieDetailChart?.destroy();
            this.movieDetailChart = null;
            setTimeout(() => this.buildMovieDetailChart(expanded), 80);
          }
        }
      },
      error: (err) => console.error('[Dashboard] analytics error:', err),
    });
  }

  // ── Range / metric controls ───────────────────────────
  setRange(r: Range): void {
    this.selectedRange.set(r);
    this.fetchAnalytics(r, true);
  }

  setMetric(m: MetricKey): void {
    this.selectedMetric.set(m);
    this.buildTrendChart();
  }

  setEarningsTab(t: EarningsTab): void {
    this.earningsTab.set(t);
    this.buildEarningsChart();
  }

  metricSummary(): string {
    const m    = this.selectedMetric();
    const data = this.trendData();
    if (!data.length) return '';
    const last = data[data.length - 1];
    const r    = this.selectedRange();
    const prefix = ['7D', '14D'].includes(r) ? `On ${last.label},` : `In ${last.label},`;
    if (m === 'views')
      return `${prefix} your content was watched ${this.fmtNum(last.views)} times`;
    if (m === 'watchTime')
      return `${prefix} viewers spent ${last.watchTime.toLocaleString()} hours watching`;
    return `${prefix} your estimated earnings were ${this.fmt(last.earnings)}`;
  }

  // ── Movie detail panel ────────────────────────────────
  toggleMovieDetail(title: string): void {
    if (this.expandedMovie() === title) {
      this.expandedMovie.set(null);
      this.movieDetailChart?.destroy();
      this.movieDetailChart = null;
    } else {
      this.expandedMovie.set(title);
      this.movieDetailChart?.destroy();
      this.movieDetailChart = null;
      setTimeout(() => this.buildMovieDetailChart(title), 80);
    }
  }

  movieStats(title: string): DashboardMovie {
    return this.dashboardMovies().find(m => m.title === title)!;
  }

  // ── Transactions ──────────────────────────────────────
  toggleTxns(): void {
    this.showAllTxns.update(v => !v);
  }

  // ── Payment method ────────────────────────────────────
  selectMethod(m: 'Bank' | 'MoMo'): void {
    this.paymentMethod.set(m);
    const f = this.withdrawForm;
    if (m === 'Bank') {
      f.get('bank_name')!.setValidators(Validators.required);
      f.get('account_number')!.setValidators(Validators.required);
      f.get('account_holder_name')!.setValidators(Validators.required);
      f.get('momo_number')!.clearValidators();
    } else {
      f.get('momo_number')!.setValidators(Validators.required);
      f.get('bank_name')!.clearValidators();
      f.get('account_number')!.clearValidators();
      f.get('account_holder_name')!.clearValidators();
    }
    ['bank_name', 'account_number', 'account_holder_name', 'momo_number']
      .forEach(n => f.get(n)!.updateValueAndValidity());
  }

  // ── Withdrawal submit ─────────────────────────────────
  submitWithdrawal(): void {
    if (this.withdrawForm.invalid || this.isSaving()) return;
    this.isSaving.set(true);
    this.successMsg.set('');

    const v = this.withdrawForm.value;
    const payload: WithdrawalRequest = this.paymentMethod() === 'Bank'
      ? {
          amount:              v.amount!,
          payment_method:      'Bank',
          bank_name:           v.bank_name   ?? undefined,
          account_number:      v.account_number ?? undefined,
          account_holder_name: v.account_holder_name ?? undefined,
        }
      : {
          amount:         v.amount!,
          payment_method: 'MoMo',
          momo_number:    v.momo_number  ?? undefined,
          momo_provider:  v.momo_provider ?? undefined,
        };

    this.producerService.requestWithdrawal(payload).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.successMsg.set('Request submitted! Processing within 3–5 business days.');
        this.withdrawForm.reset({ momo_provider: 'MTN' });
        this.selectMethod(this.paymentMethod());
        this.producerService.getWallet().subscribe({
          next: (w) => this.wallet.set(w),
        });
        this.producerService.getWithdrawals().subscribe({
          next: (resp) => this.recentWithdrawals.set(resp.results.slice(0, 3)),
        });
      },
      error: () => {
        this.isSaving.set(false);
        this.successMsg.set('Failed to submit. Please try again.');
      },
    });
  }

  // ── Formatters ────────────────────────────────────────
  formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  fmtNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
    return n.toLocaleString();
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  // ── Chart builders ────────────────────────────────────
  private buildMovieDetailChart(title: string): void {
    const canvas = this.movieDetailCanvas?.nativeElement;
    if (!canvas) return;

    const movie = this.dashboardMovies().find(m => m.title === title);
    if (!movie) return;

    const monthly   = movie.monthly_views;
    const range     = this.selectedRange();
    let chartLabels: string[];
    let chartData:   number[];

    if (['7D', '14D', '28D', '1M'].includes(range)) {
      const pts      = this.trendData();
      const lastTotal = monthly[monthly.length - 1] ?? 0;
      const ptsTotal  = pts.reduce((s, p) => s + p.views, 0);
      chartLabels = pts.map(p => p.label);
      chartData   = pts.map(p => ptsTotal ? Math.round(lastTotal * p.views / ptsTotal) : 0);
    } else if (range === '2M') {
      chartLabels = MONTHLY_LABELS.slice(-2);
      chartData   = monthly.slice(-2);
    } else if (range === '3M') {
      chartLabels = MONTHLY_LABELS.slice(-3);
      chartData   = monthly.slice(-3);
    } else {
      chartLabels = MONTHLY_LABELS;
      chartData   = monthly;
    }

    this.movieDetailChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          data: chartData,
          borderColor: '#C8A84B',
          backgroundColor: 'rgba(200,168,75,0.12)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#C8A84B',
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 11 } },
            border: { color: 'transparent' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 11 }, callback: v => ((v as number) / 1000).toFixed(0) + 'K' },
            border: { color: 'transparent' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  private buildTrendChart(): void {
    const canvas = this.trendCanvas?.nativeElement;
    if (!canvas) return;
    this.trendChart?.destroy();

    const metric = this.selectedMetric();
    const color  = metric === 'watchTime' ? '#2dd4bf' : '#C8A84B';
    const fill   = metric === 'watchTime' ? 'rgba(45,212,191,0.12)' : 'rgba(200,168,75,0.12)';
    const trend  = this.trendData();

    const values = trend.map(r =>
      metric === 'earnings'  ? r.earnings  :
      metric === 'watchTime' ? r.watchTime :
      r.views
    );

    const yTickFmt = (v: unknown): string =>
      metric === 'earnings'  ? this.fmt(v as number) :
      metric === 'watchTime' ? this.fmtNum(v as number) + 'h' :
      this.fmtNum(v as number);

    const tooltipFmt = (ctx: { raw: unknown }): string =>
      metric === 'earnings'  ? ` Earnings: ${this.fmt(ctx.raw as number)}` :
      metric === 'watchTime' ? ` Watch Time: ${(ctx.raw as number).toLocaleString()}h` :
      ` Views: ${this.fmtNum(ctx.raw as number)}`;

    this.trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: trend.map(r => r.label),
        datasets: [{
          data: values,
          borderColor: color,
          backgroundColor: fill,
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: color,
          pointBorderColor: '#0d0d0d',
          pointBorderWidth: 2,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a1a',
            titleColor: '#999',
            bodyColor: '#fff',
            borderColor: '#333',
            borderWidth: 1,
            padding: 10,
            callbacks: { label: tooltipFmt },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 12 } },
            border: { color: 'transparent' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 11 }, callback: yTickFmt },
            border: { color: 'transparent' },
            beginAtZero: false,
          },
        },
      },
    });
  }

  private buildEarningsChart(): void {
    const canvas = this.earningsCanvas?.nativeElement;
    if (!canvas) return;
    this.earningsChart?.destroy();
    const isEarnings = this.earningsTab() === 'earnings';
    const trend  = this.trendData();
    const values = isEarnings ? trend.map(r => r.earnings) : trend.map(r => r.views);

    this.earningsChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: trend.map(r => r.label),
        datasets: [{
          data: values,
          borderColor: '#C8A84B',
          backgroundColor: 'rgba(200,168,75,0.15)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 12 } },
            border: { color: 'transparent' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#666', font: { size: 11 },
              callback: v => isEarnings ? this.fmt(v as number) : this.fmtNum(v as number),
            },
            border: { color: 'transparent' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  ngOnDestroy(): void {
    this.analyticsSub?.unsubscribe();
    this.trendChart?.destroy();
    this.earningsChart?.destroy();
    this.movieDetailChart?.destroy();
  }
}
