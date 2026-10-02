import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { PaymentService, PaymentStatusResponse } from '../../core/services/payment.service';
import { SeoService } from '../../core/services/seo.service';
import { DEPOSIT_ID } from './payment-return.component';

/**
 * DEMO MODE ONLY (backend PAYMENT_DEMO_MODE with PAYMENT_GATEWAY=dpo): a stand-in for DPO's
 * hosted payment page so the full redirect journey can be shown without a real gateway.
 * It is labelled on every line; the backend refuses its endpoint outside demo mode.
 */
@Component({
  selector: 'app-demo-checkout',
  imports: [CommonModule, TranslatePipe],
  template: `
    <main class="dc">
      <div class="dc-card">
        <p class="dc-banner" role="note">
          <strong>{{ 'demoCheckout.banner' | translate }}</strong>
          {{ 'demoCheckout.bannerText' | translate }}
        </p>

        @if (status(); as s) {
          @if (!s.demo) {
            <h1>{{ 'demoCheckout.unavailable' | translate }}</h1>
          } @else if (s.status !== 'Pending') {
            <h1>{{ 'demoCheckout.alreadySettled' | translate }}</h1>
            <button type="button" class="dc-btn dc-btn--primary" (click)="backToSite()">{{ 'demoCheckout.back' | translate }}</button>
          } @else {
            <p class="dc-merchant">Ikigembe Film Arts</p>
            <h1 class="dc-amount">RWF {{ s.amount | number }}</h1>
            <p class="dc-item">{{ s.movie_title ?? ('demoCheckout.service.' + s.purpose | translate) }}</p>

            <div class="dc-methods" aria-hidden="true">
              <span>MTN MoMo</span><span>Airtel Money</span><span>Visa / Mastercard</span>
            </div>

            @if (error()) { <p class="dc-error" role="alert">{{ error() | translate }}</p> }

            <button type="button" class="dc-btn dc-btn--primary" (click)="finish('paid')" [disabled]="busy()">
              {{ 'demoCheckout.pay' | translate: { amount: (s.amount | number) } }}
            </button>
            <button type="button" class="dc-btn" (click)="finish('declined')" [disabled]="busy()">{{ 'demoCheckout.decline' | translate }}</button>
            <button type="button" class="dc-btn dc-btn--quiet" (click)="backToSite()" [disabled]="busy()">{{ 'demoCheckout.abandon' | translate }}</button>
          }
        } @else if (invalid()) {
          <h1>{{ 'paymentReturn.invalidTitle' | translate }}</h1>
        } @else {
          <p role="status">{{ 'paymentReturn.checkingTitle' | translate }}</p>
        }
      </div>
    </main>
  `,
  styleUrl: './payment-pages.scss',
})
export class DemoCheckoutComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly payments = inject(PaymentService);
  private readonly seo = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = signal<PaymentStatusResponse | null>(null);
  readonly invalid = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private depositId = '';

  ngOnInit() {
    this.seo.setTranslated({ titleKey: 'demoCheckout.seoTitle', noIndex: true });
    const raw = this.route.snapshot.queryParamMap.get('deposit') ?? '';
    if (!DEPOSIT_ID.test(raw)) { this.invalid.set(true); return; }
    this.depositId = raw;
    this.payments.checkStatus(raw).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (s) => this.status.set(s),
      error: () => this.invalid.set(true),
    });
  }

  finish(outcome: 'paid' | 'declined') {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.payments.demoCheckout(this.depositId, outcome).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.backToSite(),
      error: () => { this.busy.set(false); this.error.set('demoCheckout.failed'); },
    });
  }

  /** Like DPO's RedirectURL/BackURL: back to the site, which then asks the server what happened. */
  backToSite() {
    void this.router.navigate(['/payment/return'], { queryParams: { deposit: this.depositId }, replaceUrl: true });
  }
}
