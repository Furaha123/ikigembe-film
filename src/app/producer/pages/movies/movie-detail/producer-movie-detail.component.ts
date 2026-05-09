import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProducerService, ProducerMovieDetail } from '../../../services/producer.service';
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend,
  BarController, BarElement,
} from 'chart.js';

Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend,
);

type Tab          = 'details' | 'analytics';
type Metric       = 'views' | 'watchTime' | 'revenue';
type Breakdown    = 'Monthly' | 'Weekly' | 'Daily';
type AdvChartType = 'line' | 'bar';

interface RangeConfig {
  labels:   string[];
  weights:  number[];
  fraction: number;
}

const RANGE_CONFIGS: Record<string, RangeConfig> = {
  '7d': {
    labels:   ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    weights:  [0.16, 0.15, 0.11, 0.12, 0.13, 0.14, 0.19],
    fraction: 0.02,
  },
  '28d': {
    labels:   ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    weights:  [0.23, 0.26, 0.24, 0.27],
    fraction: 0.07,
  },
  '90d': {
    labels:   ['Mar 26', 'Apr 26', 'May 26'],
    weights:  [0.30, 0.34, 0.36],
    fraction: 0.22,
  },
  '365d': {
    labels:   ['Jun 25', 'Jul 25', 'Aug 25', 'Sep 25', 'Oct 25', 'Nov 25',
               'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26'],
    weights:  [0.05, 0.06, 0.08, 0.07, 0.09, 0.09, 0.10, 0.07, 0.09, 0.10, 0.11, 0.09],
    fraction: 0.85,
  },
  'Lifetime': {
    labels:   ['Jun 25', 'Jul 25', 'Aug 25', 'Sep 25', 'Oct 25', 'Nov 25',
               'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26'],
    weights:  [0.05, 0.06, 0.08, 0.07, 0.09, 0.09, 0.10, 0.07, 0.09, 0.10, 0.11, 0.09],
    fraction: 1.0,
  },
};

@Component({
  selector: 'app-producer-movie-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './producer-movie-detail.component.html',
  styleUrl: './producer-movie-detail.component.scss',
})
export class ProducerMovieDetailComponent implements OnInit, OnDestroy {
  @ViewChild('analyticsChart') analyticsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('advancedChart')  advancedCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly producerService = inject(ProducerService);

  readonly ranges     = ['7d', '28d', '90d', '365d', 'Lifetime'];
  readonly breakdowns: Breakdown[] = ['Monthly', 'Weekly', 'Daily'];

  movie          = signal<ProducerMovieDetail | null>(null);
  isLoading      = signal(true);
  hasError       = signal(false);
  activeTab      = signal<Tab>('analytics');
  metric         = signal<Metric>('views');
  showAdvanced   = signal(false);
  advMetrics     = signal<Record<Metric, boolean>>({ views: true, watchTime: true, revenue: false });
  selectedRange  = signal(this.ranges[1]);
  advRange       = signal(this.ranges[1]);
  advBreakdown   = signal<Breakdown>('Monthly');
  advChartType   = signal<AdvChartType>('line');

  private mainChart: Chart | null = null;
  private advChart:  Chart | null = null;

  // Range-aware data for the main analytics chart
  rangeData = computed(() => {
    const m = this.movie();
    if (!m) return [];
    const cfg        = RANGE_CONFIGS[this.selectedRange()];
    const totalViews = Math.round(m.views * cfg.fraction);
    const dur        = m.duration_minutes ?? 90;
    return cfg.labels.map((label, i) => {
      const views     = Math.round(totalViews * cfg.weights[i]);
      const watchTime = +((views * (dur / 60))).toFixed(1);
      const revenue   = Math.round(views * m.price * 0.7);
      return { label, views, watchTime, revenue };
    });
  });

  // KPI totals for the selected range
  rangeViews = computed(() =>
    this.rangeData().reduce((s, d) => s + d.views, 0)
  );

  estimatedWatchTime = computed(() => {
    const total = this.rangeData().reduce((s, d) => s + d.watchTime, 0);
    return total >= 1_000 ? (total / 1_000).toFixed(1) + 'K' : total.toFixed(0);
  });

  estimatedRevenue = computed(() => {
    const total = this.rangeData().reduce((s, d) => s + d.revenue, 0);
    return this.fmt(total);
  });

