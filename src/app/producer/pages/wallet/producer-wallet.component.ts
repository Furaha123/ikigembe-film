import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  ProducerService, ProducerWallet, ProducerPayouts, PayoutAccount, PayoutMethod,
} from '../../services/producer.service';
import { apiErrorMessage, firstFieldError } from '../../../shared/utils/api-error';
import { LanguageService } from '../../../core/services/language.service';

/** Countries offered first; any ISO code the API accepts can be saved. */
const COUNTRIES = [
  'RW', 'UG', 'KE', 'TZ', 'BI', 'CD', 'ET', 'ZM', 'MW', 'ZA', 'NG', 'GH', 'SN', 'CI', 'CM',
  'EG', 'MA', 'AE', 'US', 'CA', 'GB', 'IE', 'FR', 'BE', 'NL', 'DE', 'CH', 'SE', 'NO', 'DK',
  'IT', 'ES', 'PT', 'PL', 'AU', 'NZ', 'IN', 'CN', 'JP',
];

/**
 * Producers are paid once a month (apps/finance/payouts.py on the API): on the payout day the
 * previous month is closed and its payout prepared; an admin approves and sends it. Here the
 * producer sees their balance, the schedule, where they are paid, and their payouts.
 */
@Component({
  selector: 'app-producer-wallet',
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule],
  templateUrl: './producer-wallet.component.html',
  styleUrl: './producer-wallet.component.scss'
})
export class ProducerWalletComponent implements OnInit {
  private readonly producerService = inject(ProducerService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  wallet = signal<ProducerWallet | null>(null);
  payouts = signal<ProducerPayouts | null>(null);
  isLoading = signal(true);
  loadError = signal('');
  isSaving = signal(false);
  editing = signal(false);
  successMsg = signal('');
  apiError = signal('');

  method = signal<PayoutMethod>('mobile_money');
  isBank = computed(() => this.method() === 'bank');
  account = computed(() => this.payouts()?.account ?? null);
  countries = this.countryOptions();

  form = this.fb.nonNullable.group({
    account_holder_name: ['', Validators.required],
    country: ['RW', Validators.required],
    mobile_number: [''],
    mobile_network: [''],
    bank_name: [''],
    account_number: [''],
    swift_code: [''],
  });
  country = signal('RW');
  needsSwift = computed(() => this.isBank() && this.country() !== 'RW');

  ngOnInit() {
    this.form.controls.country.valueChanges.subscribe(c => this.country.set(c));
    this.load();
  }

  load() {
    this.producerService.getWallet().subscribe({
      next: (data) => this.wallet.set(data),
      error: () => { /* the cards stay empty */ },
    });
    this.producerService.getPayouts().subscribe({
      next: (data) => {
        this.payouts.set(data);
        this.isLoading.set(false);
        if (data.account) this.fill(data.account); else this.editing.set(true);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.loadError.set(apiErrorMessage(err) ?? 'wallet.payouts.loadFailed');
      },
    });
  }

  setMethod(method: PayoutMethod) {
    this.method.set(method);
  }

  edit() {
    this.successMsg.set('');
    this.editing.set(true);
  }

  cancelEdit() {
    const account = this.account();
    if (!account) return;
    this.fill(account);
    this.apiError.set('');
    this.editing.set(false);
  }

  save() {
    if (this.isSaving()) return;
    const v = this.form.getRawValue();
    const missing = this.isBank()
      ? !v.bank_name.trim() || !v.account_number.trim() || (this.needsSwift() && !v.swift_code.trim())
      : !v.mobile_number.trim() || !v.mobile_network.trim();
    if (this.form.invalid || missing) {
      this.form.markAllAsTouched();
      this.apiError.set('wallet.payouts.form.incomplete');
      return;
    }
    this.isSaving.set(true);
    this.successMsg.set('');
    this.apiError.set('');
    const payload: PayoutAccount = { ...v, method: this.method() };
    this.producerService.savePayoutAccount(payload).subscribe({
      next: (account) => {
        this.isSaving.set(false);
        this.payouts.update(p => p ? { ...p, account } : p);
        this.fill(account);
        this.editing.set(false);
        this.successMsg.set('wallet.payouts.form.saved');
      },
      error: (err: unknown) => {
        this.isSaving.set(false);
        this.apiError.set(firstFieldError(err) ?? apiErrorMessage(err) ?? 'wallet.payouts.form.failed');
      },
    });
  }

  /** "MTN · +250788…456" / "Bank of Kigali · …6789" — enough to recognise it, not to copy it. */
  accountSummary(a: PayoutAccount): string {
    if (a.method === 'mobile_money') return `${a.mobile_network} · ${this.mask(a.mobile_number)}`;
    return `${a.bank_name} · ${this.mask(a.account_number)}`;
  }

  countryName(code: string): string {
    return this.countries.find(c => c.code === code)?.name ?? code;
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.dirty || c.touched);
  }

  formatCurrency(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  private mask(value: string): string {
    return value.length > 4 ? `…${value.slice(-4)}` : value;
  }

  private fill(a: PayoutAccount) {
    this.method.set(a.method);
    this.form.reset({
      account_holder_name: a.account_holder_name, country: a.country,
      mobile_number: a.mobile_number, mobile_network: a.mobile_network,
      bank_name: a.bank_name, account_number: a.account_number, swift_code: a.swift_code,
    });
    this.country.set(a.country);
  }

  private countryOptions(): { code: string; name: string }[] {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([this.language.currentLang(), 'en'], { type: 'region' });
    } catch { /* fall back to the codes */ }
    return COUNTRIES.map(code => ({ code, name: names?.of(code) ?? code }));
  }
}
