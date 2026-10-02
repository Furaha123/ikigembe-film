import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, ElementRef, ViewChild, PLATFORM_ID,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AnalyticsPeriod, AnalyticsRange, FilmResubmitPayload, MovieAnalytics, ProducerMovieDetail, ProducerService } from '../../../services/producer.service';
import { MultipartUploadService, UploadAbortedError } from '../../../../shared/services/multipart-upload.service';
import { apiErrorMessage, UiError } from '../../../../shared/utils/api-error';
import { staleResubmitKey, uploadErrorMessage } from '../../../../shared/utils/upload-error';
import {
  ALLOWED_DOCUMENT_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS, DOCUMENT_ACCEPT, VIDEO_ACCEPT, extensionList, hasAllowedExtension,
} from '../../../../shared/models/upload.constants';
import { VideoPlayerComponent } from '../../../../shared/components/video-player/video-player.component';
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

/** UI range → API `range`; and the grouping that keeps each chart readable. */
const API_RANGE: Record<string, AnalyticsRange> = { '7d': '7d', '28d': '28d', '90d': '90d', '365d': '365d', 'Lifetime': 'lifetime' };
const MAIN_PERIOD: Record<string, AnalyticsPeriod> = { '7d': 'daily', '28d': 'weekly', '90d': 'monthly', '365d': 'monthly', 'Lifetime': 'monthly' };
const BREAKDOWN_PERIOD: Record<Breakdown, AnalyticsPeriod> = { Monthly: 'monthly', Weekly: 'weekly', Daily: 'daily' };
const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One chart/table row, built from the API trend. completionRate is only known for the whole range. */
interface AnalyticsRow { label: string; views: number; watchTime: number; revenue: number; purchases: number; completionRate: number | null }

@Component({
  selector: 'app-producer-movie-detail',
  standalone: true,
  imports: [TranslatePipe, CommonModule, VideoPlayerComponent],
  templateUrl: './producer-movie-detail.component.html',
  styleUrls: ['./producer-movie-detail.component.scss', './producer-movie-detail.overlays.scss'],
})
export class ProducerMovieDetailComponent implements OnInit, OnDestroy {
  @ViewChild('analyticsChart') analyticsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('advancedChart')  advancedCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly producerService = inject(ProducerService);
  private readonly uploader        = inject(MultipartUploadService);
  private readonly platformId      = inject(PLATFORM_ID);
  private readonly translate       = inject(TranslateService);

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
  isShareOpen    = signal(false);
  copiedFlash    = signal(false);
  isWatching     = signal(false);
  watchSrc       = signal('');
  watchLoading   = signal(false);
  watchError     = signal<string | null>(null); // translation key

  // ── Resubmit flow ─────────────────────────────────────
  resubmitOpen             = signal(false);
  resubmitVideoFile        = signal<File | null>(null);
  resubmitVideoKey         = signal<string | null>(null);
  resubmitVideoProgress    = signal(0);
  resubmitVideoUploading   = signal(false);
  resubmitVideoError       = signal<string | null>(null); // translation key

  resubmitCopyrightFile        = signal<File | null>(null);
  resubmitCopyrightKey         = signal<string | null>(null);
  resubmitCopyrightProgress    = signal(0);
  resubmitCopyrightUploading   = signal(false);
  resubmitCopyrightError       = signal<string | null>(null); // translation key

  resubmitLoading = signal(false);
  readonly videoAccept    = VIDEO_ACCEPT;
  readonly documentAccept = DOCUMENT_ACCEPT;
  resubmitError   = signal<UiError | null>(null);
  resubmitSuccess = signal(false);

  /**
   * Producer's share of gross for this film (0–1), from the API — splits are per
   * film, so never assume 70/30. null until known (revenue estimates show 0).
   */

  isChangesRequested = computed(() => this.movie()?.approval_status === 'changes_requested');
  canResubmit        = computed(() => !!(this.resubmitVideoKey() || this.resubmitCopyrightKey()));

  private mainChart:   Chart | null = null;
  private advChart:    Chart | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;
  private resubmitUploads: Record<'video' | 'copyright', AbortController | null> = { video: null, copyright: null };

  /** Real analytics from GET …/movies/<id>/analytics/ (previously invented from lifetime views). */
  mainAnalytics = signal<MovieAnalytics | null>(null);
  advAnalytics  = signal<MovieAnalytics | null>(null);
  analyticsError = signal(false);

  // Range-aware data for the main analytics chart
  rangeData = computed<AnalyticsRow[]>(() => this.toRows(this.mainAnalytics()));

