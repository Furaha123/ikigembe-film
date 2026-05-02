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

const MONTHS  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const WEIGHTS = [0.30, 0.22, 0.18, 0.13, 0.10, 0.07];

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

  monthlyData = computed(() => {
    const m = this.movie();
    if (!m) return [];
    return MONTHS.map((label, i) => {
      const views     = Math.round(m.views * WEIGHTS[i]);
      const watchTime = +((views * ((m.duration_minutes ?? 90) / 60))).toFixed(1);
      const revenue   = Math.round(views * m.price * 0.7);
      return { label, views, watchTime, revenue };
    });
  });

  estimatedWatchTime = computed(() => {
    const m = this.movie();
    if (!m) return '0.0';
    const h = m.views * ((m.duration_minutes ?? 90) / 60);
    return h >= 1_000 ? (h / 1_000).toFixed(1) + 'K' : h.toFixed(1);
  });

  estimatedRevenue = computed(() => {
    const m = this.movie();
    if (!m) return 'RWF 0';
    return this.fmt(m.views * m.price * 0.7);
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

    const weights = Array.from({ length: count }, (_, i) =>
      count > 1 ? 0.5 + (i / (count - 1)) * 0.5 : 1,
    );
    const totalW = weights.reduce((a, b) => a + b, 0);

    return labels.map((label, i) => {
      const w           = weights[i] / totalW;
      const views       = Math.round(m.views * w);
      const watchTime   = +((views * (dur / 60))).toFixed(1);
      const revenue     = Math.round(views * m.price * 0.7);
      const impressions = Math.round(views * 4.2);
      const subscribers = Math.round(views * 0.008);
      const ctr         = impressions > 0 ? +((views / impressions) * 100).toFixed(1) : 0;
      return { label, views, watchTime, revenue, impressions, subscribers, ctr };
    });
  });

  advTotals = computed(() => {
    const data = this.advChartData();
    const views       = data.reduce((a, r) => a + r.views, 0);
    const watchTime   = +data.reduce((a, r) => a + r.watchTime, 0).toFixed(1);
    const subscribers = data.reduce((a, r) => a + r.subscribers, 0);
    const impressions = data.reduce((a, r) => a + r.impressions, 0);
    const ctr         = impressions > 0 ? +((views / impressions) * 100).toFixed(1) : 0;
    return { views, watchTime, subscribers, impressions, ctr };
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

  setRange(r: string): void { this.selectedRange.set(r); }

  setAdvRange(r: string): void     { this.advRange.set(r);                    this.buildAdvancedChart(); }
  setAdvBreakdown(b: Breakdown): void { this.advBreakdown.set(b);              this.buildAdvancedChart(); }
  setAdvChartType(t: AdvChartType): void { this.advChartType.set(t);           this.buildAdvancedChart(); }

  toggleAdvMetric(key: Metric): void {
    this.advMetrics.update(m => ({ ...m, [key]: !m[key] }));
    this.buildAdvancedChart();
  }

  openAdvanced(): void {
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

    const data  = this.monthlyData();
    const m     = this.metric();
    const color = m === 'revenue' ? '#C8A84B' : m === 'watchTime' ? '#2dd4bf' : '#4f9ef7';
    const values = data.map(d =>
      m === 'views' ? d.views : m === 'watchTime' ? d.watchTime : d.revenue,
    );
    const yFmt = (v: unknown): string =>
      m === 'revenue'   ? 'RWF ' + ((v as number) / 1_000).toFixed(0) + 'K' :
      m === 'watchTime' ? (v as number).toFixed(0) + ' h' :
      String(v);

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
    const headers = ['Content', 'Period', 'Views', 'Watch time (hours)', 'Subscribers', 'Impressions', 'Impressions click-through rate (%)'];
    const totalRow = [movie.title, 'Total', t.views, t.watchTime, t.subscribers, t.impressions, t.ctr + '%'];
    const rows = data.map(r => [movie.title, r.label, r.views, r.watchTime, r.subscribers, r.impressions, r.ctr + '%']);

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
