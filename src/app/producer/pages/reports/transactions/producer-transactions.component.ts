import {
  Component, inject, signal, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ProducerService, ProducerTransactionItem, ProducerTransactionList } from '../../../services/producer.service';
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

  transactions = signal<ProducerTransactionItem[]>([]);
  isLoading    = signal(true);
  hasError     = signal(false);
  page         = signal(1);
  totalPages   = signal(1);
  totalResults = signal(0);

  private sub: Subscription | null = null;

  ngOnInit(): void { this.load(); }

  load(): void {
    this.sub?.unsubscribe();
    this.isLoading.set(true);
    this.hasError.set(false);
    this.sub = this.producerService.getTransactions(this.page()).subscribe({
      next: (data: ProducerTransactionList) => {
        this.transactions.set(data.results ?? []);
        this.totalPages.set(data.total_pages ?? 1);
        this.totalResults.set(data.total_results ?? 0);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
    this.load();
  }

  pages(): number[] {
    const total = this.totalPages(), cur = this.page(), delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, cur - delta); i <= Math.min(total, cur + delta); i++) range.push(i);
    return range;
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: (string | number | null)[][] = [
      ['TRANSACTION HISTORY'],
      [`Generated: ${dateLabel}`],
      [`Total transactions: ${this.totalResults()}`],
      [],
      ['Movie', 'Buyer', 'Amount (RWF)', 'Your Share (RWF)', 'Status', 'Date'],
      ...this.transactions().map(t => [
        t.movie_title, t.buyer_name ?? '', t.amount, t.your_share, t.status, t.created_at,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, `transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