  // KPI totals for the selected range
  rangeViews = computed(() => this.mainAnalytics()?.totals.views ?? 0);

  estimatedWatchTime = computed(() => {
    const total = this.mainAnalytics()?.totals.watch_time_hours ?? 0;
    return total >= 1_000 ? (total / 1_000).toFixed(1) + 'K' : total.toFixed(1);
  });

  /** The producer's share for the range (net_earnings), not gross sales. */
  estimatedRevenue = computed(() => this.fmt(this.mainAnalytics()?.totals.net_earnings ?? 0));

  advChartData = computed<AnalyticsRow[]>(() => this.toRows(this.advAnalytics()));

  advTotals = computed(() => {
    const a = this.advAnalytics();
    return {
      views:          a?.totals.views ?? 0,
      watchTime:      +(a?.totals.watch_time_hours ?? 0).toFixed(1),
      purchases:      a?.totals.purchases ?? 0,
      revenue:        a?.totals.net_earnings ?? 0,
      completionRate: a ? +(a.watch_stats.completion_rate * 100).toFixed(1) : 0,
    };
  });

  private toRows(a: MovieAnalytics | null): AnalyticsRow[] {
    if (!a) return [];
    return a.trend.map(p => ({
      label:          this.periodLabel(p.period_start, a.period),
      views:          p.views,
      watchTime:      +p.watch_time_hours.toFixed(1),
      revenue:        p.net_earnings,
      purchases:      p.purchases,
      completionRate: null,
    }));
  }

