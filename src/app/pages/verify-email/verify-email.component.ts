import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, resendCooldownLabel } from '../../core/services/auth.service';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, FormsModule, TranslatePipe],
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
        this.errorMessage.set(detail ?? 'auth.verifyEmail.errorFallback');
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

    this.authService.requestVerificationEmail(email).subscribe(result => {
      this.isResending.set(false);
      this.resendSuccess.set(result.sent);
      if (!result.sent) this.resendError.set(result.message ?? 'auth.verifyEmail.resendFailed');
      if (result.cooldownSeconds > 0) this.startCooldown(result.cooldownSeconds);
    });
  }

  readonly cooldownLabel = resendCooldownLabel;

  private startCooldown(seconds: number): void {
    clearInterval(this.cooldownTimer);
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
