import { Component, inject, signal, OnInit, OnDestroy, AfterViewChecked, ViewChild, ElementRef, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AdminService } from '../../services/admin.service';
import { DashboardOverview, TransactionHistory } from '../../models/admin.interface';
import {
  Chart, ArcElement, DoughnutController, Tooltip, Legend,
  BarElement, BarController, CategoryScale, LinearScale,
} from 'chart.js';

Chart.register(ArcElement, DoughnutController, BarElement, BarController, CategoryScale, LinearScale, Tooltip, Legend);

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit, AfterViewChecked, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly platformId = inject(PLATFORM_ID);

  overview = signal<DashboardOverview | null>(null);
  transactions = signal<TransactionHistory | null>(null);
  isLoading = signal(true);

  @ViewChild('revenueChart')    canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('financialsChart') barRef!: ElementRef<HTMLCanvasElement>;

  private doughnutChart: Chart | null = null;
  private barChart: Chart | null = null;
  private chartsBuilt = false;

  ngOnInit() {
    this.adminService.getOverview().subscribe({
      next: (data) => { this.overview.set(data); this.checkDone(); },
      error: () => this.checkDone(),
    });
    this.adminService.getTransactions().subscribe({
      next: (data) => { this.transactions.set(data); this.checkDone(); },
      error: () => this.checkDone(),
    });
  }

  ngAfterViewChecked() {
    const data = this.overview();
    if (!data || this.chartsBuilt || !isPlatformBrowser(this.platformId)) return;
    if (!this.canvasRef?.nativeElement || !this.barRef?.nativeElement) return;

    this.chartsBuilt = true;
    this.buildDoughnut(data);
    this.buildBar(data);
  }

  private loadCount = 0;
  private checkDone() {
    this.loadCount++;
    if (this.loadCount >= 2) this.isLoading.set(false);
  }

  private buildDoughnut(data: DashboardOverview) {
    this.doughnutChart?.destroy();
    const f = data.financials;
    this.doughnutChart = new Chart(this.canvasRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Producer Revenue', 'Platform Commission', 'Net Profit'],
        datasets: [{
          data: [f.producer_revenue, f.ikigembe_commission, f.total_profit],
          backgroundColor: ['#C5A253', '#818cf8', '#34d399'],
          borderColor: '#141414',
          borderWidth: 3,
          hoverBorderColor: '#141414',
          hoverBorderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#e5e5e5', padding: 20, font: { size: 12 }, usePointStyle: true, pointStyleWidth: 10 },
          },
          tooltip: {
            callbacks: { label: (ctx) => ` RWF ${ctx.parsed.toLocaleString()}` },
          },
        },
      },
    });
  }

  private buildBar(data: DashboardOverview) {
    this.barChart?.destroy();
    const f = data.financials;
    this.barChart = new Chart(this.barRef.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Today', 'This Month', 'Total Revenue', 'Paid to Producers', 'Commission', 'Net Profit'],
        datasets: [{
          label: 'RWF',
          data: [f.revenue_today, f.revenue_this_month, f.total_revenue, f.total_paid_to_producers, f.ikigembe_commission, f.total_profit],
          backgroundColor: ['#60a5fa', '#818cf8', '#C5A253', '#f97316', '#a78bfa', '#34d399'],
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` RWF ${(ctx.parsed.y as number).toLocaleString()}` },
          },
        },
        scales: {
          x: {
            ticks: { color: '#888', font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,0.05)' },
            border: { color: '#2a2a2a' },
          },
          y: {
            ticks: {
              color: '#888',
              font: { size: 11 },
              callback: (v) => 'RWF ' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'K' : v),
            },
            grid: { color: 'rgba(255,255,255,0.05)' },
            border: { color: '#2a2a2a' },
          },
        },
      },
    });
  }

  ngOnDestroy() {
    this.doughnutChart?.destroy();
    this.barChart?.destroy();
  }

  formatCurrency(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }
}
