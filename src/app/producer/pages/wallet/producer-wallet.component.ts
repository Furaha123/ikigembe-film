import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProducerService, ProducerWallet } from '../../services/producer.service';

@Component({
  selector: 'app-producer-wallet',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './producer-wallet.component.html',
  styleUrl: './producer-wallet.component.scss'
})
export class ProducerWalletComponent implements OnInit {
  private readonly producerService = inject(ProducerService);
  private readonly fb = inject(FormBuilder);

  wallet = signal<ProducerWallet | null>(null);
  isLoading = signal(true);
  isSaving = signal(false);
  successMsg = signal('');
  apiError = signal('');

  form = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    payment_method: ['Bank' as 'Bank' | 'MoMo', Validators.required],
    bank_name: [''],
    account_number: [''],
    account_holder_name: [''],
    momo_number: [''],
    momo_provider: [''],
  });

  paymentMethod = signal<'Bank' | 'MoMo'>('Bank');
  isBank = computed(() => this.paymentMethod() === 'Bank');

  ngOnInit() {
    this.producerService.getWallet().subscribe({
      next: (data) => { this.wallet.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  setMethod(method: 'Bank' | 'MoMo') {
    this.paymentMethod.set(method);
    this.form.get('payment_method')!.setValue(method);
  }

  submit() {
    if (this.form.invalid || this.isSaving()) return;
    this.isSaving.set(true);
    this.successMsg.set('');
    this.apiError.set('');

    const val = this.form.getRawValue();
    const payload: any = {
      amount: val.amount,
      payment_method: val.payment_method,
    };

    if (val.payment_method === 'Bank') {
      payload.bank_name = val.bank_name;
      payload.account_number = val.account_number;
      payload.account_holder_name = val.account_holder_name;
    } else {
      payload.momo_number = val.momo_number;
      payload.momo_provider = val.momo_provider;
    }

    this.producerService.requestWithdrawal(payload).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.successMsg.set('Withdrawal request submitted! It will be reviewed within 1–2 business days.');
        this.paymentMethod.set('Bank');
        this.form.reset({ payment_method: 'Bank' });
        // refresh wallet balance
        this.producerService.getWallet().subscribe({ next: (d) => this.wallet.set(d) });
      },
      error: (err) => {
        this.isSaving.set(false);
        const data = err.error;
        const msg = data?.detail ?? data?.non_field_errors?.[0] ?? data?.amount?.[0] ?? 'Request failed. Please try again.';
        this.apiError.set(msg);
      },
    });
  }

  formatCurrency(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }
}
