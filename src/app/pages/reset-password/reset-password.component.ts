import { Component, inject, signal, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface ResetErrors {
  non_field_errors?: string[];
  new_password?: string[];
  token?: string[];
  detail?: string;
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  token = signal('');
  isLoading = signal(false);
  success = signal(false);
  showPassword = signal(false);
  showConfirm = signal(false);
  serverErrors = signal<ResetErrors>({});

  form = this.fb.group({
    new_password: ['', [Validators.required, Validators.minLength(8)]],
    confirm_password: ['', Validators.required]
  }, { validators: ResetPasswordComponent.passwordMatchValidator });

  private static passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const pw = control.get('new_password')?.value;
    const confirm = control.get('confirm_password')?.value;
    return pw && confirm && pw !== confirm ? { passwordMismatch: true } : null;
  }

  get newPassword() { return this.form.get('new_password'); }
  get confirmPassword() { return this.form.get('confirm_password'); }

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!token) {
      this.router.navigate(['/forgot-password'], { replaceUrl: true });
      return;
    }
    this.token.set(token);
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.serverErrors.set({});

    const { new_password, confirm_password } = this.form.value as { new_password: string; confirm_password: string };

    this.authService.resetPassword(this.token(), new_password, confirm_password).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.success.set(true);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 400 && err.error) {
          this.serverErrors.set(err.error);
        } else {
          this.serverErrors.set({ detail: 'Something went wrong. Please try again.' });
        }
      }
    });
  }
}
