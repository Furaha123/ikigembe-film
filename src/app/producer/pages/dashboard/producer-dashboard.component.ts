import {
  Component, inject, signal, computed,
  AfterViewInit, OnDestroy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
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

const RANGE_DATA: Record<Range, TrendPoint[]> = {
  '7D': [
    { label: 'Sat 3',  views:  8_900, earnings:  146_850, watchTime:  44 },
    { label: 'Sun 4',  views:  8_200, earnings:  135_300, watchTime:  41 },
    { label: 'Mon 5',  views:  5_800, earnings:   95_700, watchTime:  29 },
    { label: 'Tue 6',  views:  6_100, earnings:  100_650, watchTime:  30 },
    { label: 'Wed 7',  views:  6_500, earnings:  107_250, watchTime:  32 },
    { label: 'Thu 8',  views:  6_800, earnings:  112_200, watchTime:  34 },
    { label: 'Fri 9',  views:  7_200, earnings:  118_800, watchTime:  36 },
  ],
  '14D': [
    { label: 'Sat 26', views:  7_800, earnings:  128_700, watchTime:  39 },
    { label: 'Sun 27', views:  7_200, earnings:  118_800, watchTime:  36 },
    { label: 'Mon 28', views:  5_200, earnings:   85_800, watchTime:  26 },
    { label: 'Tue 29', views:  5_600, earnings:   92_400, watchTime:  28 },
    { label: 'Wed 30', views:  5_900, earnings:   97_350, watchTime:  29 },
    { label: 'Thu 1',  views:  6_100, earnings:  100_650, watchTime:  30 },
    { label: 'Fri 2',  views:  6_500, earnings:  107_250, watchTime:  32 },
    { label: 'Sat 3',  views:  8_900, earnings:  146_850, watchTime:  44 },
    { label: 'Sun 4',  views:  8_200, earnings:  135_300, watchTime:  41 },
    { label: 'Mon 5',  views:  5_800, earnings:   95_700, watchTime:  29 },
    { label: 'Tue 6',  views:  6_100, earnings:  100_650, watchTime:  30 },
    { label: 'Wed 7',  views:  6_500, earnings:  107_250, watchTime:  32 },
    { label: 'Thu 8',  views:  6_800, earnings:  112_200, watchTime:  34 },
    { label: 'Fri 9',  views:  7_200, earnings:  118_800, watchTime:  36 },
  ],
  '28D': [
    { label: 'Wk 1',  views: 43_200, earnings:  712_800, watchTime: 216 },
    { label: 'Wk 2',  views: 46_800, earnings:  772_200, watchTime: 234 },
    { label: 'Wk 3',  views: 44_300, earnings:  730_950, watchTime: 221 },
    { label: 'Wk 4',  views: 49_500, earnings:  816_750, watchTime: 247 },
  ],
  '1M': [
    { label: 'Week 1', views: 45_200, earnings:  745_800, watchTime: 226 },
    { label: 'Week 2', views: 47_600, earnings:  785_400, watchTime: 238 },
    { label: 'Week 3', views: 51_300, earnings:  846_450, watchTime: 256 },
    { label: 'Week 4', views: 50_900, earnings:  839_850, watchTime: 254 },
  ],
  '2M': [
    { label: 'Wk 1 Mar', views: 34_200, earnings:  564_300, watchTime: 171 },
    { label: 'Wk 2 Mar', views: 36_800, earnings:  607_200, watchTime: 184 },
    { label: 'Wk 3 Mar', views: 38_500, earnings:  635_250, watchTime: 192 },
    { label: 'Wk 4 Mar', views: 42_500, earnings:  701_250, watchTime: 212 },
    { label: 'Wk 1 Apr', views: 40_800, earnings:  673_200, watchTime: 204 },
    { label: 'Wk 2 Apr', views: 43_200, earnings:  712_800, watchTime: 216 },
    { label: 'Wk 3 Apr', views: 46_800, earnings:  772_200, watchTime: 234 },
    { label: 'Wk 4 Apr', views: 41_200, earnings:  679_800, watchTime: 206 },
  ],
  '3M': [
    { label: 'Mar 26', views: 152_000, earnings: 2_508_000, watchTime:  760 },
    { label: 'Apr 26', views: 172_000, earnings: 2_838_000, watchTime:  860 },
    { label: 'May 26', views: 195_000, earnings: 3_217_500, watchTime:  975 },
  ],
  '6M': [
    { label: 'Dec 25', views: 168_000, earnings: 2_772_000, watchTime:  840 },
    { label: 'Jan 26', views: 110_000, earnings: 1_815_000, watchTime:  550 },
    { label: 'Feb 26', views: 135_000, earnings: 2_227_500, watchTime:  675 },
    { label: 'Mar 26', views: 152_000, earnings: 2_508_000, watchTime:  760 },
    { label: 'Apr 26', views: 172_000, earnings: 2_838_000, watchTime:  860 },
    { label: 'May 26', views: 195_000, earnings: 3_217_500, watchTime:  975 },
  ],
  '1Y': [
    { label: 'Jun 25', views:  89_000, earnings: 1_468_500, watchTime:  445 },
    { label: 'Jul 25', views:  96_000, earnings: 1_584_000, watchTime:  480 },
    { label: 'Aug 25', views: 118_000, earnings: 1_947_000, watchTime:  590 },
    { label: 'Sep 25', views: 104_000, earnings: 1_716_000, watchTime:  520 },
    { label: 'Oct 25', views: 127_000, earnings: 2_095_500, watchTime:  635 },
    { label: 'Nov 25', views: 143_000, earnings: 2_359_500, watchTime:  715 },
    { label: 'Dec 25', views: 168_000, earnings: 2_772_000, watchTime:  840 },
    { label: 'Jan 26', views: 110_000, earnings: 1_815_000, watchTime:  550 },
    { label: 'Feb 26', views: 135_000, earnings: 2_227_500, watchTime:  675 },
    { label: 'Mar 26', views: 152_000, earnings: 2_508_000, watchTime:  760 },
    { label: 'Apr 26', views: 172_000, earnings: 2_838_000, watchTime:  860 },
    { label: 'May 26', views: 195_000, earnings: 3_217_500, watchTime:  975 },
  ],
};

const RANGE_GROWTH: Record<Range, { views: number; watchTime: number }> = {
  '7D':  { views: 12.4, watchTime:  9.8 },
  '14D': { views: 15.2, watchTime: 11.3 },
  '28D': { views: 18.7, watchTime: 14.2 },
  '1M':  { views: 18.7, watchTime: 14.2 },
  '2M':  { views: 21.3, watchTime: 16.8 },
  '3M':  { views: 19.5, watchTime: 15.4 },
  '6M':  { views: 22.1, watchTime: 16.8 },
  '1Y':  { views: 28.4, watchTime: 22.6 },
};

// Per-movie monthly views (Dec 25 → May 26, 6 entries)
const MOVIE_MONTHLY: Record<string, number[]> = {
  'Urugwiro (Homestead)': [58_800, 38_500, 47_250, 53_200, 60_200, 68_250],
  "Amaboko y'Inzovu":     [45_360, 27_500, 33_750, 38_000, 43_000, 48_750],
  "Inzira y'Ubumuntu":    [34_440, 20_900, 25_650, 28_880, 32_680, 37_050],
  "Inkumi z'Igihugu":     [23_520, 13_750, 16_875, 19_000, 21_500, 24_375],
  'Urukundo Ruhoraho':    [ 5_880,  9_350, 11_475, 12_920, 14_620, 16_575],
};

const ALL_MOCK_TRANSACTIONS = [
  { movie: 'Urugwiro (Homestead)',  buyer: 'Jean Paul Habimana',    amount: 20_000, share: 14_000, status: 'Completed', date: '2026-05-09' },
  { movie: "Amaboko y'Inzovu",      buyer: 'Alice Uwimana',          amount: 20_000, share: 14_000, status: 'Completed', date: '2026-05-08' },
  { movie: 'Urugwiro (Homestead)',  buyer: 'Eric Nkurunziza',        amount: 20_000, share: 14_000, status: 'Completed', date: '2026-05-07' },
  { movie: "Inzira y'Ubumuntu",     buyer: 'Marie Claire Ingabire',  amount: 20_000, share: 14_000, status: 'Completed', date: '2026-05-06' },
  { movie: "Inkumi z'Igihugu",      buyer: 'Patrick Rwigema',        amount: 20_000, share: 14_000, status: 'Pending',   date: '2026-05-05' },
  { movie: 'Urukundo Ruhoraho',     buyer: 'Diane Mukamana',         amount: 15_000, share: 10_500, status: 'Completed', date: '2026-05-04' },
  { movie: 'Urugwiro (Homestead)',  buyer: 'Emmanuel Hategeka',      amount: 20_000, share: 14_000, status: 'Completed', date: '2026-05-03' },
  { movie: "Amaboko y'Inzovu",      buyer: 'Solange Uwitonze',       amount: 20_000, share: 14_000, status: 'Completed', date: '2026-05-02' },
  { movie: "Inzira y'Ubumuntu",     buyer: 'Fidele Nsengimana',      amount: 20_000, share: 14_000, status: 'Completed', date: '2026-05-01' },
  { movie: 'Urukundo Ruhoraho',     buyer: 'Grace Uwera',            amount: 15_000, share: 10_500, status: 'Pending',   date: '2026-04-30' },
  { movie: "Inkumi z'Igihugu",      buyer: 'Christian Bizimana',     amount: 20_000, share: 14_000, status: 'Completed', date: '2026-04-29' },
  { movie: 'Urugwiro (Homestead)',  buyer: 'Jacqueline Umubyeyi',    amount: 20_000, share: 14_000, status: 'Completed', date: '2026-04-28' },
];

const MOCK = {
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
};

@Component({
  selector: 'app-producer-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './producer-dashboard.component.html',
  styleUrl: './producer-dashboard.component.scss',
})
export class ProducerDashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('trendChart')       trendCanvas!:       ElementRef<HTMLCanvasElement>;
  @ViewChild('earningsChart')    earningsCanvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('movieDetailChart') movieDetailCanvas?: ElementRef<HTMLCanvasElement>;

  readonly authService = inject(AuthService);
  readonly fb          = inject(FormBuilder);
  readonly data        = MOCK;
  readonly ranges: Range[] = ['7D', '14D', '28D', '1M', '2M', '3M', '6M', '1Y'];

  selectedRange  = signal<Range>('6M');
  selectedMetric = signal<MetricKey>('views');
  earningsTab    = signal<EarningsTab>('earnings');
  expandedMovie  = signal<string | null>(null);
  isSaving       = signal(false);
  successMsg     = signal('');
  showAllTxns    = signal(false);
  paymentMethod  = signal<'Bank' | 'MoMo'>('MoMo');

  trendData = computed<TrendPoint[]>(() => RANGE_DATA[this.selectedRange()]);

  rangeStats = computed(() => {
    const pts = this.trendData();
    const views     = pts.reduce((s, p) => s + p.views,     0);
    const earnings  = pts.reduce((s, p) => s + p.earnings,  0);
    const watchTime = pts.reduce((s, p) => s + p.watchTime, 0);
    const { views: viewsGrowth, watchTime: watchGrowth } = RANGE_GROWTH[this.selectedRange()];
    return { views, earnings, watchTime, viewsGrowth, watchGrowth };
  });

  visibleTxns = computed(() =>
    this.showAllTxns() ? ALL_MOCK_TRANSACTIONS : ALL_MOCK_TRANSACTIONS.slice(0, 5)
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

  private trendChart:       Chart | null = null;
  private earningsChart:    Chart | null = null;
  private movieDetailChart: Chart | null = null;

  ngAfterViewInit(): void {
    this.buildTrendChart();
    this.buildEarningsChart();

    this.withdrawForm.get('amount')!.valueChanges.subscribe(v => {
      this.withdrawAmount.set(v ?? 0);
    });
  }

  setRange(r: Range): void {
    this.selectedRange.set(r);
    this.buildTrendChart();
    this.buildEarningsChart();
    if (this.expandedMovie()) {
      this.movieDetailChart?.destroy();
      this.movieDetailChart = null;
      setTimeout(() => this.buildMovieDetailChart(this.expandedMovie()!), 80);
    }
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
    const last = data[data.length - 1];
    const r    = this.selectedRange();
    const prefix = ['7D', '14D'].includes(r) ? `On ${last.label},` : `In ${last.label},`;
    if (m === 'views')
      return `${prefix} your content was watched ${this.fmtNum(last.views)} times`;
    if (m === 'watchTime')
      return `${prefix} viewers spent ${last.watchTime.toLocaleString()} hours watching`;
    return `${prefix} your estimated earnings were ${this.fmt(last.earnings)}`;
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
      setTimeout(() => this.buildMovieDetailChart(title), 80);
    }
  }

  toggleTxns(): void {
    this.showAllTxns.update(v => !v);
  }

  movieStats(title: string) {
    return this.data.movies.find(m => m.title === title)!;
  }

  private buildMovieDetailChart(title: string): void {
    const canvas = this.movieDetailCanvas?.nativeElement;
    if (!canvas) return;

    const range   = this.selectedRange();
    const monthly = MOVIE_MONTHLY[title] ?? [];
    const allLabels = ['Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26'];

    let chartLabels: string[];
    let chartData:   number[];

    if (['7D', '14D', '28D', '1M'].includes(range)) {
      const pts = RANGE_DATA[range === '1M' ? '28D' : range as '7D' | '14D' | '28D'];
      const lastMonthTotal = monthly[monthly.length - 1] ?? 0;
      const ptsTotal = pts.reduce((s, p) => s + p.views, 0);
      chartLabels = pts.map(p => p.label);
      chartData   = pts.map(p => Math.round(lastMonthTotal * p.views / ptsTotal));
    } else if (range === '2M') {
      chartLabels = allLabels.slice(-2);
      chartData   = monthly.slice(-2);
    } else if (range === '3M') {
      chartLabels = allLabels.slice(-3);
      chartData   = monthly.slice(-3);
    } else {
      chartLabels = allLabels;
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
      metric === 'earnings'  ? 'RWF ' + ((v as number) / 1_000_000).toFixed(1) + 'M' :
      metric === 'watchTime' ? ((v as number) / 1_000).toFixed(1) + 'K h' :
      ((v as number) / 1_000).toFixed(0) + 'K';

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
    const trend = this.trendData();
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
      this.withdrawForm.reset({ momo_provider: 'MTN' });
      this.selectMethod(this.paymentMethod());
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
