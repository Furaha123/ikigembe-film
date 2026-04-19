import {
  Component, inject, signal, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  ProducerService,
  ProducerPaymentItem,
  ProducerWithdrawalTransactionItem,
} from '../../../services/producer.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-producer-transactions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './producer-transactions.component.html',
  styleUrl: './producer-transactions.component.scss',
})
export class ProducerTransactionsComponent implements OnInit, OnDestroy {
  private readonly producerService = inject(ProducerService);

  activeTab = signal<'payments' | 'withdrawals'>('payments');

  payments     = signal<ProducerPaymentItem[]>([]);
  withdrawals  = signal<ProducerWithdrawalTransactionItem[]>([]);
  isLoading    = signal(true);
  hasError     = signal(false);

  payPage        = signal(1);
  payTotalPages  = signal(1);
  payTotal       = signal(0);

  withdrawPage       = signal(1);
  withdrawTotalPages = signal(1);
  withdrawTotal      = signal(0);

  private sub: Subscription | null = null;

  ngOnInit(): void { this.load(); }

  switchTab(tab: 'payments' | 'withdrawals'): void {
    this.activeTab.set(tab);
  }

  load(): void {
    this.sub?.unsubscribe();
    this.isLoading.set(true);
    this.hasError.set(false);
    const page = this.activeTab() === 'payments' ? this.payPage() : this.withdrawPage();
    this.sub = this.producerService.getTransactions(page).subscribe({
      next: (data) => {
        const p = data.payments;
        const w = data.withdrawals;
        this.payments.set(p?.results ?? []);
        this.payPage.set(p?.page ?? 1);
        this.payTotalPages.set(p?.total_pages ?? 1);
        this.payTotal.set(p?.total_results ?? 0);
        this.withdrawals.set(w?.results ?? []);
        this.withdrawPage.set(w?.page ?? 1);
        this.withdrawTotalPages.set(w?.total_pages ?? 1);
        this.withdrawTotal.set(w?.total_results ?? 0);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  goToPage(p: number): void {
    if (this.activeTab() === 'payments') {
      if (p < 1 || p > this.payTotalPages()) return;
      this.payPage.set(p);
    } else {
      if (p < 1 || p > this.withdrawTotalPages()) return;
      this.withdrawPage.set(p);
    }
    this.load();
  }

  currentPage(): number {
    return this.activeTab() === 'payments' ? this.payPage() : this.withdrawPage();
  }

  totalPages(): number {
    return this.activeTab() === 'payments' ? this.payTotalPages() : this.withdrawTotalPages();
  }

  totalResults(): number {
    return this.activeTab() === 'payments' ? this.payTotal() : this.withdrawTotal();
  }

  pages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, cur - delta); i <= Math.min(total, cur + delta); i++) range.push(i);
    return range;
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (this.activeTab() === 'payments') {
      const rows: (string | number)[][] = [
        ['PAYMENT HISTORY'],
        [`Generated: ${dateLabel}`],
        [`Total payments: ${this.payTotal()}`],
        [],
        ['Movie', 'Gross Amount (RWF)', 'Your Earnings (RWF)', 'Date'],
        ...this.payments().map(t => [t.movie_title, t.gross_amount, t.producer_earnings, t.date]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 20 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Payments');
      XLSX.writeFile(wb, `payments_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const rows: (string | number | null)[][] = [
        ['WITHDRAWAL HISTORY'],
        [`Generated: ${dateLabel}`],
        [`Total withdrawals: ${this.withdrawTotal()}`],
        [],
        ['Amount (RWF)', 'Tax (RWF)', 'After Tax (RWF)', 'Method', 'Account/MoMo', 'Status', 'Processed At'],
        ...this.withdrawals().map(w => [
          w.amount, w.tax_amount, w.amount_after_tax,
          w.payment_method,
          w.momo_number ?? w.account_number ?? '',
          w.status,
          w.processed_at ?? '',
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Withdrawals');
      XLSX.writeFile(wb, `withdrawals_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  accountInfo(w: ProducerWithdrawalTransactionItem): string {
    if (w.payment_method === 'MoMo') {
      return `${w.momo_provider ?? ''} ${w.momo_number ?? ''}`.trim();
    }
    return [w.bank_name, w.account_number].filter(Boolean).join(' · ') || '—';
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
