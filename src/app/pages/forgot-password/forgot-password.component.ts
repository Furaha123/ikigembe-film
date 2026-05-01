import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  form = this.fb.group({
    identifier: ['', Validators.required]
  });

  isLoading = signal(false);
  sent = signal(false);
  serverError = signal('');

  get identifier() { return this.form.get('identifier'); }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.serverError.set('');

    const { identifier } = this.form.value as { identifier: string };

    this.authService.forgotPassword(identifier).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.sent.set(true);
      },
      error: () => {
        this.isLoading.set(false);
        this.serverError.set('Something went wrong. Please try again.');
      }
    });
  }
}
