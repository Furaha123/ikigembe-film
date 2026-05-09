import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, UserProfile, NotificationPreferences } from '../../core/services/auth.service';
import { PaymentService, PaymentHistoryItem } from '../../core/services/payment.service';
import { HeaderComponent } from '../../core/components/header/header.component';

interface ContractClause { title: string; body: string; }

const PRODUCER_CONTRACT = {
  contractId:    'IKG-PROD-2024-0042',
  status:        'Active',
  effectiveDate: '2024-01-15',
  renewalDate:   '2025-01-14',
  revenueSplit:  { producer: 70, platform: 30 },
  clauses: [
    {
      title: '1. Content Ownership',
      body: `The Producer retains full intellectual property rights to all submitted content. Ikigembe Entertainment Ltd is granted a non-exclusive, worldwide, royalty-bearing licence to host, stream, and distribute the content for the duration of this agreement. The Producer warrants that all submitted content is original and does not infringe any third-party rights.`,
    },
    {
      title: '2. Revenue Share',
      body: `Net streaming revenue is distributed as follows: seventy percent (70%) to the Producer and thirty percent (30%) to Ikigembe Entertainment Ltd as a platform service fee. Payments are processed on the 15th business day following the close of each calendar month.`,
    },
    {
      title: '3. Content Standards',
      body: `All content must comply with the Ikigembe Content Standards Policy. The platform reserves the right to remove content that violates these standards after written notice to the Producer, except in cases of clear and serious violation where immediate removal may occur.`,
    },
    {
      title: '4. Payment Terms',
      body: `Earnings are disbursed monthly via Mobile Money (MTN/Airtel) or bank transfer to the account on file. A minimum payout threshold of RWF 10,000 applies; balances below this threshold roll over to the following month.`,
    },
    {
      title: '5. Termination',
      body: `Either party may terminate this agreement with thirty (30) days written notice. Outstanding revenue owed at the time of termination will be paid within forty-five (45) days of the effective termination date.`,
    },
  ] as ContractClause[],
};