  advChartData = computed(() => {
    const m = this.movie();
    if (!m) return [];
    const range     = this.advRange();
    const breakdown = this.advBreakdown();
    const dur       = m.duration_minutes ?? 90;

    const countMap: Record<string, Record<string, number>> = {
      '7d':       { Monthly: 1, Weekly: 1,  Daily: 7  },
      '28d':      { Monthly: 1, Weekly: 4,  Daily: 14 },
      '90d':      { Monthly: 3, Weekly: 12, Daily: 14 },
      '365d':     { Monthly: 6, Weekly: 26, Daily: 14 },
      'Lifetime': { Monthly: 6, Weekly: 26, Daily: 14 },
    };
    const count = countMap[range]?.[breakdown] ?? 6;

    const labels =
      breakdown === 'Monthly' ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].slice(0, count) :
      breakdown === 'Weekly'  ? Array.from({ length: count }, (_, i) => `Wk ${i + 1}`) :
                                Array.from({ length: count }, (_, i) => `Day ${i + 1}`);

    const cfg    = RANGE_CONFIGS[range];
    const total  = Math.round(m.views * cfg.fraction);
    const weights = Array.from({ length: count }, (_, i) =>
      count > 1 ? 0.5 + (i / (count - 1)) * 0.5 : 1,
    );
    const totalW = weights.reduce((a, b) => a + b, 0);

    const baseCompletion = Math.max(58, Math.min(82, 85 - Math.round((dur / 60) * 8)));
    return labels.map((label, i) => {
      const w              = weights[i] / totalW;
      const views          = Math.round(total * w);
      const watchTime      = +((views * (dur / 60))).toFixed(1);
      const revenue        = Math.round(views * m.price * 0.7);
      const purchases      = Math.round(views * 0.025);
      const completionRate = Math.min(95, Math.max(50, baseCompletion + (i % 5 - 2) * 2));
      return { label, views, watchTime, revenue, purchases, completionRate };
    });
  });

  advTotals = computed(() => {
    const data = this.advChartData();
    const views          = data.reduce((a, r) => a + r.views,    0);
    const watchTime      = +data.reduce((a, r) => a + r.watchTime, 0).toFixed(1);
    const purchases      = data.reduce((a, r) => a + r.purchases, 0);
    const revenue        = data.reduce((a, r) => a + r.revenue,  0);
    const completionRate = data.length
      ? +(data.reduce((a, r) => a + r.completionRate, 0) / data.length).toFixed(1)
      : 0;
    return { views, watchTime, purchases, revenue, completionRate };
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/producer/movies']); return; }
    this.producerService.getMovieDetail(id).subscribe({
      next: (data) => {
        this.movie.set(data);
        this.isLoading.set(false);
        setTimeout(() => this.buildMainChart(), 80);
      },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'analytics') {
      this.mainChart?.destroy();
      this.mainChart = null;
      setTimeout(() => this.buildMainChart(), 80);
    }
  }

  setMetric(m: Metric): void {
    this.metric.set(m);
    this.buildMainChart();
  }

  setRange(r: string): void {
    this.selectedRange.set(r);
    this.buildMainChart();
  }

  setAdvRange(r: string): void       { this.advRange.set(r);         this.buildAdvancedChart(); }
  setAdvBreakdown(b: Breakdown): void { this.advBreakdown.set(b);     this.buildAdvancedChart(); }
  setAdvChartType(t: AdvChartType): void { this.advChartType.set(t);  this.buildAdvancedChart(); }

  toggleAdvMetric(key: Metric): void {
    this.advMetrics.update(m => ({ ...m, [key]: !m[key] }));
    this.buildAdvancedChart();
  }

  openAdvanced(): void {
    this.advRange.set(this.selectedRange());
    this.showAdvanced.set(true);
    setTimeout(() => this.buildAdvancedChart(), 80);
  }

  closeAdvanced(): void {
    this.showAdvanced.set(false);
    this.advChart?.destroy();
    this.advChart = null;
  }

  back(): void { this.router.navigate(['/producer/movies']); }

  watchMovie(): void {
    const id = this.movie()?.id;
    if (id) this.router.navigate(['/movie', id]);
  }

  hlsLabel(status: string): string {
    const map: Record<string, string> = {
      not_started: 'Not Processed',
      processing:  'Processing…',
      completed:   'Ready',
      failed:      'Failed',
    };
    return map[status] ?? status;
  }

  hlsClass(status: string): string {
    const map: Record<string, string> = {
      not_started: 'hls-pending',
      processing:  'hls-processing',
      completed:   'hls-ready',
      failed:      'hls-failed',
    };
    return map[status] ?? '';
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

  private buildMainChart(): void {
    const canvas = this.analyticsCanvas?.nativeElement;
    if (!canvas) return;
    this.mainChart?.destroy();

    const data  = this.rangeData();
    const m     = this.metric();
    const color = m === 'revenue' ? '#C8A84B' : m === 'watchTime' ? '#2dd4bf' : '#4f9ef7';
    const values = data.map(d =>
      m === 'views' ? d.views : m === 'watchTime' ? d.watchTime : d.revenue,
    );

    const yFmt = (v: unknown): string => {
      const n = v as number;
      if (m === 'revenue')   return n >= 1_000_000 ? 'RWF ' + (n / 1_000_000).toFixed(1) + 'M' : 'RWF ' + (n / 1_000).toFixed(0) + 'K';
      if (m === 'watchTime') return n.toFixed(0) + ' h';
      return n >= 1_000 ? (n / 1_000).toFixed(0) + 'K' : String(Math.round(n));
    };

    this.mainChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: values,
          borderColor: color,
          backgroundColor: color + '25',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: color,
          pointBorderColor: '#0d0d0d',
          pointBorderWidth: 1.5,
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
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 11 } },
            border: { color: 'transparent' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 10 }, callback: yFmt },
            border: { color: 'transparent' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  private buildAdvancedChart(): void {
    const canvas = this.advancedCanvas?.nativeElement;
    if (!canvas) return;
    this.advChart?.destroy();

    const d       = this.advChartData();
    const metrics = this.advMetrics();
    const isBar   = this.advChartType() === 'bar';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = [];

    if (metrics.views) {
      datasets.push(isBar
        ? { label: 'Views',         data: d.map(r => r.views),    backgroundColor: 'rgba(79,158,247,0.7)', borderRadius: 4 }
        : { label: 'Views',         data: d.map(r => r.views),    borderColor: '#4f9ef7', backgroundColor: 'rgba(79,158,247,0.08)', borderWidth: 2, pointRadius: 3, tension: 0.35, fill: true }
      );
    }
    if (metrics.watchTime) {
      datasets.push(isBar
        ? { label: 'Watch Time (h)',    data: d.map(r => r.watchTime), backgroundColor: 'rgba(45,212,191,0.6)',  borderRadius: 4 }
        : { label: 'Watch Time (h)',    data: d.map(r => r.watchTime), borderColor: '#2dd4bf', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.35, fill: false }
      );
    }
    if (metrics.revenue) {
      datasets.push(isBar
        ? { label: 'Revenue (K RWF)', data: d.map(r => +(r.revenue / 1000).toFixed(1)), backgroundColor: 'rgba(200,168,75,0.65)', borderRadius: 4 }
        : { label: 'Revenue (K RWF)', data: d.map(r => +(r.revenue / 1000).toFixed(1)), borderColor: '#C8A84B', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.35, fill: false }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.advChart = new Chart(canvas, {
      type: this.advChartType() as any,
      data: { labels: d.map(r => r.label), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top' as const,
            labels: { color: '#999', font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8, padding: 16 },
          },
          tooltip: { mode: 'index' as const, intersect: false },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 11 } },
            border: { color: 'transparent' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#666', font: { size: 10 } },
            border: { color: 'transparent' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  exportAdvancedData(): void {
    const data  = this.advChartData();
    const movie = this.movie();
    if (!data.length || !movie) return;

    const t = this.advTotals();
    const headers = ['Content', 'Period', 'Views', 'Watch time (hours)', 'Purchases', 'Revenue (RWF)', 'Completion rate (%)'];
    const totalRow = [movie.title, 'Total', t.views, t.watchTime, t.purchases, t.revenue, t.completionRate + '%'];
    const rows = data.map(r => [movie.title, r.label, r.views, r.watchTime, r.purchases, r.revenue, r.completionRate + '%']);

    const csv = [headers, totalRow, ...rows]
      .map(row => row.map(v => `"${v}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${movie.title.replace(/\s+/g, '-')}-analytics.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    this.mainChart?.destroy();
    this.advChart?.destroy();
  }
}
