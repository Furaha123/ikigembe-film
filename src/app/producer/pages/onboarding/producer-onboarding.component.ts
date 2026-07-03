import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
  'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo (Republic)', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czechia',
  'DR Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador',
  'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini',
  'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany',
  'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq',
  'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
  'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania',
  'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova',
  'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia',
  'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
  'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau',
  'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
  'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan',
  'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
  'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen',
  'Zambia', 'Zimbabwe', 'Other',
];

@Component({
  selector: 'app-producer-onboarding',
  imports: [TranslatePipe, TranslateDirective, CommonModule, ReactiveFormsModule],
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
      error: (err) => {
        if (err.status === 409) {
          this.finishOnboarding();
        } else {
          this.isSaving.set(false);
          this.saveError.set('Failed to save your profile. Please try again.');
        }
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
