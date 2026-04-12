import { Component, Input, Output, EventEmitter, signal, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { interval, switchMap, takeWhile, take, takeUntil } from 'rxjs';
import { PaymentService } from '../../../core/services/payment.service';

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-modal.component.html',
  styleUrls: ['./payment-modal.component.scss']
})
export class PaymentModalComponent implements OnDestroy {
  @Input() movie: any;
  @Output() paid   = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly paymentService = inject(PaymentService);
  private readonly destroy$ = new Subject<void>();

  phoneNumber     = signal('');
  loading         = signal(false);
  loadingMessage  = signal('Processing...');
  success         = signal(false);
  error           = signal('');

  onPhoneInput(e: Event) {
    // Allow only digits, spaces, +, hyphens
    const raw = (e.target as HTMLInputElement).value;
    this.phoneNumber.set(raw);
    this.error.set('');
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
      this.error.set('Please enter your phone number.');
      return;
    }

    const normalised = this.normaliseRwandaPhone(raw);
    if (!normalised) {
      this.error.set('Enter a valid Rwandan number starting with 072, 073, 078 or 079.');
      return;
    }

    this.loading.set(true);
    this.loadingMessage.set('Processing...');
    this.error.set('');

    this.paymentService.initiate({
      movie_id:     this.movie.id,
      phone_number: normalised,
    }).subscribe({
      next: (res) => {
        this.loadingMessage.set('Check your phone to approve the payment...');
        this.pollStatus(res.deposit_id);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.message ?? err?.error?.detail ?? 'Payment failed. Please try again.'
        );
      }
    });
  }

  private pollStatus(depositId: string) {
    interval(3000).pipe(
      switchMap(() => this.paymentService.checkStatus(depositId)),
      takeWhile(res => res.status === 'Pending', true),
      take(20),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        if (res.status === 'Completed') {
          this.paymentService.savePurchase(this.movie.id);
          this.loading.set(false);
          this.success.set(true);
          setTimeout(() => this.paid.emit(), 1800);
        } else if (res.status === 'Failed') {
          this.loading.set(false);
          this.error.set('Payment was declined. Please try again.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not verify payment. Please contact support.');
      },
      complete: () => {
        if (this.loading()) {
          this.loading.set(false);
          this.error.set('Payment confirmation timed out. If you were charged, please contact support.');
        }
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
