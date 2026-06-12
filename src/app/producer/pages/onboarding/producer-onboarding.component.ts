import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

const COUNTRIES = [
  'Rwanda', 'Kenya', 'Uganda', 'Tanzania', 'Ethiopia', 'Nigeria', 'Ghana',
  'South Africa', 'Senegal', 'Ivory Coast', 'Cameroon', 'Morocco', 'Egypt',
  'Zambia', 'Zimbabwe', 'Mozambique', 'Angola', 'Other',
];

@Component({
  selector: 'app-producer-onboarding',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './producer-onboarding.component.html',
  styleUrl: './producer-onboarding.component.scss',
})
export class ProducerOnboardingComponent implements OnInit {
  private readonly fb          = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly http        = inject(HttpClient);

  readonly COUNTRIES = COUNTRIES;
  readonly userName  = this.authService.userName;

  isSaving  = signal(false);
  saveError = signal<string | null>(null);

  // ── Profile form ──────────────────────────────────────
  avatarPreview = signal<string | null>(null);
  avatarFile    = signal<File | null>(null);

  profileForm = this.fb.group({
    country:    ['', Validators.required],
    bio:        ['', [Validators.required, Validators.minLength(20), Validators.maxLength(400)]],
    experience: ['', Validators.required],
  });

  get country()    { return this.profileForm.get('country'); }
  get bio()        { return this.profileForm.get('bio'); }
  get experience() { return this.profileForm.get('experience'); }

  ngOnInit() {
    if (this.authService.onboardingComplete()) {
      this.router.navigate(['/producer/dashboard']);
    }
  }

  onAvatarSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.avatarFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.avatarPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ── Submit ────────────────────────────────────────────
  complete() {
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid) return;

    this.isSaving.set(true);
    this.saveError.set(null);

    const payload = {
      country:    this.profileForm.value.country,
      bio:        this.profileForm.value.bio,
      experience: this.profileForm.value.experience,
    };

    this.http.post(`${environment.apiUrl}/producer/onboarding/`, payload).subscribe({
      next:  () => this.finishOnboarding(),
      error: () => {
        this.isSaving.set(false);
        this.saveError.set('Failed to save your profile. Please try again.');
      },
    });
  }

  skip() {
    this.isSaving.set(true);
    const payload = {
      country:    this.profileForm.value.country    || null,
      bio:        this.profileForm.value.bio        || null,
      experience: this.profileForm.value.experience || null,
    };
    this.http.post(`${environment.apiUrl}/producer/onboarding/`, payload).subscribe({
      next:  () => this.finishOnboarding(),
      error: () => this.finishOnboarding(),
    });
  }

  private finishOnboarding() {
    this.authService.completeOnboarding();
    this.isSaving.set(false);
    this.router.navigate(['/producer/dashboard']);
  }
}
