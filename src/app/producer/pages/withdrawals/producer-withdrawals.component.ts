import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProducerService, ProducerWithdrawal } from '../../services/producer.service';

type FilterTab = 'All' | 'Pending' | 'Approved' | 'Completed' | 'Rejected';

@Component({
  selector: 'app-producer-withdrawals',
  imports: [CommonModule],
  templateUrl: './producer-withdrawals.component.html',
  styleUrl: './producer-withdrawals.component.scss'
})
export class ProducerWithdrawalsComponent implements OnInit {
  private readonly producerService = inject(ProducerService);

  withdrawals = signal<ProducerWithdrawal[]>([]);
  isLoading = signal(true);
  activeFilter = signal<FilterTab>('All');

  tabs: FilterTab[] = ['All', 'Pending', 'Approved', 'Completed', 'Rejected'];

  counts = computed(() => {
    const all = this.withdrawals();
    return {
      All: all.length,
      Pending: all.filter(w => w.status === 'Pending').length,
      Approved: all.filter(w => w.status === 'Approved').length,
      Completed: all.filter(w => w.status === 'Completed').length,
      Rejected: all.filter(w => w.status === 'Rejected').length,
    };
  });

  filtered = computed(() => {
    const f = this.activeFilter();
    return f === 'All' ? this.withdrawals() : this.withdrawals().filter(w => w.status === f);
  });

  ngOnInit() {
    this.producerService.getWithdrawals().subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : (data as any).results ?? [];
        this.withdrawals.set(list);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  statusClass(status: string): string {
    return status.toLowerCase();
  }
}
