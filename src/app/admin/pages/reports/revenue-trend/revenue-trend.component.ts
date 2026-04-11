import {
  Component, inject, signal, computed, OnInit,
  AfterViewChecked, ViewChild, ElementRef, PLATFORM_ID, OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminService } from '../../../services/admin.service';
import { RevenueTrendItem } from '../../../models/admin.interface';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import {
  Chart, CategoryScale, LinearScale, Tooltip, Legend,
  LineController, LineElement, PointElement, Filler,
} from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(CategoryScale, LinearScale, Tooltip, Legend, LineController, LineElement, PointElement, Filler);

@Component({
  selector: 'app-revenue-trend',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './revenue-trend.component.html',
  styleUrl: './revenue-trend.component.scss',
})
export class RevenueTrendComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly platformId   = inject(PLATFORM_ID);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

  trend      = signal<RevenueTrendItem[]>([]);
  isLoading  = signal(true);
  hasError   = signal(false);
  activeTab: 'revenue' | 'commission' | 'producer' = 'revenue';

  totalRevenue   = computed(() => this.trend().reduce((s, d) => s + d.total_revenue, 0));
  totalComm      = computed(() => this.trend().reduce((s, d) => s + d.ikigembe_commission, 0));
  totalProd      = computed(() => this.trend().reduce((s, d) => s + d.producer_share, 0));
  totalPurchases = computed(() => this.trend().reduce((s, d) => s + d.purchase_count, 0));

  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;
  private needsBuild = false;
  private sub: Subscription | null = null;

  ngOnInit(): void { this.load(); }

  onDateRangeChange(range: DateRange): void {
    if (range.start) this.dateFrom.set(range.start.toISOString().slice(0, 10));
    if (range.end)   this.dateTo.set(range.end.toISOString().slice(0, 10));
    if (range.start && range.end) this.load();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.isLoading.set(true);
    this.hasError.set(false);
    this.needsBuild = false;
    this.sub = this.adminService.getRevenueTrend(
      'monthly',
      this.dateFrom() || undefined,
      this.dateTo()   || undefined,
    ).subscribe({
      next: (data) => {
        this.trend.set(data.trend ?? []);
        this.isLoading.set(false);
        this.needsBuild = true;
      },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  ngAfterViewChecked(): void {
    if (!this.needsBuild || !isPlatformBrowser(this.platformId) || !this.canvas?.nativeElement) return;
    this.needsBuild = false;
    this.buildChart();
  }

  switchTab(tab: 'revenue' | 'commission' | 'producer'): void {
    this.activeTab = tab;
    this.buildChart();
  }

  private buildChart(): void {
    this.chart?.destroy();
    if (!this.canvas?.nativeElement) return;
    const data   = this.trend();
    const labels = data.map(d => this.shortMonth(d.period_start));
    const colorMap = { revenue: '#C5A253', commission: '#818cf8', producer: '#34d399' };
    const labelMap = { revenue: 'Total Revenue', commission: 'Platform Commission', producer: 'Producer Share' };
    const dataMap  = {
      revenue:    data.map(d => d.total_revenue),
      commission: data.map(d => d.ikigembe_commission),
      producer:   data.map(d => d.producer_share),
    };
    const color = colorMap[this.activeTab];
    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: labelMap[this.activeTab],
          data: dataMap[this.activeTab],
          borderColor: color,
          backgroundColor: color + '14',
          fill: true, tension: 0.45,
          pointRadius: 4, pointHoverRadius: 7,
          pointBackgroundColor: color, pointBorderColor: '#0f0f0f', pointBorderWidth: 2,
          borderWidth: 2.5,
        }],
      },
      options: {
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
      },
    });
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['REVENUE TREND REPORT'],
      [`Generated: ${dateLabel}`],
      [],
      ['Period', 'Total Revenue (RWF)', 'Producer Share (RWF)', 'Commission (RWF)', 'Purchases'],
      ...this.trend().map(d => [
        new Date(d.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        d.total_revenue, d.producer_share, d.ikigembe_commission, d.purchase_count,
      ]),
      [],
      ['TOTALS', this.totalRevenue(), this.totalProd(), this.totalComm(), this.totalPurchases()],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Trend');
    XLSX.writeFile(wb, `revenue_trend_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  private defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  private shortMonth(s: string): string {
    if (!s) return '';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.chart?.destroy();
  }
}
