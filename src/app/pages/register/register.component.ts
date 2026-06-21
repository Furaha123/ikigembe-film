import {
  Component, inject, signal, PLATFORM_ID,
  AfterViewInit, OnInit, OnDestroy, ElementRef, viewChild,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, RegisterErrors } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';

declare const google: {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
};

const GOOGLE_CLIENT_ID = '315063576340-dokh369lnriqdpermiha2iesqrm097dp.apps.googleusercontent.com';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly fb          = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly platformId  = inject(PLATFORM_ID);
  private readonly seo         = inject(SeoService);

  private cooldownTimer?: ReturnType<typeof setInterval>;

  googleBtnContainer = viewChild<ElementRef>('googleBtn');

  // ── Viewer form ──────────────────────────────────────────
  form = this.fb.group(
    {
      first_name:       ['', [Validators.required, Validators.minLength(2)]],
      last_name:        ['', [Validators.required, Validators.minLength(2)]],
      email:            ['', [Validators.required, Validators.email]],
      phone_number:     ['', [Validators.pattern(/^\+?[0-9\s\-]{7,15}$/)]],
      password:         ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', Validators.required],
    },
    { validators: RegisterComponent.passwordMatchValidator }
  );

  isLoading     = signal(false);
  googleLoading = signal(false);
  serverErrors  = signal<RegisterErrors>({});
  showPassword  = signal(false);
  showConfirm   = signal(false);

  get first_name()       { return this.form.get('first_name'); }
  get last_name()        { return this.form.get('last_name'); }
  get email()            { return this.form.get('email'); }
  get phone_number()     { return this.form.get('phone_number'); }
  get password()         { return this.form.get('password'); }
  get password_confirm() { return this.form.get('password_confirm'); }

  // ── Post-registration state ───────────────────────────────
  registered     = signal(false);
  registeredEmail = signal('');
  isResending    = signal(false);
  resendSuccess  = signal(false);
  resendError    = signal<string | null>(null);
  resendCooldown = signal(0);

  // ── Lifecycle ────────────────────────────────────────────
  ngOnInit(): void {
    this.seo.set({ title: 'Create Account', noIndex: true });
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.tryInitGoogleButton(0);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.cooldownTimer);
  }

  // ── Submit ───────────────────────────────────────────────
  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.isLoading.set(true);
    this.serverErrors.set({});

    const val = this.form.value as {
      first_name: string; last_name: string;
      email: string; phone_number: string;
      password: string; password_confirm: string;
    };
    const payload = { ...val, phone_number: val.phone_number || undefined };

    this.authService.register(payload).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.registeredEmail.set(val.email);
        this.registered.set(true);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 400 && err.error) this.serverErrors.set(err.error);
      }
    });
  }

  // ── Resend verification ──────────────────────────────────
  resendEmail(): void {
    const email = this.registeredEmail();
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
        this.resendError.set(detail ?? 'Failed to resend. Please try again.');
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

  // ── Google ───────────────────────────────────────────────
  private tryInitGoogleButton(attempt: number) {
    const container = this.googleBtnContainer()?.nativeElement;
    const gsi = (globalThis as { google?: typeof google }).google;

    if (!gsi || !container) {
      if (attempt < 10) setTimeout(() => this.tryInitGoogleButton(attempt + 1), 300);
      return;
    }

    gsi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => this.handleGoogleCredential(response.credential),
    });

    gsi.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      width: container.offsetWidth || 340,
      text: 'signup_with',
      shape: 'rectangular',
    });
  }

  private handleGoogleCredential(idToken: string) {
    this.googleLoading.set(true);
    this.serverErrors.set({});

    this.authService.loginWithGoogle(idToken).subscribe({
      next: () => {
        this.googleLoading.set(false);
        this.router.navigate(['/browse']);
      },
      error: (err) => {
        this.googleLoading.set(false);
        if (err.status === 400 && err.error) this.serverErrors.set(err.error);
      }
    });
  }

  static passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm  = control.get('password_confirm')?.value;
    return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
  }
}