@Component({
  selector: 'app-profile',
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private readonly authService    = inject(AuthService);
  private readonly paymentService = inject(PaymentService);
  private readonly fb             = inject(FormBuilder);

  readonly userRole = this.authService.userRole;

  profile = signal<UserProfile | null>(null);
  notifications = signal<NotificationPreferences | null>(null);
  isLoadingProfile = signal(true);
  isLoadingNotifs  = signal(true);

  payments        = signal<PaymentHistoryItem[]>([]);
  isLoadingPayments = signal(true);

  isEditingProfile = signal(false);
  isSavingProfile  = signal(false);
  profileSuccess   = signal(false);
  profileError     = signal<string | null>(null);

  profileEditForm = this.fb.group({
    first_name:   ['', Validators.required],
    last_name:    ['', Validators.required],
    phone_number: [''],
  });

  isSavingNotifs = signal(false);
  notifSuccess = signal(false);
  notifError = signal<string | null>(null);

  isSavingPassword = signal(false);
  passwordSuccess = signal(false);
  passwordErrors = signal<{ current?: string; new?: string; confirm?: string; general?: string }>({});

  passwordForm = this.fb.group({
    current_password: ['', Validators.required],
    new_password:     ['', [Validators.required, Validators.minLength(8)]],
    confirm_password: ['', Validators.required],
  });

  contractDownloadMsg = signal('');

  get producerContract() {
    const p = this.profile();
    return {
      ...PRODUCER_CONTRACT,
      producerName: p ? `${p.first_name} ${p.last_name}`.trim() : 'Producer',
    };
  }

  downloadContract(): void {
    this.contractDownloadMsg.set('Opening print dialog — choose "Save as PDF" to download.');
    window.print();
    setTimeout(() => this.contractDownloadMsg.set(''), 4000);
  }

  notifForm = this.fb.group({
    notify_new_trailers: [false],
    notify_new_movies:   [false],
    notify_promotions:   [false],
  });

  ngOnInit() {
    this.authService.getMe().subscribe({
      next: (data) => { this.profile.set(data); this.isLoadingProfile.set(false); },
      error: () => this.isLoadingProfile.set(false),
    });

    this.paymentService.getHistory().subscribe({
      next: (res) => { this.payments.set(res.results); this.isLoadingPayments.set(false); },
      error: ()    => this.isLoadingPayments.set(false),
    });

    this.authService.getNotifications().subscribe({
      next: (data) => {
        this.notifications.set(data);
        this.notifForm.patchValue(data as any);
        this.isLoadingNotifs.set(false);
      },
      error: () => this.isLoadingNotifs.set(false),
    });
  }

  openProfileEdit(): void {
    const p = this.profile();
    if (!p) return;
    this.profileEditForm.patchValue({
      first_name:   p.first_name,
      last_name:    p.last_name,
      phone_number: p.phone_number ?? '',
    });
    this.profileError.set(null);
    this.profileSuccess.set(false);
    this.isEditingProfile.set(true);
  }

  cancelProfileEdit(): void { this.isEditingProfile.set(false); }

  saveProfile(): void {
    if (this.profileEditForm.invalid || this.isSavingProfile()) return;
    this.isSavingProfile.set(true);
    this.profileError.set(null);
    const val = this.profileEditForm.getRawValue();
    this.authService.updateProfile({
      first_name:   val.first_name!,
      last_name:    val.last_name!,
      phone_number: val.phone_number ?? '',
    }).subscribe({
      next: (updated) => {
        this.profile.set(updated);
        this.isSavingProfile.set(false);
        this.profileSuccess.set(true);
        this.isEditingProfile.set(false);
        setTimeout(() => this.profileSuccess.set(false), 3000);
      },
      error: (err) => {
        this.isSavingProfile.set(false);
        const msg = err?.error?.detail ?? err?.error?.first_name?.[0] ?? err?.error?.last_name?.[0] ?? 'Update failed.';
        this.profileError.set(msg);
      },
    });
  }

  saveNotifications() {
    this.isSavingNotifs.set(true);
    this.notifSuccess.set(false);
    this.notifError.set(null);
    this.authService.updateNotifications(this.notifForm.value as Partial<NotificationPreferences>).subscribe({
      next: () => {
        this.isSavingNotifs.set(false);
        this.notifSuccess.set(true);
        setTimeout(() => this.notifSuccess.set(false), 3000);
      },
      error: () => {
        this.isSavingNotifs.set(false);
        this.notifError.set('Failed to save preferences. Please try again.');
      },
    });
  }

  savePassword() {
    if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); return; }

    const { current_password, new_password, confirm_password } = this.passwordForm.value;
    if (new_password !== confirm_password) {
      this.passwordErrors.set({ confirm: 'Passwords do not match.' } as any);
      return;
    }

    this.isSavingPassword.set(true);
    this.passwordSuccess.set(false);
    this.passwordErrors.set({});

    this.authService.changePassword(current_password!, new_password!).subscribe({
      next: () => {
        this.isSavingPassword.set(false);
        this.passwordSuccess.set(true);
        this.passwordForm.reset();
        setTimeout(() => this.passwordSuccess.set(false), 4000);
      },
      error: (err) => {
        this.isSavingPassword.set(false);
        const body = err?.error ?? {};
        const errors: { current?: string; new?: string; general?: string } = {};
        if (body.current_password) errors.current = Array.isArray(body.current_password) ? body.current_password[0] : body.current_password;
        if (body.new_password)     errors.new     = Array.isArray(body.new_password) ? body.new_password[0] : body.new_password;
        if (!Object.keys(errors).length) errors.general = body.detail ?? body.error ?? 'Something went wrong.';
        this.passwordErrors.set(errors);
      },
    });
  }

  paymentStatusClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'completed') return 'status-ok';
    if (s === 'failed')    return 'status-fail';
    return 'status-pending';
  }

  getInitials(p: UserProfile): string {
    const name = `${p.first_name} ${p.last_name}`.trim();
    if (!name) return p.email.slice(0, 2).toUpperCase();
    const parts = name.split(' ').filter(Boolean);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
}
