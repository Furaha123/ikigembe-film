import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorReference } from '../../shared/utils/api-error';
import { ErrorReferenceComponent } from '../../shared/components/error-reference/error-reference.component';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, ErrorReferenceComponent],
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
  errorRef = signal<string | null>(null);

  get identifier() { return this.form.get('identifier'); }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.serverError.set('');
    this.errorRef.set(null);

    const { identifier } = this.form.value as { identifier: string };

    this.authService.forgotPassword(identifier).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.sent.set(true);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.serverError.set('auth.common.genericError');
        this.errorRef.set(apiErrorReference(err));
      }
    });
  }
}
