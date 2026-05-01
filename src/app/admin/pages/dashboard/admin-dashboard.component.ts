import {
  Component, signal, AfterViewInit, OnDestroy, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const MOCK = {
  totalRevenue:      { amount: 124_563_000, growth: 12.5 },
  commission:        { amount:  37_369_000, rate: 30 },
  producerPayouts:   { amount:  87_194_000, rate: 70 },
  pendingWithdrawals:{ amount:  12_450_000, count: 8 },
  totalUsers:        { count: 45_231, growth: 8.2 },
  activeProducers:   { count: 287,    growth: 15.3 },
  moviesOnPlatform:  { count: 1_542,  newThisMonth: 24 },
  totalViews:        { count: 2_400_000, growth: 18.5 },
  revenueTrend: [
    { label: 'Jan', revenue: 32_000_000, payouts: 15_000_000 },
    { label: 'Feb', revenue: 38_000_000, payouts: 18_000_000 },
    { label: 'Mar', revenue: 42_000_000, payouts: 22_000_000 },
    { label: 'Apr', revenue: 45_000_000, payouts: 28_000_000 },
    { label: 'May', revenue: 48_000_000, payouts: 35_000_000 },
    { label: 'Jun', revenue: 55_000_000, payouts: 45_000_000 },
  ],
  withdrawalRequests: [
    { producer: 'FitLife Productions', date: 'Apr 23, 2026', amount: 1_900_000, status: 'Pending'    },
    { producer: 'Success Media',       date: 'Apr 22, 2026', amount: 2_100_000, status: 'Pending'    },
    { producer: 'Design Pro Studios',  date: 'Apr 22, 2026', amount: 1_650_000, status: 'Processing' },
    { producer: 'TechVision Studios',  date: 'Apr 21, 2026', amount: 3_200_000, status: 'Completed'  },
    { producer: 'Chef Masters Inc',    date: 'Apr 20, 2026', amount: 1_450_000, status: 'Completed'  },
  ],
  topProducers: [
    { name: 'Tech Vision Studios', revenue: 18_450_000, commission: 5_535_000, videos: 12, growth: 24 },
    { name: 'Chef Masters Inc',    revenue: 14_920_000, commission: 4_476_000, videos:  8, growth: 18 },
    { name: 'World Explorers',     revenue: 12_650_000, commission: 3_795_000, videos: 15, growth: 15 },
    { name: 'FitLife Productions', revenue: 11_340_000, commission: 3_402_000, videos: 10, growth: 12 },
    { name: 'Success Media',       revenue:  9_890_000, commission: 2_967_000, videos:  6, growth:  9 },
  ],
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('revenueChart') chartCanvas!: ElementRef<HTMLCanvasElement>;

  readonly data = MOCK;
  isLoading = signal(false);

  private chart: Chart | null = null;

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  ngAfterViewInit(): void {
    this.buildChart();
  }

  private buildChart(): void {
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) return;
    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: MOCK.revenueTrend.map(r => r.label),
        datasets: [
          {
            label: 'Total Revenue',
            data: MOCK.revenueTrend.map(r => r.revenue / 1_000_000),
            backgroundColor: '#2dd4bf',
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: 'Producer Payouts',
            data: MOCK.revenueTrend.map(r => r.payouts / 1_000_000),
            backgroundColor: '#C8A84B',
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
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
            callbacks: { label: ctx => ` RWF ${(ctx.parsed.y as number).toFixed(1)}M` },
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
            ticks: { color: '#666', font: { size: 11 }, callback: v => v + 'M' },
            border: { color: 'transparent' },
            beginAtZero: true,
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

  ngOnDestroy(): void { this.chart?.destroy(); }
}
