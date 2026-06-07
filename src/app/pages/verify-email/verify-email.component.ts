import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, FormsModule],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss'
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  private cooldownTimer?: ReturnType<typeof setInterval>;

  status       = signal<'loading' | 'success' | 'error' | 'invalid'>('loading');
  errorMessage = signal('');

  resendEmail    = signal('');
  isResending    = signal(false);
  resendSuccess  = signal(false);
  resendError    = signal<string | null>(null);
  resendCooldown = signal(0);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.status.set('invalid');
      return;
    }

    this.authService.verifyEmail(token).subscribe({
      next: () => this.status.set('success'),
      error: (err) => {
        this.status.set('error');
        const detail =
          err?.error?.detail ??
          err?.error?.token?.[0] ??
          err?.error?.non_field_errors?.[0];
        this.errorMessage.set(detail ?? 'Verification failed. The link may have expired.');
      }
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.cooldownTimer);
  }

  requestNewLink(): void {
    const email = this.resendEmail().trim();
    if (!email || this.isResending() || this.resendCooldown() > 0) return;

    this.isResending.set(true);
    this.resendSuccess.set(false);
    this.resendError.set(null);

    this.authService.resendVerification(email).subscribe({
      next: () => {
        this.isResending.set(false);
        this.resendSuccess.set(true);
        this.startCooldown(60);
      },
      error: (err) => {
        this.isResending.set(false);
        const detail = err?.error?.detail ?? err?.error?.email?.[0];
        this.resendError.set(detail ?? 'Failed to send. Please check the email address and try again.');
      },
    });
  }

  private startCooldown(seconds: number): void {
    this.resendCooldown.set(seconds);
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(next);
      if (next <= 0) {
        clearInterval(this.cooldownTimer);
        this.resendSuccess.set(false);
      }
    }, 1000);
  }
}
