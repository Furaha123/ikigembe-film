import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminService } from '../../services/admin.service';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { WithdrawalItem } from '../../models/admin.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';

import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
// Processing = MoMo payout sent, awaiting PawaPay; Failed = payout refused (backend WithdrawalRequest.STATUS_CHOICES).
type StatusFilter = 'all' | 'Pending' | 'Approved' | 'Processing' | 'Completed' | 'Failed' | 'Rejected';

@Component({
  selector: 'app-admin-withdrawals',
  imports: [ModalBackdropDirective, CommonModule, TranslatePipe, AdminSectionTabsComponent],
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

  readonly filters: StatusFilter[] = ['all', 'Pending', 'Approved', 'Processing', 'Completed', 'Failed', 'Rejected'];
  /** Outcome of the last action, announced in an aria-live region. */
  notice = signal<{ kind: 'success' | 'error'; text: string | null; key: string; params?: Record<string, unknown> } | null>(null);

  filtered = computed(() => {
    const f = this.activeFilter();
    return f === 'all'
      ? this.withdrawals()
      : this.withdrawals().filter(w => w.status === f);
  });

  counts = computed(() => {
    const all = this.withdrawals();
    const counts: Record<StatusFilter, number> = { all: all.length, Pending: 0, Approved: 0, Processing: 0, Completed: 0, Failed: 0, Rejected: 0 };
    for (const w of all) if (w.status in counts) counts[w.status as StatusFilter]++;
    return counts;
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading.set(true);
    this.adminService.getWithdrawals().subscribe({
      next: (res) => { this.withdrawals.set(res.results); this.isLoading.set(false); },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.notice.set({ kind: 'error', text: apiErrorMessage(err), key: 'admin.withdrawalsPage.loadFailed' });
      },
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
    this.notice.set(null);

    const call$ = action.type === 'approve'
      ? this.adminService.approveWithdrawal(action.id)
      : action.type === 'complete'
        ? this.adminService.completeWithdrawal(action.id)
        : this.adminService.rejectWithdrawal(action.id);

    const nextStatus = action.type === 'approve' ? 'Approved'
      : action.type === 'complete' ? 'Completed'
      : 'Rejected';

    call$.subscribe({
      next: (res) => {
        // The server decides the outcome: a MoMo payout comes back 'Processing', not 'Completed'.
        const status = (res as { status?: unknown } | null)?.status;
        const newStatus = typeof status === 'string' ? status : nextStatus;
        this.withdrawals.update(list =>
          list.map(w => w.id === action.id ? { ...w, status: newStatus } : w)
        );
        this.actionId.set(null);
        if (this.detailItem()?.id === action.id) {
          this.detailItem.update(d => d ? { ...d, status: newStatus } : d);
        }
        this.notice.set({ kind: 'success', text: null, key: 'admin.withdrawalsPage.updated', params: { id: action.id, status: newStatus } });
      },
      error: (err: unknown) => {
        this.actionId.set(null);
        this.notice.set({ kind: 'error', text: apiErrorMessage(err), key: 'admin.withdrawalsPage.actionFailed' });
        // A failed payout can still change the record (the backend marks it Failed): re-read it.
        this.load();
      },
    });
  }

  /** MoMo "Mark paid" sends the money through PawaPay; Bank only records a manual transfer. */
  completeBodyKey(id: number): string {
    const w = this.withdrawals().find(x => x.id === id);
    return w?.payment_method === 'MoMo' ? 'admin.withdrawalsPage.completeBodyMomo' : 'admin.withdrawalsPage.completeBody';
  }

  statusKey(status: string): string {
    return (this.filters as string[]).includes(status) ? `admin.withdrawalsPage.status.${status}` : status;
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
