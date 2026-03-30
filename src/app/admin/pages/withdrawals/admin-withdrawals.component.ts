import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService } from '../../services/admin.service';
import { WithdrawalItem } from '../../models/admin.interface';

type StatusFilter = 'all' | 'Pending' | 'Approved' | 'Completed' | 'Rejected';

@Component({
  selector: 'app-admin-withdrawals',
  imports: [CommonModule],
  templateUrl: './admin-withdrawals.component.html',
  styleUrl: './admin-withdrawals.component.scss'
})
export class AdminWithdrawalsComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  withdrawals = signal<WithdrawalItem[]>([]);
  isLoading = signal(true);
  actionId = signal<number | null>(null);
  activeFilter = signal<StatusFilter>('all');
  detailItem = signal<WithdrawalItem | null>(null);
  confirmAction = signal<{ id: number; type: 'approve' | 'complete' | 'reject' } | null>(null);

  readonly filters: StatusFilter[] = ['all', 'Pending', 'Approved', 'Completed', 'Rejected'];

  filtered = computed(() => {
    const f = this.activeFilter();
    return f === 'all'
      ? this.withdrawals()
      : this.withdrawals().filter(w => w.status === f);
  });

  counts = computed(() => {
    const all = this.withdrawals();
    return {
      all: all.length,
      Pending: all.filter(w => w.status === 'Pending').length,
      Approved: all.filter(w => w.status === 'Approved').length,
      Completed: all.filter(w => w.status === 'Completed').length,
      Rejected: all.filter(w => w.status === 'Rejected').length,
    };
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading.set(true);
    this.adminService.getWithdrawals().subscribe({
      next: (res) => { this.withdrawals.set(res.results); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  openDetail(item: WithdrawalItem) {
    this.detailItem.set(item);
  }

  closeDetail() {
    this.detailItem.set(null);
  }

  openConfirm(id: number, type: 'approve' | 'complete' | 'reject') {
    this.confirmAction.set({ id, type });
  }

  cancelConfirm() {
    this.confirmAction.set(null);
  }

  runAction() {
    const action = this.confirmAction();
    if (!action) return;

    this.actionId.set(action.id);
    this.confirmAction.set(null);

    const call$ = action.type === 'approve'
      ? this.adminService.approveWithdrawal(action.id)
      : action.type === 'complete'
        ? this.adminService.completeWithdrawal(action.id)
        : this.adminService.rejectWithdrawal(action.id);

    const nextStatus = action.type === 'approve' ? 'Approved'
      : action.type === 'complete' ? 'Completed'
      : 'Rejected';

    call$.subscribe({
      next: () => {
        this.withdrawals.update(list =>
          list.map(w => w.id === action.id ? { ...w, status: nextStatus } : w)
        );
        this.actionId.set(null);
        if (this.detailItem()?.id === action.id) {
          this.detailItem.update(d => d ? { ...d, status: nextStatus } : d);
        }
      },
      error: () => this.actionId.set(null),
    });
  }

  getPaymentSummary(w: WithdrawalItem): string {
    if (w.payment_method === 'Bank') {
      return `${w.bank_name ?? ''} · ${w.account_number ?? ''}`;
    }
    if (w.payment_method === 'MoMo') {
      return `${w.momo_provider ?? ''} · ${w.momo_number ?? ''}`;
    }
    return '—';
  }
}
