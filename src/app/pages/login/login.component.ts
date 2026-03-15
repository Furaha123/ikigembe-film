import { Component, inject, signal, PLATFORM_ID, AfterViewInit, ElementRef, viewChild } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

declare const google: {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
};

const GOOGLE_CLIENT_ID = '315063576340-7m07t5n12jerr8qjhalushs82h2c5rjl.apps.googleusercontent.com';

interface LoginErrors {
  email?: string[];
  password?: string[];
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  googleBtnContainer = viewChild<ElementRef>('googleBtn');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  isLoading = signal(false);
  googleLoading = signal(false);
  serverErrors = signal<LoginErrors>({});
  showPassword = signal(false);

  get email() { return this.form.get('email'); }
  get password() { return this.form.get('password'); }

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
      text: 'signin_with',
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

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.serverErrors.set({});

    const { email, password } = this.form.value as { email: string; password: string };

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/browse']);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 400 && err.error) {
          this.serverErrors.set(err.error);
        }
      }
    });
  }
}
