import { Component, inject, signal, computed } from '@angular/core';
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

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western',
];

const MOMO_PROVIDERS = ['MTN Mobile Money', 'Airtel Money'];

type Step = 1 | 2 | 3;

@Component({
  selector: 'app-producer-onboarding',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './producer-onboarding.component.html',
  styleUrl: './producer-onboarding.component.scss',
})
export class ProducerOnboardingComponent {
  private readonly fb          = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly http        = inject(HttpClient);

  readonly COUNTRIES     = COUNTRIES;
  readonly ALL_GENRES    = ALL_GENRES;
  readonly MOMO_PROVIDERS = MOMO_PROVIDERS;
  readonly userName      = this.authService.userName;

  currentStep = signal<Step>(1);
  isSaving    = signal(false);
  saveError   = signal<string | null>(null);

  // ── Step 1: Profile ─────────────────────────────────
  avatarPreview = signal<string | null>(null);
  avatarFile    = signal<File | null>(null);

  profileForm = this.fb.group({
    country:     ['', Validators.required],
    bio:         ['', [Validators.required, Validators.minLength(20), Validators.maxLength(400)]],
    experience:  ['', Validators.required],
  });

  get country()    { return this.profileForm.get('country'); }
  get bio()        { return this.profileForm.get('bio'); }
  get experience() { return this.profileForm.get('experience'); }

  onAvatarSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.avatarFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.avatarPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ── Step 2: Genres ───────────────────────────────────
  selectedGenres = signal<Set<string>>(new Set());

  toggleGenre(genre: string) {
    this.selectedGenres.update(set => {
      const next = new Set(set);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  }

  isGenreSelected(genre: string) { return this.selectedGenres().has(genre); }
  genresValid = computed(() => this.selectedGenres().size >= 1);

  // ── Step 3: Payment ──────────────────────────────────
  paymentMethod = signal<'bank' | 'momo'>('momo');

  bankForm = this.fb.group({
    bank_name:           ['', Validators.required],
    account_number:      ['', Validators.required],
    account_holder_name: ['', Validators.required],
  });

  momoForm = this.fb.group({
    momo_provider: ['MTN Mobile Money', Validators.required],
    momo_number:   ['', [Validators.required, Validators.pattern(/^\+?[0-9\s\-]{7,15}$/)]],
  });

  paymentFormValid = computed(() => {
    if (this.paymentMethod() === 'bank') return this.bankForm.valid;
    return this.momoForm.valid;
  });

  // ── Navigation ────────────────────────────────────────
  goNext() {
    const step = this.currentStep();
    if (step === 1) {
      this.profileForm.markAllAsTouched();
      if (this.profileForm.invalid) return;
    }
    if (step === 2) {
      if (!this.genresValid()) return;
    }
    if (step < 3) this.currentStep.set((step + 1) as Step);
  }

  goPrev() {
    const step = this.currentStep();
    if (step > 1) this.currentStep.set((step - 1) as Step);
  }

  skip() {
    if (this.currentStep() < 3) this.currentStep.set((this.currentStep() + 1) as Step);
  }

  // ── Complete onboarding ───────────────────────────────
  complete() {
    if (this.paymentMethod() === 'bank') this.bankForm.markAllAsTouched();
    else this.momoForm.markAllAsTouched();

    if (!this.paymentFormValid()) return;

    this.isSaving.set(true);
    this.saveError.set(null);

    const payload = {
      country:     this.profileForm.value.country,
      bio:         this.profileForm.value.bio,
      experience:  this.profileForm.value.experience,
      genres:      Array.from(this.selectedGenres()),
      payment_method: this.paymentMethod() === 'bank' ? 'Bank' : 'MoMo',
      ...(this.paymentMethod() === 'bank' ? this.bankForm.value : this.momoForm.value),
    };

    this.http.post(`${environment.apiUrl}/producer/onboarding/`, payload).subscribe({
      next: () => this.finishOnboarding(),
      error: () => {
        this.isSaving.set(false);
        this.saveError.set('Failed to save your profile. Please try again.');
      },
    });
  }

  private finishOnboarding() {
    this.authService.completeOnboarding();
    this.isSaving.set(false);
    this.router.navigate(['/producer/dashboard']);
  }

  skipAll() {
    this.isSaving.set(true);
    const payload: Record<string, unknown> = {
      country:    this.profileForm.value.country    || null,
      bio:        this.profileForm.value.bio        || null,
      experience: this.profileForm.value.experience || null,
      genres:     Array.from(this.selectedGenres()),
    };
    // Only include payment if the user actually filled in the key field
    if (this.paymentMethod() === 'momo' && this.momoForm.value.momo_number) {
      payload['payment_method'] = 'MoMo';
      payload['momo_provider']  = this.momoForm.value.momo_provider;
      payload['momo_number']    = this.momoForm.value.momo_number;
    } else if (this.paymentMethod() === 'bank' && this.bankForm.value.account_number) {
      payload['payment_method']        = 'Bank';
      payload['bank_name']             = this.bankForm.value.bank_name;
      payload['account_number']        = this.bankForm.value.account_number;
      payload['account_holder_name']   = this.bankForm.value.account_holder_name;
    }
    this.http.post(`${environment.apiUrl}/producer/onboarding/`, payload).subscribe({
      next:  () => this.finishOnboarding(),
      error: () => this.finishOnboarding(), // skip path still proceeds on error
    });
  }

  stepPercent = computed(() => Math.round((this.currentStep() / 3) * 100));
}
