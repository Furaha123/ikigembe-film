import { Component, HostListener, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminService } from '../../services/admin.service';
import {
  ProducerItem,
  ProducerReport,
  MoviePurchaseItem,
  ProducerDocuments,
} from '../../models/admin.interface';

import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';

@Component({
  selector: 'app-admin-producers',
  imports: [CommonModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-producers.component.html',
  styleUrl: './admin-producers.component.scss'
})
export class AdminProducersComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly translate = inject(TranslateService);

  producers     = signal<ProducerItem[]>([]);
  statusFilter  = signal<'all' | 'pending' | 'approved' | 'suspended'>('all');
  isLoading     = signal(true);
  actionId      = signal<number | null>(null);

  filteredProducers = computed(() => {
    const filter = this.statusFilter();
    if (filter === 'all') return this.producers();
    return this.producers().filter(p => this.producerStatus(p) === filter);
  });

  filterCount = (f: 'pending' | 'approved' | 'suspended') =>
    this.producers().filter(p => this.producerStatus(p) === f).length;

  ngOnInit() {
    this.loadProducers();
  }

  loadProducers() {
    this.isLoading.set(true);
    this.adminService.getProducers().subscribe({
      next: (data) => { this.producers.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  exportToCSV() {
    const headers = ['id', 'name', 'email', 'phone', 'movies', 'earnings', 'balance', 'pendingWithdrawals', 'totalWithdrawn', 'status', 'dateJoined']
      .map(k => this.translate.instant(`admin.producers.csv.${k}`));
    const rows = this.producers().map(p => [
      p.id, p.name, p.email, p.phone_number ?? '', p.movies_uploaded,
      p.total_earnings, p.balance, p.pending_withdrawals, p.total_withdrawn,
      this.translate.instant(p.is_active ? 'admin.producers.csv.active' : 'admin.producers.csv.inactive'), p.date_joined,
    ]);
    this.downloadCSV('producers.csv', headers, rows);
  }

  private downloadCSV(filename: string, headers: string[], rows: unknown[][]) {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(','), ...rows.map((r: any) => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  approve(id: number) {
    this.actionId.set(id);
    this.adminService.approveProducer(id).subscribe({
      next: () => {
        this.producers.update(list => list.map(p => p.id === id ? { ...p, is_active: true, status: 'approved' } : p));
        if (this.detailReport()?.producer.id === id) this.openDetail(id);
        this.actionId.set(null);
      },
      error: (err: unknown) => {
        this.actionId.set(null);
        this.actionError.set(apiErrorMessage(err) ?? this.translate.instant('admin.producers.actionFailed'));
      },
    });
  }

  /** Last failed list action (approve), shown above the table. */
  actionError = signal<string | null>(null);

  // ── Reject with reason ─────────────────────────────────
  rejectModal    = signal<number | null>(null);
  rejectReason   = signal('');
  isRejecting    = signal(false);
  rejectError    = signal<string | null>(null);

  openRejectModal(id: number) { this.closeMenu(); this.rejectModal.set(id); this.rejectReason.set(''); this.rejectError.set(null); }
  closeRejectModal() { this.rejectModal.set(null); this.rejectReason.set(''); }

  confirmReject() {
    const id = this.rejectModal();
    if (id === null || !this.rejectReason().trim()) return;
    this.isRejecting.set(true);
    this.rejectError.set(null);
    this.adminService.rejectProducer(id, this.rejectReason().trim()).subscribe({
      next: () => {
        this.producers.update(list => list.map(p => p.id === id ? { ...p, is_active: false, status: 'pending' } : p));
        this.isRejecting.set(false);
        this.closeRejectModal();
      },
      // Never close silently on failure. (Backend: POST …/producers/<id>/reject/ is not implemented yet → 404.)
      error: (err: unknown) => {
        this.isRejecting.set(false);
        this.rejectError.set(apiErrorMessage(err) ?? this.translate.instant(
          err instanceof HttpErrorResponse && err.status === 404 ? 'admin.producers.rejectUnsupported' : 'admin.producers.actionFailed'));
      },
    });
  }

  // ── Suspend with reason ────────────────────────────────
  suspendModal   = signal<number | null>(null);
  suspendReason  = signal('');
  isSuspending   = signal(false);

  openSuspendModal(id: number) { this.closeMenu(); this.suspendModal.set(id); this.suspendReason.set(''); }
  closeSuspendModal() { this.suspendModal.set(null); this.suspendReason.set(''); }

  confirmSuspend() {
    const id = this.suspendModal();
    if (id === null) return;
    this.isSuspending.set(true);
    this.adminService.suspendProducer(id, this.suspendReason()).subscribe({
      next: () => {
        this.producers.update(list => list.map(p => p.id === id ? { ...p, is_active: false, status: 'suspended', suspension_reason: this.suspendReason() } : p));
        this.isSuspending.set(false);
        this.closeSuspendModal();
      },
      error: () => this.isSuspending.set(false),
    });
  }

  // ── View Documents ─────────────────────────────────────
  docsModal      = signal<{ producerId: number; producerName: string } | null>(null);
  producerDocs   = signal<ProducerDocuments | null>(null);
  docsLoading    = signal(false);

  openDocsModal(id: number, name: string) {
    this.closeMenu();
    this.docsModal.set({ producerId: id, producerName: name });
    this.producerDocs.set(null);
    this.docsLoading.set(true);
    this.adminService.getProducerDocuments(id).subscribe({
      next: (docs) => { this.producerDocs.set(docs); this.docsLoading.set(false); },
      error: () => { this.producerDocs.set({ copyright_url: null, id_url: null }); this.docsLoading.set(false); },
    });
  }

  closeDocsModal() { this.docsModal.set(null); this.producerDocs.set(null); }

  producerStatus(p: ProducerItem): 'pending' | 'approved' | 'suspended' {
    if (p.status) return p.status;
    return p.is_active ? 'approved' : 'pending';
  }

  menuProducerName(): string {
    const id = this.menuProducer()?.id;
    if (id === undefined) return '';
    return this.producers().find(p => p.id === id)?.name ?? '';
  }

  getInitials(name: string): string {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '??';
  }

  // ── Kebab menu ─────────────────────────────────────────
  menuProducer = signal<{ id: number; is_active: boolean } | null>(null);
  menuPos      = signal<{ top: number; right: number }>({ top: 0, right: 0 });

  @HostListener('document:click')
  onDocumentClick() { this.menuProducer.set(null); }

  toggleMenu(producer: { id: number; is_active: boolean }, event: Event) {
    event.stopPropagation();
    if (this.menuProducer()?.id === producer.id) { this.menuProducer.set(null); return; }
    const btn = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos.set({ top: btn.bottom + 6, right: window.innerWidth - btn.right });
    this.menuProducer.set(producer);
  }

  closeMenu() { this.menuProducer.set(null); }

  // ── Detail panel ───────────────────────────────────────
  detailReport  = signal<ProducerReport | null>(null);
  detailLoading = signal(false);

  detailProducerItem = computed(() => {
    const id = this.detailReport()?.producer.id;
    if (id === undefined) return null;
    return this.producers().find(p => p.id === id) ?? null;
  });

  openDetail(id: number) {
    this.closeMenu();
    this.detailReport.set(null);
    this.detailLoading.set(true);
    this.adminService.getProducerReport(id).subscribe({
      next: (data) => { this.detailReport.set(data); this.detailLoading.set(false); },
      error: ()     => this.detailLoading.set(false),
    });
  }

  closeDetail() {
    this.detailReport.set(null);
    this.detailLoading.set(false);
    this.closePurchases();
  }

  // ── Purchases drilldown ────────────────────────────────
  purchasesProducerId = signal<number | null>(null);
  purchasesMovieId    = signal<number | null>(null);
  purchasesMovieTitle = signal<string>('');
  purchases           = signal<MoviePurchaseItem[]>([]);
  purchasesLoading    = signal(false);
  purchasesPage       = signal(1);
  purchasesTotalPages = signal(1);
  purchasesTotalCount = signal(0);

  openPurchases(producerId: number, movieId: number, movieTitle: string) {
    this.purchasesProducerId.set(producerId);
    this.purchasesMovieId.set(movieId);
    this.purchasesMovieTitle.set(movieTitle);
    this.purchasesPage.set(1);
    this.loadPurchasesPage(producerId, movieId, 1);
  }

  loadPurchasesPage(producerId: number, movieId: number, page: number) {
    this.purchasesLoading.set(true);
    this.adminService.getMoviePurchases(producerId, movieId, page).subscribe({
      next: (res) => {
        this.purchases.set(res.results);
        this.purchasesPage.set(res.page);
        this.purchasesTotalPages.set(res.total_pages);
        this.purchasesTotalCount.set(res.total_results);
        this.purchasesLoading.set(false);
      },
      error: () => this.purchasesLoading.set(false),
    });
  }

  prevPage() {
    const page = this.purchasesPage() - 1;
    if (page < 1) return;
    this.loadPurchasesPage(this.purchasesProducerId()!, this.purchasesMovieId()!, page);
  }

  nextPage() {
    const page = this.purchasesPage() + 1;
    if (page > this.purchasesTotalPages()) return;
    this.loadPurchasesPage(this.purchasesProducerId()!, this.purchasesMovieId()!, page);
  }

  closePurchases() {
    this.purchasesProducerId.set(null);
    this.purchasesMovieId.set(null);
    this.purchases.set([]);
  }

  purchaseStatusClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'completed') return 'status-ok';
    if (s === 'failed')    return 'status-fail';
    return 'status-pending';
  }

  // ── Reset Password ─────────────────────────────────────
  resetPasswordBanner = signal<string | null>(null);

  doResetPassword(id: number) {
    this.closeMenu();
    this.actionId.set(id);
    this.adminService.resetUserPassword(id).subscribe({
      next: (res) => {
        this.resetPasswordBanner.set(res.temporary_password);
        this.actionId.set(null);
      },
      error: () => this.actionId.set(null),
    });
  }

  dismissResetBanner() { this.resetPasswordBanner.set(null); }

  // ── Delete flow ────────────────────────────────────────
  confirmDeleteId = signal<number | null>(null);

  targetProducerName = computed(() => {
    const id = this.confirmDeleteId();
    if (id === null) return '';
    const match = this.producers().find(p => p.id === id);
    return match?.name || '';
  });

  openDeleteConfirm(id: number) { this.closeMenu(); this.confirmDeleteId.set(id); }
  cancelDelete() { this.confirmDeleteId.set(null); }

  confirmDelete() {
    const id = this.confirmDeleteId();
    if (id === null) return;
    this.actionId.set(id);
    this.adminService.deleteUser(id).subscribe({
      next: () => {
        this.producers.update(list => list.filter(p => p.id !== id));
        if (this.detailReport()?.producer.id === id) this.closeDetail();
        this.actionId.set(null);
        this.confirmDeleteId.set(null);
      },
      error: () => { this.actionId.set(null); this.confirmDeleteId.set(null); },
    });
  }
}