  /** "12 Mar" for daily/weekly buckets, "Mar 26" for monthly ones, with translated month names. */
  private periodLabel(iso: string, period: AnalyticsPeriod): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const month = this.translate.instant(`producerUi.common.monthsShort.${MONTH_KEYS[d.getUTCMonth()]}`);
    return period === 'monthly'
      ? `${month} ${String(d.getUTCFullYear()).slice(2)}`
      : `${d.getUTCDate()} ${month}`;
  }

  private loadMainAnalytics(): void {
    const id = this.movie()?.id;
    if (!id) return;
    const range = this.selectedRange();
    this.analyticsError.set(false);
    this.producerService.getMovieAnalytics(id, API_RANGE[range], MAIN_PERIOD[range]).subscribe({
      next: (a) => {
        if (this.selectedRange() !== range) return; // a newer range was picked meanwhile
        this.mainAnalytics.set(a);
        this.buildMainChart();
      },
      error: () => { this.mainAnalytics.set(null); this.analyticsError.set(true); this.buildMainChart(); },
    });
  }

  private loadAdvAnalytics(): void {
    const id = this.movie()?.id;
    if (!id) return;
    const range = this.advRange();
    const breakdown = this.advBreakdown();
    this.producerService.getMovieAnalytics(id, API_RANGE[range], BREAKDOWN_PERIOD[breakdown]).subscribe({
      next: (a) => {
        if (this.advRange() !== range || this.advBreakdown() !== breakdown) return;
        this.advAnalytics.set(a);
        this.buildAdvancedChart();
      },
      error: () => { this.advAnalytics.set(null); this.buildAdvancedChart(); },
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/producer/movies']); return; }
    this.producerService.getMovieDetail(id).subscribe({
      next: (data) => {
        this.movie.set(data);
        this.isLoading.set(false);
        setTimeout(() => this.loadMainAnalytics(), 80);
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
    this.loadMainAnalytics();
  }

  setAdvRange(r: string): void       { this.advRange.set(r);         this.loadAdvAnalytics(); }
  setAdvBreakdown(b: Breakdown): void { this.advBreakdown.set(b);     this.loadAdvAnalytics(); }
  setAdvChartType(t: AdvChartType): void { this.advChartType.set(t);  this.buildAdvancedChart(); }

  toggleAdvMetric(key: Metric): void {
    this.advMetrics.update(m => ({ ...m, [key]: !m[key] }));
    this.buildAdvancedChart();
  }

  openAdvanced(): void {
    this.advRange.set(this.selectedRange());
    this.showAdvanced.set(true);
    setTimeout(() => this.loadAdvAnalytics(), 80);
  }

  closeAdvanced(): void {
    this.showAdvanced.set(false);
    this.advChart?.destroy();
    this.advChart = null;
  }

  back(): void { this.router.navigate(['/producer/movies']); }

  watchMovie(): void {
    const m = this.movie();
    if (!m || this.watchLoading()) return;
    // hls_url / video_url are expiring credentials — fetch fresh ones for every preview.
    this.watchLoading.set(true);
    this.watchError.set(null);
    this.producerService.getMovieDetail(m.id).subscribe({
      next: (fresh) => {
        this.watchLoading.set(false);
        const src = fresh.hls_url ?? fresh.video_url ?? '';
        if (!src) { this.watchError.set('movieDetail.watchUnavailable'); return; }
        this.watchSrc.set(src);
        this.isWatching.set(true);
      },
      error: () => {
        this.watchLoading.set(false);
        this.watchError.set('movieDetail.watchFailed');
      },
    });
  }

  closePlayer(): void {
    this.isWatching.set(false);
    this.watchSrc.set('');
  }

  /** Translation key for an HLS status (unknown statuses pass through the pipe unchanged). */
  hlsLabel(status: string): string {
    const map: Record<string, string> = {
      not_started: 'producerUi.movieDetail.hls.notStarted',
      processing:  'producerUi.movieDetail.hls.processing',
      ready:       'producerUi.movieDetail.hls.ready',
      failed:      'producerUi.movieDetail.hls.failed',
    };
    return map[status] ?? status;
  }

  hlsClass(status: string): string {
    const map: Record<string, string> = {
      not_started: 'hls-pending',
      processing:  'hls-processing',
      ready:       'hls-ready',
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
        ? { label: this.translate.instant('producerUi.movieDetail.chart.views'),         data: d.map(r => r.views),    backgroundColor: 'rgba(79,158,247,0.7)', borderRadius: 4 }
        : { label: this.translate.instant('producerUi.movieDetail.chart.views'),         data: d.map(r => r.views),    borderColor: '#4f9ef7', backgroundColor: 'rgba(79,158,247,0.08)', borderWidth: 2, pointRadius: 3, tension: 0.35, fill: true }
      );
    }
    if (metrics.watchTime) {
      datasets.push(isBar
        ? { label: this.translate.instant('producerUi.movieDetail.chart.watchTime'),    data: d.map(r => r.watchTime), backgroundColor: 'rgba(45,212,191,0.6)',  borderRadius: 4 }
        : { label: this.translate.instant('producerUi.movieDetail.chart.watchTime'),    data: d.map(r => r.watchTime), borderColor: '#2dd4bf', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.35, fill: false }
      );
    }
    if (metrics.revenue) {
      datasets.push(isBar
        ? { label: this.translate.instant('producerUi.movieDetail.chart.revenue'), data: d.map(r => +(r.revenue / 1000).toFixed(1)), backgroundColor: 'rgba(200,168,75,0.65)', borderRadius: 4 }
        : { label: this.translate.instant('producerUi.movieDetail.chart.revenue'), data: d.map(r => +(r.revenue / 1000).toFixed(1)), borderColor: '#C8A84B', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.35, fill: false }
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
    const headers = ['content', 'period', 'views', 'watchTime', 'purchases', 'revenue', 'completionRate']
      .map(k => this.translate.instant(`producerUi.movieDetail.table.${k}`));
    const totalRow = [movie.title, this.translate.instant('producerUi.movieDetail.table.total'), t.views, t.watchTime, t.purchases, t.revenue, t.completionRate + '%'];
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

  openShare()  { this.isShareOpen.set(true); }
  closeShare() { this.isShareOpen.set(false); this.copiedFlash.set(false); }

  previewUrl(): string {
    const id = this.movie()?.id;
    if (!id || !isPlatformBrowser(this.platformId)) return '';
    return `${window.location.origin}/preview/${id}`;
  }

  copyTrailerLink(): void {
    const url = this.previewUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      this.copiedFlash.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copiedFlash.set(false), 2500);
    }).catch(() => {});
  }

  shareOnWhatsApp(): void {
    const url   = this.previewUrl();
    const title = this.movie()?.title ?? this.translate.instant('producerUi.movieDetail.thisMovie');
    if (!url) return;
    const text = encodeURIComponent(this.translate.instant('producerUi.movieDetail.whatsappText', { title, url }));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  onResubmitVideoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.resubmitVideoFile.set(file);
    this.resubmitVideoKey.set(null);
    this.resubmitVideoError.set(null);
    this.resubmitVideoProgress.set(0);
    if (!hasAllowedExtension(file.name, ALLOWED_VIDEO_EXTENSIONS)) {
      // Fail fast: `accept` is only a hint and the backend would reject it anyway.
      this.resubmitVideoError.set(this.translate.instant('uploadErrors.videoType', { types: extensionList(ALLOWED_VIDEO_EXTENSIONS) }));
      return;
    }
    this.uploadResubmitFile(file, 'video');
  }

  onResubmitCopyrightSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.resubmitCopyrightFile.set(file);
    this.resubmitCopyrightKey.set(null);
    this.resubmitCopyrightError.set(null);
    this.resubmitCopyrightProgress.set(0);
    if (!hasAllowedExtension(file.name, ALLOWED_DOCUMENT_EXTENSIONS)) {
      this.resubmitCopyrightError.set(this.translate.instant('uploadErrors.documentType', { types: extensionList(ALLOWED_DOCUMENT_EXTENSIONS) }));
      return;
    }
    this.uploadResubmitFile(file, 'copyright');
  }

  private uploadResubmitFile(file: File, type: 'video' | 'copyright'): void {
    const setUploading = type === 'video' ? this.resubmitVideoUploading : this.resubmitCopyrightUploading;
    const setKey       = type === 'video' ? this.resubmitVideoKey       : this.resubmitCopyrightKey;
    const setProgress  = type === 'video' ? this.resubmitVideoProgress  : this.resubmitCopyrightProgress;
    const setError     = type === 'video' ? this.resubmitVideoError     : this.resubmitCopyrightError;

    this.resubmitUploads[type]?.abort();
    const controller = new AbortController();
    this.resubmitUploads[type] = controller;

    setUploading.set(true);
    // field_name routes the file to the right (private) folder; the backend rejects
    // copyright keys that weren't uploaded with field_name=copyright_document.
    const api = this.producerService.movieUploadApi(type === 'video' ? 'video_file' : 'copyright_document');
    this.uploader.upload(file, api, {
      signal: controller.signal,
      onProgress: pct => setProgress.set(pct),
    }).then(key => {
      setKey.set(key);
      setProgress.set(100);
    }).catch(err => {
      if (!(err instanceof UploadAbortedError)) setError.set(uploadErrorMessage(err, 'movieDetail.resubmit.uploadFailed'));
    }).finally(() => {
      if (this.resubmitUploads[type] === controller) {
        this.resubmitUploads[type] = null;
        setUploading.set(false);
      }
    });
  }

  /** Close the resubmit dialog, cancelling any upload still in flight. */
  closeResubmit(): void {
    this.abortResubmitUploads();
    this.resubmitOpen.set(false);
  }

  private abortResubmitUploads(): void {
    for (const type of ['video', 'copyright'] as const) {
      if (this.resubmitUploads[type]) {
        this.resubmitUploads[type]!.abort();
        this.resubmitUploads[type] = null;
        const file = type === 'video' ? this.resubmitVideoFile : this.resubmitCopyrightFile;
        const uploading = type === 'video' ? this.resubmitVideoUploading : this.resubmitCopyrightUploading;
        file.set(null);
        uploading.set(false);
      }
    }
  }

  submitResubmit(): void {
    if (!this.canResubmit() || this.resubmitLoading()) return;
    const id = this.movie()?.id;
    if (!id) return;

    this.resubmitLoading.set(true);
    this.resubmitError.set(null);

    const payload: FilmResubmitPayload = {};
    const vk = this.resubmitVideoKey();
    const ck = this.resubmitCopyrightKey();
    if (vk) payload.video_key = vk;
    if (ck) payload.copyright_document_key = ck;

    this.producerService.resubmitFilmFiles(id, payload).subscribe({
      next: (updated) => {
        this.movie.set(updated);
        this.resubmitLoading.set(false);
        this.resubmitSuccess.set(true);
        this.resubmitOpen.set(false);
      },
      error: (err) => {
        this.resubmitLoading.set(false);
        const stale = staleResubmitKey(err);
        if (stale) {
          // The stored key can't be used again: drop it so the user uploads the file afresh.
          const [key, file] = stale === 'video'
            ? [this.resubmitVideoKey, this.resubmitVideoFile]
            : [this.resubmitCopyrightKey, this.resubmitCopyrightFile];
          key.set(null);
          file.set(null);
          this.resubmitError.set({ text: null, key: 'uploadErrors.reuploadThenResubmit' });
          return;
        }
        // 400s carry a specific, actionable reason (wrong folder, unsupported extension, …).
        this.resubmitError.set({ text: apiErrorMessage(err), key: 'movieDetail.resubmit.failed' });
      },
    });
  }

  ngOnDestroy(): void {
    this.abortResubmitUploads();
    this.mainChart?.destroy();
    this.advChart?.destroy();
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }
}
