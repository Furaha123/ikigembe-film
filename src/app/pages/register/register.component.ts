import { Component, inject, signal, PLATFORM_ID, AfterViewInit, ElementRef, viewChild } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, RegisterErrors } from '../../core/services/auth.service';

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
export class RegisterComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  googleBtnContainer = viewChild<ElementRef>('googleBtn');

  form = this.fb.group(
    {
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', Validators.required]
    },
    { validators: RegisterComponent.passwordMatchValidator }
  );

  isLoading = signal(false);
  googleLoading = signal(false);
  serverErrors = signal<RegisterErrors>({});
  showPassword = signal(false);
  showConfirm = signal(false);

  get first_name() { return this.form.get('first_name'); }
  get last_name() { return this.form.get('last_name'); }
  get email() { return this.form.get('email'); }
  get password() { return this.form.get('password'); }
  get password_confirm() { return this.form.get('password_confirm'); }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.tryInitGoogleButton(0);
    }
  }

  private tryInitGoogleButton(attempt: number) {
    const container = this.googleBtnContainer()?.nativeElement;
    const gsi = (globalThis as { google?: typeof google }).google;

    if (!gsi || !container) {
      if (attempt < 10) {
        setTimeout(() => this.tryInitGoogleButton(attempt + 1), 300);
      }
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
        if (err.status === 400 && err.error) {
          this.serverErrors.set(err.error);
        }
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.serverErrors.set({});

    const payload = this.form.value as {
      first_name: string; last_name: string;
      email: string; password: string; password_confirm: string;
    };

    this.authService.register(payload).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 400 && err.error) {
          this.serverErrors.set(err.error);
        }
      }
    });
  }

  static passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm = control.get('password_confirm')?.value;
    return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
  }
}
