import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService } from '../../services/admin.service';
import { DashboardOverview, TransactionHistory } from '../../models/admin.interface';

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  overview = signal<DashboardOverview | null>(null);
  transactions = signal<TransactionHistory | null>(null);
  isLoading = signal(true);

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

  private loadCount = 0;
  private checkDone() {
    this.loadCount++;
    if (this.loadCount >= 2) this.isLoading.set(false);
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
