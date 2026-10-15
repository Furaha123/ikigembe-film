import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService, resendCooldownLabel } from '../../core/services/auth.service';
import { apiErrorMessage, firstFieldError } from '../../shared/utils/api-error';
import { RETURN_URL_PARAM, safeReturnUrl } from '../../shared/utils/safe-redirect';

/**
 * Shown when the API answers 403 `email_unverified` (the account's email address changed and isn't
 * verified yet). The session stays open but restricted: the user can resend the link, fix the address,
 * check again after opening the link, or sign out.
 */
@Component({
  selector: 'app-email-verification-required',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './email-verification-required.component.html',
  styleUrls: ['./verify-email.component.scss'],
  styles: [`
    .verify-required p { margin: 0 0 0.75rem; }
    .verify-required .email { color: #fff; font-weight: 600; word-break: break-all; }
    .verify-required .actions { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.25rem; }
    .verify-required .link-btn {
      background: none; border: 0; color: #C5A253; cursor: pointer; font: inherit; text-decoration: underline; padding: 0.25rem;
    }
    .verify-required form { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; text-align: left; }
    .verify-required label { font-size: 0.85rem; color: rgba(255, 255, 255, 0.7); }
  `],
})
export class EmailVerificationRequiredComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  private cooldownTimer?: ReturnType<typeof setInterval>;

  readonly isResending = signal(false);
  readonly resendSuccess = signal(false);
  readonly resendError = signal<string | null>(null);
  readonly resendCooldown = signal(0);

  readonly editing = signal(false);
  readonly newEmail = signal('');
  readonly savingEmail = signal(false);
  readonly emailError = signal<string | null>(null);
  readonly emailChanged = signal(false);

  readonly checking = signal(false);
  readonly stillUnverified = signal(false);

  readonly cooldownLabel = resendCooldownLabel;

  ngOnInit(): void {
    // Know the current address and state (the stored email may be the old one).
    this.auth.refreshProfile().subscribe(() => {
      if (this.auth.isLoggedIn() && !this.auth.emailUnverified()) this.continue();
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.cooldownTimer);
  }

  resend(): void {
    const email = this.auth.userEmail();
    if (!email || this.isResending() || this.resendCooldown() > 0) return;
    this.isResending.set(true);
    this.resendSuccess.set(false);
    this.resendError.set(null);
    this.auth.requestVerificationEmail(email).subscribe(result => {
      this.isResending.set(false);
      this.resendSuccess.set(result.sent);
      if (!result.sent) this.resendError.set(result.message ?? 'auth.verifyEmail.resendFailed');
      if (result.cooldownSeconds > 0) this.startCooldown(result.cooldownSeconds);
    });
  }

  startEditing(): void {
    this.newEmail.set(this.auth.userEmail());
    this.emailError.set(null);
    this.editing.set(true);
  }

  saveEmail(): void {
    const email = this.newEmail().trim();
    if (!email || this.savingEmail()) return;
    this.savingEmail.set(true);
    this.emailError.set(null);
    this.auth.changeEmail(email).subscribe({
      next: () => {
        this.savingEmail.set(false);
        this.editing.set(false);
        this.emailChanged.set(true);
        this.resendSuccess.set(false);
      },
      error: (err: unknown) => {
        this.savingEmail.set(false);
        this.emailError.set(apiErrorMessage(err) ?? firstFieldError(err) ?? 'auth.verifyRequired.changeFailed');
      },
    });
  }

  /** After opening the link elsewhere: re-read the account and continue if it is verified now. */
  checkAgain(): void {
    if (this.checking()) return;
    this.checking.set(true);
    this.stillUnverified.set(false);
    this.auth.refreshProfile().subscribe(() => {
      this.checking.set(false);
      if (this.auth.emailUnverified()) this.stillUnverified.set(true);
      else this.continue();
    });
  }

  signOut(): void {
    this.auth.logout(() => void this.router.navigateByUrl('/login'));
  }

  private continue(): void {
    const back = safeReturnUrl(this.route.snapshot.queryParamMap.get(RETURN_URL_PARAM));
    void this.router.navigateByUrl(back ?? this.auth.homeUrl(), { replaceUrl: true });
  }

  private startCooldown(seconds: number): void {
    clearInterval(this.cooldownTimer);
    this.resendCooldown.set(seconds);
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(next);
      if (next <= 0) clearInterval(this.cooldownTimer);
    }, 1000);
  }
}
