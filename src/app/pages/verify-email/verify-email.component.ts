import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss'
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  status = signal<'loading' | 'success' | 'error' | 'invalid'>('loading');
  errorMessage = signal('');

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.status.set('invalid');
      return;
    }

    this.authService.verifyEmail(token).subscribe({
      next: () => this.status.set('success'),
      error: (err) => {
        this.status.set('error');
        const detail =
          err?.error?.detail ??
          err?.error?.token?.[0] ??
          err?.error?.non_field_errors?.[0];
        this.errorMessage.set(detail ?? 'Verification failed. The link may have expired.');
      }
    });
  }
}
