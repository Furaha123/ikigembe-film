import { Component, inject, signal, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { RegisterErrors } from '../../core/models/auth.interface';

@Component({
  selector: 'app-register-producer',
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './register-producer.component.html',
  styleUrl: './register-producer.component.scss',
})
export class RegisterProducerComponent implements OnDestroy {
  private readonly fb         = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);

  private cooldownTimer?: ReturnType<typeof setInterval>;

  form = this.fb.group(
    {
      full_name:        ['', [Validators.required, Validators.minLength(2)]],
      phone_number:     ['', [Validators.required, Validators.pattern(/^\+?[0-9\s\-]{7,15}$/)]],
      studio_name:      [''],
      email:            ['', [Validators.required, Validators.email]],
      password:         ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', Validators.required],
    },
    { validators: RegisterProducerComponent.passwordMatchValidator }
  );

  isLoading    = signal(false);
  serverErrors = signal<RegisterErrors>({});
  showPassword = signal(false);
  showConfirm  = signal(false);
  registered   = signal(false);

  isResending    = signal(false);
  resendSuccess  = signal(false);
  resendError    = signal<string | null>(null);
  resendCooldown = signal(0);

  get full_name()        { return this.form.get('full_name'); }
  get phone_number()     { return this.form.get('phone_number'); }
  get studio_name()      { return this.form.get('studio_name'); }
  get email()            { return this.form.get('email'); }
  get password()         { return this.form.get('password'); }
  get password_confirm() { return this.form.get('password_confirm'); }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.serverErrors.set({});

    const val = this.form.value as {
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
        this.isLoading.set(false);
        // If tokens were stored, go straight to onboarding; otherwise show email-verification state
        if (this.authService.isLoggedIn()) {
          this.router.navigate(['/producer/onboarding']);
        } else {
          this.registered.set(true);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 400 && err.error) {
          this.serverErrors.set(err.error as RegisterErrors);
        } else {
          this.serverErrors.set({ non_field_errors: ['Registration failed. Please try again.'] });
        }
      },
    });
  }

  resendEmail(): void {
    const emailVal = this.email?.value;
    if (!emailVal || this.isResending() || this.resendCooldown() > 0) return;

    this.isResending.set(true);
    this.resendSuccess.set(false);
    this.resendError.set(null);

    this.authService.resendVerification(emailVal).subscribe({
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

  ngOnDestroy(): void {
    clearInterval(this.cooldownTimer);
  }

  static passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const p = control.get('password')?.value;
    const c = control.get('password_confirm')?.value;
    return p && c && p !== c ? { passwordMismatch: true } : null;
  }
}
