import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.scss'
})
export class AdminLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  form = this.fb.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
  });

  isLoading = signal(false);
  errorMessage = signal('');
  showPassword = signal(false);

  get identifier() { return this.form.get('identifier'); }
  get password() { return this.form.get('password'); }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { identifier, password } = this.form.value as { identifier: string; password: string };

    this.authService.login(identifier, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        if (this.authService.isAdmin()) {
          this.router.navigate(['/admin/dashboard']);
        } else {
          this.authService.logout();
          this.errorMessage.set('You do not have admin access.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err?.error?.detail ?? err?.error?.non_field_errors?.[0] ?? 'Invalid credentials.';
        this.errorMessage.set(msg);
      }
    });
  }
}
