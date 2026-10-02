import { Component, Input, Output, EventEmitter, signal, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, takeUntil } from 'rxjs';
import { PaymentService } from '../../../core/services/payment.service';
import { ServicePurchase } from '../../models/marketplace.interface';
import { ViewingAccessComponent } from '../viewing-access/viewing-access.component';

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, ViewingAccessComponent],
  templateUrl: './payment-modal.component.html',
  styleUrls: ['./payment-modal.component.scss']
})
export class PaymentModalComponent implements OnDestroy {
  @Input() movie: any;
  /** Non-movie purchase (marketplace fees). When set, `movie` is ignored. */
  @Input() service: ServicePurchase | null = null;
  @Output() paid   = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly paymentService = inject(PaymentService);
  private readonly translate = inject(TranslateService);
  private readonly destroy$ = new Subject<void>();

  phoneNumber     = signal('');
  loading         = signal(false);
  loadingMessage  = signal('paymentModal.processing'); // translation key
  success         = signal(false);
  error           = signal('');
  errorKey        = signal('');       // translated error when there is no backend message
  chargedAmount   = signal<number | null>(null);

  onPhoneInput(e: Event) {
    // Allow only digits, spaces, +, hyphens
    const raw = (e.target as HTMLInputElement).value;
    this.phoneNumber.set(raw);
    this.error.set('');
    this.errorKey.set('');
  }

  /** Normalise and validate a Rwandan MoMo number.
   *  Accepts: 07XXXXXXXX | 7XXXXXXXX | +2507XXXXXXXX | 2507XXXXXXXX
   *  Valid prefixes: 072 073 078 079
   *  Returns the normalised 10-digit local number or null if invalid. */
  private normaliseRwandaPhone(input: string): string | null {
    let n = input.replace(/[\s\-\(\)]/g, '');
    if (n.startsWith('+250')) n = n.slice(4);
    else if (n.startsWith('250')) n = n.slice(3);
    if (n.startsWith('0')) n = n.slice(1);

    if (!/^\d{9}$/.test(n)) return null;
    const prefix = n.slice(0, 2);
    if (!['72', '73', '78', '79'].includes(prefix)) return null;
    return '0' + n; // e.g. 0782345678
  }

  pay() {
    const raw = this.phoneNumber().trim();
    if (!raw) {
      this.showErrorKey('paymentModal.errors.phoneRequired');
      return;
    }

    const normalised = this.normaliseRwandaPhone(raw);
    if (!normalised) {
      this.showErrorKey('paymentModal.errors.invalidPhone');
      return;
    }

    this.loading.set(true);
    this.loadingMessage.set('paymentModal.processing');
    this.error.set('');
    this.errorKey.set('');

    const start: Observable<{ deposit_id: string; amount: number }> = this.service
      ? this.service.initiate(normalised)
      : this.paymentService.initiate({ movie_id: this.movie.id, phone_number: normalised });

    start.subscribe({
      next: (res) => {
        this.chargedAmount.set(res.amount ?? null);
        this.loadingMessage.set('paymentModal.approveOnPhone');
        this.pollStatus(res.deposit_id);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err?.status === 503) {
          // Marketplace fees aren't configured in production yet.
          this.errorKey.set('marketplace.purchase.unavailable');
          return;
        }
        // Backend errors are { error } (e.g. 402 already purchased, 409 payment pending).
        this.error.set(
          err?.error?.error ?? err?.error?.message ?? err?.error?.detail ?? this.translate.instant('paymentModal.errors.failed')
        );
      }
    });
  }

  private pollStatus(depositId: string) {
    this.paymentService.pollUntilSettled(depositId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        if (res.status === 'Completed') {
          if (!this.service) this.paymentService.savePurchase(this.movie.id);
          this.loading.set(false);
          this.success.set(true);
          setTimeout(() => this.paid.emit(), 1800);
        } else if (res.status === 'Failed') {
          this.loading.set(false);
          this.showErrorKey('paymentModal.errors.declined');
        }
      },
      error: () => {
        this.loading.set(false);
        this.showErrorKey('paymentModal.errors.verifyFailed');
      },
      complete: () => {
        if (this.loading()) {
          this.loading.set(false);
          this.showErrorKey('paymentModal.errors.timedOut');
        }
      }
    });
  }

  /** Shows a translated local error (backend messages go through `error`). */
  private showErrorKey(key: string) {
    this.error.set('');
    this.errorKey.set(key);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
