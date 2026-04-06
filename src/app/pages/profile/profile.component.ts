import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, UserProfile, NotificationPreferences } from '../../core/services/auth.service';
import { PaymentService, PaymentHistoryItem } from '../../core/services/payment.service';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private readonly authService    = inject(AuthService);
  private readonly paymentService = inject(PaymentService);
  private readonly fb             = inject(FormBuilder);

  profile = signal<UserProfile | null>(null);
  notifications = signal<NotificationPreferences | null>(null);
  isLoadingProfile = signal(true);
  isLoadingNotifs  = signal(true);

  payments        = signal<PaymentHistoryItem[]>([]);
  isLoadingPayments = signal(true);

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

  notifForm = this.fb.group({
    email_notifications:   [false],
    sms_notifications:     [false],
    push_notifications:    [false],
    new_movie_alerts:      [false],
    payment_notifications: [false],
    promotional_emails:    [false],
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
