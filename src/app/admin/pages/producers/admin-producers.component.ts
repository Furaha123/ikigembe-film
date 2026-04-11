import { Component, HostListener, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import {
  ProducerItem,
  ProducerReport,
  MoviePurchaseItem,
} from '../../models/admin.interface';

interface FieldErrors {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
}

@Component({
  selector: 'app-admin-producers',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-producers.component.html',
  styleUrl: './admin-producers.component.scss'
})
export class AdminProducersComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly fb = inject(FormBuilder);

  producers     = signal<ProducerItem[]>([]);
  isLoading     = signal(true);
  actionId      = signal<number | null>(null);
  showAddModal  = signal(false);
  isSaving      = signal(false);
  apiErrors     = signal<FieldErrors>({});
  generatedPassword = signal<string | null>(null);

  form = this.fb.group({
    first_name:   ['', Validators.required],
    last_name:    ['', Validators.required],
    email:        ['', [Validators.required, Validators.email]],
    phone_number: ['', Validators.required],
  });

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

  dismissPassword() { this.generatedPassword.set(null); }

  openAddModal() {
    this.form.reset();
    this.apiErrors.set({});
    this.showAddModal.set(true);
  }

  closeAddModal() {
    this.showAddModal.set(false);
    this.apiErrors.set({});
  }

  clearFieldError(field: keyof FieldErrors) {
    this.apiErrors.update(e => ({ ...e, [field]: undefined }));
  }

  saveProducer() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    this.apiErrors.set({});

    const payload = this.form.value as {
      first_name: string; last_name: string;
      email: string; phone_number: string;
    };

    this.adminService.createProducer(payload).subscribe({
      next: (res: any) => {
        this.isSaving.set(false);
        this.closeAddModal();
        if (res?.generated_password) {
          this.generatedPassword.set(res.generated_password);
        }
        this.loadProducers();
      },
      error: (err) => {
        this.isSaving.set(false);
        const body = err?.error ?? {};
        const errors: FieldErrors = {};

        if (body.email)        errors.email        = Array.isArray(body.email)        ? body.email[0]        : body.email;
        if (body.phone_number) errors.phone_number = Array.isArray(body.phone_number) ? body.phone_number[0] : body.phone_number;
        if (body.first_name)   errors.first_name   = Array.isArray(body.first_name)   ? body.first_name[0]   : body.first_name;
        if (body.last_name)    errors.last_name    = Array.isArray(body.last_name)    ? body.last_name[0]    : body.last_name;

        if (!Object.keys(errors).length && body.error) {
          const msg: string = body.error;
          if (msg.toLowerCase().includes('phone'))       errors.phone_number = msg;
          else if (msg.toLowerCase().includes('email'))  errors.email        = msg;
          else                                           errors.phone_number = msg;
        }

        if (!Object.keys(errors).length && body.detail) {
          errors.phone_number = body.detail;
        }

        this.apiErrors.set(errors);
      },
    });
  }

  approve(id: number) {
    this.actionId.set(id);
    this.adminService.approveProducer(id).subscribe({
      next: () => {
        this.producers.update(list => list.map(p => p.id === id ? { ...p, is_active: true } : p));
        if (this.detailReport()?.producer.id === id) {
          // refresh detail so status badge updates
          this.openDetail(id);
        }
        this.actionId.set(null);
      },
      error: () => this.actionId.set(null),
    });
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
    return match?.name || `Producer #${id}`;
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
