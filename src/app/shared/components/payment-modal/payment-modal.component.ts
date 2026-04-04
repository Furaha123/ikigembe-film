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
    this.phoneNumber.set((e.target as HTMLInputElement).value);
    this.error.set('');
  }

  pay() {
    const phone = this.phoneNumber().trim();
    if (!phone) {
      this.error.set('Please enter your phone number.');
      return;
    }
    if (!/^\d{9,15}$/.test(phone.replaceAll(' ', ''))) {
      this.error.set('Enter a valid phone number (digits only).');
      return;
    }

    this.loading.set(true);
    this.loadingMessage.set('Processing...');
    this.error.set('');

    this.paymentService.initiate({
      movie_id:     this.movie.id,
      phone_number: phone
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
