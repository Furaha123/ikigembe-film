import {
  Component, inject, signal, PLATFORM_ID,
  AfterViewInit, OnInit, OnDestroy, ElementRef, viewChild,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService, RegisterErrors } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { Subscription } from 'rxjs';

declare const google: {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
};

const GOOGLE_CLIENT_ID = '315063576340-7m07t5n12jerr8qjhalushs82h2c5rjl.apps.googleusercontent.com';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly fb         = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly platformId  = inject(PLATFORM_ID);
  private readonly seo         = inject(SeoService);

  private routeSub?:    Subscription;
  private cooldownTimer?: ReturnType<typeof setInterval>;

  googleBtnContainer = viewChild<ElementRef>('googleBtn');

  // ── Tab ──────────────────────────────────────────────────
  tab = signal<'viewer' | 'producer'>('viewer');

  // ── Viewer form ──────────────────────────────────────────
  form = this.fb.group(
    {
      first_name:       ['', [Validators.required, Validators.minLength(2)]],
      last_name:        ['', [Validators.required, Validators.minLength(2)]],
      email:            ['', [Validators.required, Validators.email]],
      password:         ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', Validators.required],
    },
    { validators: RegisterComponent.passwordMatchValidator }
  );

  isLoading    = signal(false);
  googleLoading = signal(false);
  serverErrors = signal<RegisterErrors>({});
  showPassword = signal(false);
  showConfirm  = signal(false);

  get first_name()        { return this.form.get('first_name'); }
  get last_name()         { return this.form.get('last_name'); }
  get email()             { return this.form.get('email'); }
  get password()          { return this.form.get('password'); }
  get password_confirm()  { return this.form.get('password_confirm'); }

  // ── Producer form ────────────────────────────────────────
  producerForm = this.fb.group(
    {
      full_name:        ['', [Validators.required, Validators.minLength(2)]],
      phone_number:     ['', [Validators.required, Validators.pattern(/^\+?[0-9\s\-]{7,15}$/)]],
      studio_name:      [''],
      email:            ['', [Validators.required, Validators.email]],
      password:         ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', Validators.required],
    },
    { validators: RegisterComponent.passwordMatchValidator }
  );

  pLoading    = signal(false);
  pErrors     = signal<RegisterErrors>({});
  showPasswordP = signal(false);
  showConfirmP  = signal(false);

  get pFullName()        { return this.producerForm.get('full_name'); }
  get pPhone()           { return this.producerForm.get('phone_number'); }
  get pStudio()          { return this.producerForm.get('studio_name'); }
  get pEmail()           { return this.producerForm.get('email'); }
  get pPassword()        { return this.producerForm.get('password'); }
  get pPasswordConfirm() { return this.producerForm.get('password_confirm'); }

  // ── Shared post-registration state ───────────────────────
  registered     = signal(false);
  registeredEmail = signal('');
  isResending    = signal(false);
  resendSuccess  = signal(false);
  resendError    = signal<string | null>(null);
  resendCooldown = signal(0);

  // ── Lifecycle ────────────────────────────────────────────
  ngOnInit(): void {
    this.seo.set({ title: 'Create Account', noIndex: true });
    this.routeSub = this.route.queryParamMap.subscribe(params => {
      if (params.get('role') === 'producer') {
        this.tab.set('producer');
      }
    });
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.tryInitGoogleButton(0);
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    clearInterval(this.cooldownTimer);
  }

  // ── Tab switching ────────────────────────────────────────
  switchTab(t: 'viewer' | 'producer'): void {
    if (this.tab() === t) return;
    this.tab.set(t);
    this.registered.set(false);
    this.registeredEmail.set('');
    this.serverErrors.set({});
    this.pErrors.set({});
    this.form.reset();
    this.producerForm.reset();
  }

  // ── Viewer submit ────────────────────────────────────────
  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.isLoading.set(true);
    this.serverErrors.set({});

    const payload = this.form.value as {
      first_name: string; last_name: string;
      email: string; password: string; password_confirm: string;
    };

    this.authService.register(payload).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.registeredEmail.set(payload.email);
        this.registered.set(true);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 400 && err.error) this.serverErrors.set(err.error);
      }
    });
  }

  // ── Producer submit ──────────────────────────────────────
  onSubmitProducer(): void {
    if (this.producerForm.invalid) { this.producerForm.markAllAsTouched(); return; }

    this.pLoading.set(true);
    this.pErrors.set({});

    const val = this.producerForm.value as {
      full_name: string; phone_number: string; studio_name: string;
      email: string; password: string; password_confirm: string;
    };

    this.authService.registerProducer({
      full_name:        val.full_name,
      phone_number:     val.phone_number,
      studio_name:      val.studio_name || undefined,
      email:            val.email,
      password:         val.password,
      password_confirm: val.password_confirm,
    }).subscribe({
      next: () => {
        this.pLoading.set(false);
        if (this.authService.isLoggedIn()) {
          this.router.navigate(['/producer/onboarding']);
        } else {
          this.registeredEmail.set(val.email);
          this.registered.set(true);
        }
      },
      error: (err) => {
        this.pLoading.set(false);
        if (err.status === 400 && err.error) {
          this.pErrors.set(err.error as RegisterErrors);
        } else {
          this.pErrors.set({ non_field_errors: ['Registration failed. Please try again.'] });
        }
      },
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
