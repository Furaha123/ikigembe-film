import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminPaymentsService, PaymentDetail, RefundMethod, RefundRow } from '../../services/admin-payments.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';

import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
/**
 * One payment: what it bought, its refunds and the admin actions on it. The server decides every
 * outcome (refund limits, provider support, status); this component only shows what it answers.
 */
@Component({
  selector: 'app-payment-detail-drawer',
  standalone: true,
  imports: [ModalBackdropDirective, CommonModule, FormsModule, TranslatePipe],
  templateUrl: './payment-detail-drawer.component.html',
  styleUrl: './admin-payments.component.scss',
})
export class PaymentDetailDrawerComponent implements OnChanges {
  private readonly payments = inject(AdminPaymentsService);
  private readonly translate = inject(TranslateService);

  @Input({ required: true }) paymentId!: number;
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  detail = signal<PaymentDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  actionError = signal<string | null>(null);
  notice = signal<string | null>(null);

  refundOpen = signal(false);
  refundAmount = 0;
  refundReason = '';
  refundMethod: RefundMethod = 'manual';

  /** Refund being confirmed or failed (manual refunds). */
  resolving = signal<{ refund: RefundRow; action: 'complete' | 'fail' } | null>(null);
  resolveText = '';

  ngOnChanges(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.payments.detail(this.paymentId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
        this.refundAmount = d.refundable_amount;
        this.refundMethod = d.provider_refunds_supported ? 'provider' : 'manual';
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.loadFailed'));
      },
    });
  }

  recheck(): void {
    this.run(this.payments.recheck(this.paymentId), 'admin.payments.rechecked');
  }

  submitRefund(): void {
    const d = this.detail();
    if (!d) return;
    if (!this.refundReason.trim()) { this.actionError.set(this.translate.instant('admin.payments.reasonRequired')); return; }
    const amount = Math.floor(Number(this.refundAmount));
    if (!(amount >= 1 && amount <= d.refundable_amount)) {
      this.actionError.set(this.translate.instant('admin.payments.amountRange', { max: d.refundable_amount }));
      return;
    }
    this.run(this.payments.requestRefund(this.paymentId, { amount, reason: this.refundReason.trim(), method: this.refundMethod }),
      'admin.payments.refundRequested', () => { this.refundOpen.set(false); this.refundReason = ''; });
  }

  startResolve(refund: RefundRow, action: 'complete' | 'fail'): void {
    this.resolveText = '';
    this.actionError.set(null);
    this.resolving.set({ refund, action });
  }

  confirmResolve(): void {
    const r = this.resolving();
    if (!r) return;
    const text = this.resolveText.trim();
    if (!text) {
      this.actionError.set(this.translate.instant(r.action === 'complete' ? 'admin.payments.referenceRequired' : 'admin.payments.reasonRequired'));
      return;
    }
    const req = r.action === 'complete'
      ? this.payments.completeRefund(r.refund.id, text)
      : this.payments.failRefund(r.refund.id, text);
    this.run(req, r.action === 'complete' ? 'admin.payments.refundCompleted' : 'admin.payments.refundFailed',
      () => this.resolving.set(null));
  }

  private run(req: import('rxjs').Observable<unknown>, noticeKey: string, after?: () => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        after?.();
        this.notice.set(this.translate.instant(noticeKey));
        this.load();
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.actionError.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.actionFailed'));
      },
    });
  }
}
