import { Component, HostListener, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService, ViewerPaymentItem } from '../../services/admin.service';
import { ViewerItem, ViewerDetail } from '../../models/admin.interface';
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

  users     = signal<ViewerItem[]>([]);
  isLoading = signal(true);
  actionId  = signal<number | null>(null);

  confirmSuspendId = signal<number | null>(null);
  confirmDeleteId  = signal<number | null>(null);

  targetUserName = computed(() => {
    const id = this.confirmSuspendId() ?? this.confirmDeleteId();
    if (id === null) return '';
    return this.detailUser()?.name || `User #${id}`;
  });

  readonly columns: TableColumn[] = [
    { key: 'id',                label: 'User ID',      type: 'text',     width: '90px' },
    { key: 'name',              label: 'Name',         type: 'text',     width: '180px' },
    { key: 'payment_count',     label: 'Payments',     type: 'number',   width: '110px' },
    { key: 'total_paid_rwf',    label: 'Total Paid',   type: 'currency', width: '150px' },
    { key: 'last_payment_date', label: 'Last Payment', type: 'date',     muted: true, width: '200px' },
    { key: 'is_active',         label: 'Status',       type: 'status',   width: '110px' },
  ];

  ngOnInit() {
    this.adminService.getViewers().subscribe({
      next: (data) => { this.users.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  // ── Kebab menu ─────────────────────────────────────────
  menuUser = signal<{ id: number; is_active: boolean } | null>(null);
  menuPos  = signal<{ top: number; right: number }>({ top: 0, right: 0 });

  @HostListener('document:click')
  onDocumentClick() { this.menuUser.set(null); }

  toggleMenu(user: { id: number; is_active: boolean }, event: Event) {
    event.stopPropagation();
    if (this.menuUser()?.id === user.id) { this.menuUser.set(null); return; }
    const btn  = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos.set({ top: btn.bottom + 6, right: window.innerWidth - btn.right });
    this.menuUser.set(user);
  }

  closeMenu() { this.menuUser.set(null); }

  // ── View Detail panel ──────────────────────────────────
  detailUser    = signal<ViewerDetail | null>(null);
  detailLoading = signal(false);

  openDetail(id: number) {
    this.closeMenu();
    this.detailUser.set(null);
    this.detailLoading.set(true);
    this.adminService.getViewerDetail(id).subscribe({
      next: (data) => { this.detailUser.set(data); this.detailLoading.set(false); },
      error: ()     => this.detailLoading.set(false),
    });
  }

  closeDetail() { this.detailUser.set(null); this.detailLoading.set(false); }

  getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  // ── Suspend flow ───────────────────────────────────────
  openSuspendConfirm(id: number) { this.closeMenu(); this.confirmSuspendId.set(id); }
  cancelSuspend() { this.confirmSuspendId.set(null); }

  confirmSuspend() {
    const id = this.confirmSuspendId();
    if (id === null) return;
    this.actionId.set(id);
    this.adminService.suspendUser(id).subscribe({
      next: () => {
        this.users.update(list => list.map(u => u.id === id ? { ...u, is_active: false } : u));
        if (this.detailUser()?.id === id) this.detailUser.update(u => u ? { ...u, is_active: false } : u);
        this.actionId.set(null);
        this.confirmSuspendId.set(null);
      },
      error: () => { this.actionId.set(null); this.confirmSuspendId.set(null); },
    });
  }

  // ── Delete flow ────────────────────────────────────────
  openDeleteConfirm(id: number) { this.closeMenu(); this.confirmDeleteId.set(id); }
  cancelDelete() { this.confirmDeleteId.set(null); }

  confirmDelete() {
    const id = this.confirmDeleteId();
    if (id === null) return;
    this.actionId.set(id);
    this.adminService.deleteUser(id).subscribe({
      next: () => {
        this.users.update(list => list.filter(u => u.id !== id));
        if (this.detailUser()?.id === id) this.closeDetail();
        this.actionId.set(null);
        this.confirmDeleteId.set(null);
      },
      error: () => { this.actionId.set(null); this.confirmDeleteId.set(null); },
    });
  }

  // ── Payments panel ─────────────────────────────────────
  paymentsUserId  = signal<number | null>(null);
  payments        = signal<ViewerPaymentItem[]>([]);
  paymentsLoading = signal(false);

  openPayments(userId: number) {
    this.closeMenu();
    this.paymentsUserId.set(userId);
    this.payments.set([]);
    this.paymentsLoading.set(true);
    this.adminService.getViewerPayments(userId).subscribe({
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
