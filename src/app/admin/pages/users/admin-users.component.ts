import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService, ViewerPaymentItem } from '../../services/admin.service';
import { ViewerItem } from '../../models/admin.interface';
import { AdminTableComponent } from '../../shared/components/admin-table/admin-table.component';
import { TableColumn } from '../../shared/components/admin-table/table-column.interface';

@Component({
  selector: 'app-admin-users',
  imports: [CommonModule, AdminTableComponent],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  users = signal<ViewerItem[]>([]);
  isLoading = signal(true);
  actionId = signal<number | null>(null);

  confirmSuspendId = signal<number | null>(null);
  confirmDeleteId  = signal<number | null>(null);

  // Resolve the user name for the modal message
  targetUserName = computed(() => {
    const id = this.confirmSuspendId() ?? this.confirmDeleteId();
    if (id === null) return '';
    const user = this.users().find(u => u.id === id);
    return user?.name || user?.email || 'this user';
  });

  readonly columns: TableColumn[] = [
    { key: 'name',          label: 'Full name',      type: 'avatar', fallbackKey: 'email', width: '220px' },
    { key: 'email',         label: 'Email',          type: 'text',   muted: true, width: '240px' },
    { key: 'movies_watched',label: 'Movies watched', type: 'number', width: '140px' },
    { key: 'date_joined',   label: 'Joined date',    type: 'date',   muted: true, width: '200px' },
    { key: 'is_active',     label: 'Status',         type: 'status', width: '110px' },
  ];

  ngOnInit() {
    this.isLoading.set(true);
    this.adminService.getViewers().subscribe({
      next: (data) => { this.users.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  // Suspend flow
  openSuspendConfirm(id: number) { this.confirmSuspendId.set(id); }
  cancelSuspend() { this.confirmSuspendId.set(null); }

  confirmSuspend() {
    const id = this.confirmSuspendId();
    if (id === null) return;
    this.actionId.set(id);
    this.adminService.suspendUser(id).subscribe({
      next: () => {
        this.users.update(list => list.map(u => u.id === id ? { ...u, is_active: false } : u));
        this.actionId.set(null);
        this.confirmSuspendId.set(null);
      },
      error: () => { this.actionId.set(null); this.confirmSuspendId.set(null); },
    });
  }

  // Delete flow
  openDeleteConfirm(id: number) { this.confirmDeleteId.set(id); }
  cancelDelete() { this.confirmDeleteId.set(null); }

  confirmDelete() {
    const id = this.confirmDeleteId();
    if (id === null) return;
    this.actionId.set(id);
    this.adminService.deleteUser(id).subscribe({
      next: () => {
        this.users.update(list => list.filter(u => u.id !== id));
        this.actionId.set(null);
        this.confirmDeleteId.set(null);
      },
      error: () => { this.actionId.set(null); this.confirmDeleteId.set(null); },
    });
  }

  // Payments panel
  paymentsUserId   = signal<number | null>(null);
  paymentsUserName = signal('');
  payments         = signal<ViewerPaymentItem[]>([]);
  paymentsLoading  = signal(false);

  openPayments(user: ViewerItem) {
    this.paymentsUserId.set(user.id);
    this.paymentsUserName.set(user.name || user.email);
    this.payments.set([]);
    this.paymentsLoading.set(true);
    this.adminService.getViewerPayments(user.id).subscribe({
      next: (data) => { this.payments.set(data); this.paymentsLoading.set(false); },
      error: ()     => this.paymentsLoading.set(false),
    });
  }

  closePayments() { this.paymentsUserId.set(null); }

  paymentStatusClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'completed') return 'status-ok';
    if (s === 'failed')    return 'status-fail';
    return 'status-pending';
  }
}
