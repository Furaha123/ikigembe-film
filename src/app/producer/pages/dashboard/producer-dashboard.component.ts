import {
  Component, inject, signal,
  AfterViewInit, OnDestroy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Filler, Tooltip,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

type Range       = '7D' | '14D' | '28D' | '1M' | '2M' | '3M' | '6M' | '1Y';
type EarningsTab = 'earnings' | 'views';

const TREND = [
  { label: 'Jan', views: 110_000, earnings: 1_820_000 },
  { label: 'Feb', views: 135_000, earnings: 2_140_000 },
  { label: 'Mar', views: 152_000, earnings: 2_480_000 },
  { label: 'Apr', views: 172_000, earnings: 2_950_000 },
  { label: 'May', views: 195_000, earnings: 3_380_000 },
  { label: 'Jun', views: 215_000, earnings: 3_740_000 },
];

// Monthly views per movie — sums match TREND.views each month
const MOVIE_MONTHLY: Record<string, number[]> = {
  'Urugwiro (Homestead)': [38_500, 47_250, 53_200, 60_200, 68_250, 75_250],
  "Amaboko y'Inzovu":     [27_500, 33_750, 38_000, 43_000, 48_750, 53_750],
  "Inzira y'Ubumuntu":    [20_900, 25_650, 28_880, 32_680, 37_050, 40_850],
  "Inkumi z'Igihugu":     [13_750, 16_875, 19_000, 21_500, 24_375, 26_875],
  'Urukundo Ruhoraho':    [ 9_350, 11_475, 12_920, 14_620, 16_575, 18_275],
};

const MOCK = {
  stats: {
    views:       836_000,
    watchTime:   4_200,
    earnings:    8_432_000,
    viewsGrowth: 22.1,
    watchGrowth: 16.8,
  },
  trend: TREND,
  wallet: {
    balance: 6_890_000,
    recentWithdrawals: [
      { date: 'Apr 15, 2026', amount: 1_542_000, status: 'Completed' },
      { date: 'Mar 28, 2026', amount: 2_100_000, status: 'Completed' },
      { date: 'Mar 10, 2026', amount: 1_890_000, status: 'Completed' },
    ],
  },
  movies: [
    { title: 'Urugwiro (Homestead)',  views: 245_000, purchases: 38, earnings: 2_845_000, share: 1_991_500 },
    { title: "Amaboko y'Inzovu",      views: 189_000, purchases: 27, earnings: 2_120_000, share: 1_484_000 },
    { title: "Inzira y'Ubumuntu",     views: 156_000, purchases: 19, earnings: 1_780_000, share: 1_246_000 },
    { title: "Inkumi z'Igihugu",      views: 134_000, purchases: 12, earnings: 1_520_000, share: 1_064_000 },
    { title: 'Urukundo Ruhoraho',     views: 112_000, purchases:  8, earnings: 1_290_000, share:   903_000 },
  ],
  transactions: [
    { movie: 'Urugwiro (Homestead)', buyer: 'Jean Paul Habimana',   amount: 20_000, share: 14_000, status: 'Completed', date: '2026-04-18' },
    { movie: "Amaboko y'Inzovu",     buyer: 'Alice Uwimana',         amount: 20_000, share: 14_000, status: 'Completed', date: '2026-04-17' },
    { movie: 'Urugwiro (Homestead)', buyer: 'Eric Nkurunziza',       amount: 20_000, share: 14_000, status: 'Completed', date: '2026-04-16' },
    { movie: "Inzira y'Ubumuntu",    buyer: 'Marie Claire Ingabire', amount: 20_000, share: 14_000, status: 'Completed', date: '2026-04-15' },
    { movie: "Inkumi z'Igihugu",     buyer: 'Patrick Rwigema',       amount: 20_000, share: 14_000, status: 'Pending',   date: '2026-04-14' },
  ],
};

@Component({
  selector: 'app-producer-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './producer-dashboard.component.html',
  styleUrl: './producer-dashboard.component.scss',
})
export class ProducerDashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('trendChart')      trendCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('earningsChart')   earningsCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('movieDetailChart') movieDetailCanvas?: ElementRef<HTMLCanvasElement>;

  readonly authService = inject(AuthService);
  readonly fb          = inject(FormBuilder);
  readonly data        = MOCK;
  readonly ranges: Range[] = ['7D', '14D', '28D', '1M', '2M', '3M', '6M', '1Y'];

  selectedRange  = signal<Range>('6M');
  earningsTab    = signal<EarningsTab>('earnings');
  expandedMovie  = signal<string | null>(null);
  isSaving       = signal(false);
  successMsg     = signal('');

  withdrawForm = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
  });

  private trendChart: Chart | null       = null;
  private earningsChart: Chart | null    = null;
  private movieDetailChart: Chart | null = null;

  ngAfterViewInit(): void {
    this.buildTrendChart();
    this.buildEarningsChart();
  }

  setRange(r: Range): void {
    this.selectedRange.set(r);
    this.buildTrendChart();
    this.buildEarningsChart();
  }

  setEarningsTab(t: EarningsTab): void {
    this.earningsTab.set(t);
    this.buildEarningsChart();
  }

  toggleMovieDetail(title: string): void {
    if (this.expandedMovie() === title) {
      this.expandedMovie.set(null);
      this.movieDetailChart?.destroy();
      this.movieDetailChart = null;
    } else {
      this.expandedMovie.set(title);
      this.movieDetailChart?.destroy();
      this.movieDetailChart = null;
      setTimeout(() => this.buildMovieDetailChart(title), 60);
    }
  }

  movieStats(title: string) {
    return this.data.movies.find(m => m.title === title)!;
  }

  private buildMovieDetailChart(title: string): void {
    const canvas = this.movieDetailCanvas?.nativeElement;
    if (!canvas) return;
    const monthly = MOVIE_MONTHLY[title] ?? [];
    this.movieDetailChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: TREND.map(r => r.label),
        datasets: [{
          data: monthly,
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
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#666', font: { size: 11 } }, border: { color: 'transparent' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#666', font: { size: 11 }, callback: v => ((v as number) / 1000).toFixed(0) + 'K' }, border: { color: 'transparent' }, beginAtZero: true },
        },
      },
    });
  }

  private buildTrendChart(): void {
    const canvas = this.trendCanvas?.nativeElement;
    if (!canvas) return;
    this.trendChart?.destroy();
    this.trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: MOCK.trend.map(r => r.label),
        datasets: [{
          data: MOCK.trend.map(r => r.views),
          borderColor: '#C8A84B',
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: '#C8A84B',
          pointBorderColor: '#0d0d0d',
          pointBorderWidth: 2,
          tension: 0.35,
          fill: false,
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
            callbacks: {
              label: ctx => ` Views: ${(ctx.raw as number / 1000).toFixed(0)}K`,
            },
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
            ticks: {
              color: '#666', font: { size: 11 },
              callback: v => (v as number / 1000).toFixed(0) + 'K',
            },
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
    const values = isEarnings
      ? MOCK.trend.map(r => r.earnings)
      : MOCK.trend.map(r => r.views);
    this.earningsChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: MOCK.trend.map(r => r.label),
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
              callback: v => isEarnings
                ? 'RWF ' + ((v as number) / 1_000_000).toFixed(1) + 'M'
                : ((v as number) / 1_000).toFixed(0) + 'K',
            },
            border: { color: 'transparent' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  submitWithdrawal(): void {
    if (this.withdrawForm.invalid || this.isSaving()) return;
    this.isSaving.set(true);
    this.successMsg.set('');
    setTimeout(() => {
      this.isSaving.set(false);
      this.successMsg.set('Request submitted! Processing within 3–5 business days.');
      this.withdrawForm.reset();
    }, 1200);
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

  ngOnDestroy(): void {
    this.trendChart?.destroy();
    this.earningsChart?.destroy();
    this.movieDetailChart?.destroy();
  }
}
