import { Component, inject, signal, PLATFORM_ID, AfterViewInit, OnInit, ElementRef, viewChild } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RETURN_URL_PARAM } from '../../shared/utils/safe-redirect';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { apiErrorMessage } from '../../shared/utils/api-error';

declare const google: {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
};

const GOOGLE_CLIENT_ID = '315063576340-dokh369lnriqdpermiha2iesqrm097dp.apps.googleusercontent.com';

interface LoginErrors {
  email?: string[];
  password?: string[];
  non_field_errors?: string[];
  detail?: string;
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, CommonModule, RouterLink, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements AfterViewInit, OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** Page the visitor was sent here from (validated by AuthService.postLoginUrl). */
  readonly returnUrl = this.route.snapshot.queryParamMap.get(RETURN_URL_PARAM);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly seo = inject(SeoService);
  private readonly translate = inject(TranslateService);

  googleBtnContainer = viewChild<ElementRef>('googleBtn');

  form = this.fb.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required]
  });

  isLoading = signal(false);
  googleLoading = signal(false);
  serverErrors = signal<LoginErrors>({});
  showPassword = signal(false);

  get identifier() { return this.form.get('identifier'); }
  get password() { return this.form.get('password'); }

  ngOnInit() {
    this.seo.setTranslated({ titleKey: 'auth.login.seoTitle', noIndex: true });
  }

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

  private navigateByRole() {
    this.router.navigateByUrl(this.authService.postLoginUrl(this.returnUrl), { replaceUrl: true });
  }

  private handleGoogleCredential(idToken: string) {
    this.googleLoading.set(true);
    this.serverErrors.set({});

    this.authService.loginWithGoogle(idToken).subscribe({
      next: () => {
        this.googleLoading.set(false);
        this.navigateByRole();
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

    const { identifier, password } = this.form.value as { identifier: string; password: string };

    this.authService.login(identifier, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.navigateByRole();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.serverErrors.set(err.status === 400 && err.error
          ? err.error
          : { detail: apiErrorMessage(err) ?? this.translate.instant('auth.login.failed') });
      }
    });
  }
}
