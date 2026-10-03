import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { PaymentService, PaymentStatusResponse } from '../../core/services/payment.service';
import { SeoService } from '../../core/services/seo.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { safeReturnUrl } from '../../shared/utils/safe-redirect';

export const DEPOSIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a settled marketplace payment takes the buyer (by the server's `purpose`). */
const SERVICE_PAGES: Record<string, string> = {
  actor_video: '/actor/videos',
  actor_search: '/producer/actors',
  casting_announcement: '/producer/casting',
};

type ReturnState = 'checking' | 'success' | 'failed' | 'pending' | 'invalid' | 'error';

/**
 * The buyer lands here after DPO's hosted page (RedirectURL / BackURL), or after the demo
 * checkout. The redirect itself proves nothing: the outcome is always read from our server,
 * which verifies with DPO. What to show next comes from the server too (purpose, movie_id).
 */
@Component({
  selector: 'app-payment-return',
  imports: [CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent],
  template: `
    <app-header [userImg]="''" />
    <main class="pr" aria-live="polite">
      @if (status()?.demo) {
        <p class="pr-demo"><strong>{{ 'paymentModal.demo.label' | translate }}</strong> {{ 'paymentModal.demo.noCharge' | translate }}</p>
      }

      @switch (state()) {
        @case ('checking') {
          <div class="pr-icon pr-icon--wait" aria-hidden="true"><span class="pr-spinner"></span></div>
          <h1>{{ 'paymentReturn.checkingTitle' | translate }}</h1>
          <p>{{ 'paymentReturn.checkingText' | translate }}</p>
          @if (status()?.payment_url) {
            <!-- Back from DPO without finishing (BackURL): no need to wait for the polling to run out -->
            <p class="pr-hint">{{ 'paymentReturn.notFinishedHint' | translate }}</p>
            <div class="pr-actions">
              <button type="button" class="pr-btn" (click)="continuePayment()">{{ 'paymentModal.continuePayment' | translate }}</button>
              <button type="button" class="pr-btn pr-btn--quiet" (click)="cancel()" [disabled]="busy()">{{ 'paymentModal.cancelPayment' | translate }}</button>
            </div>
          }
        }
        @case ('success') {
          <div class="pr-icon pr-icon--ok" aria-hidden="true">✓</div>
          <h1>{{ 'paymentReturn.successTitle' | translate }}</h1>
          <p>{{ (movieId() ? 'paymentReturn.successMovie' : 'paymentReturn.successService') | translate: { title: status()?.movie_title ?? '' } }}</p>
          <div class="pr-actions">
            @if (movieId()) {
              <button type="button" class="pr-btn pr-btn--primary" (click)="watchNow()">{{ 'paymentReturn.watchNow' | translate }}</button>
              <a class="pr-btn" [routerLink]="['/movie', movieId()]">{{ 'paymentReturn.viewFilm' | translate }}</a>
            } @else {
              <a class="pr-btn pr-btn--primary" [routerLink]="nextPage()">{{ 'paymentReturn.continue' | translate }}</a>
            }
          </div>
        }
        @case ('failed') {
          <div class="pr-icon pr-icon--bad" aria-hidden="true">!</div>
          <h1>{{ 'paymentReturn.failedTitle' | translate }}</h1>
          <p>{{ failureKey() | translate }}</p>
          <div class="pr-actions">
            <a class="pr-btn pr-btn--primary" [routerLink]="nextPage()">{{ 'paymentReturn.tryAgain' | translate }}</a>
            <a class="pr-btn" routerLink="/profile">{{ 'paymentReturn.history' | translate }}</a>
          </div>
        }
        @case ('pending') {
          <div class="pr-icon pr-icon--wait" aria-hidden="true">…</div>
          <h1>{{ 'paymentReturn.pendingTitle' | translate }}</h1>
          <p>{{ 'paymentReturn.pendingText' | translate }}</p>
          @if (errorKey()) { <p class="pr-error" role="alert">{{ errorKey() | translate }}</p> }
          <div class="pr-actions">
            @if (status()?.payment_url) {
              <button type="button" class="pr-btn pr-btn--primary" (click)="continuePayment()">{{ 'paymentModal.continuePayment' | translate }}</button>
            }
            <button type="button" class="pr-btn" (click)="check()">{{ 'paymentModal.checkAgain' | translate }}</button>
            <button type="button" class="pr-btn pr-btn--quiet" (click)="cancel()" [disabled]="busy()">{{ 'paymentModal.cancelPayment' | translate }}</button>
          </div>
        }
        @case ('invalid') {
          <h1>{{ 'paymentReturn.invalidTitle' | translate }}</h1>
          <p>{{ 'paymentReturn.invalidText' | translate }}</p>
          <div class="pr-actions"><a class="pr-btn pr-btn--primary" routerLink="/profile">{{ 'paymentReturn.history' | translate }}</a></div>
        }
        @case ('error') {
          <h1>{{ 'paymentReturn.errorTitle' | translate }}</h1>
          <p>{{ 'paymentReturn.errorText' | translate }}</p>
          <div class="pr-actions">
            <button type="button" class="pr-btn pr-btn--primary" (click)="check()">{{ 'paymentModal.checkAgain' | translate }}</button>
            <a class="pr-btn" routerLink="/profile">{{ 'paymentReturn.history' | translate }}</a>
          </div>
        }
      }
    </main>
    <app-footer />
  `,
  styleUrl: './payment-pages.scss',
})
export class PaymentReturnComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly payments = inject(PaymentService);
  private readonly seo = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<ReturnState>('checking');
  readonly status = signal<PaymentStatusResponse | null>(null);
  readonly busy = signal(false);
  readonly errorKey = signal('');
  private depositId: string | null = null;
  private poll?: Subscription;

  ngOnInit() {
    this.seo.setTranslated({ titleKey: 'paymentReturn.seoTitle', noIndex: true });
    const raw = this.route.snapshot.queryParamMap.get('deposit');
    if (!raw || !DEPOSIT_ID.test(raw)) {
      this.state.set('invalid');
      return;
    }
    this.depositId = raw;
    this.check();
  }

  movieId(): number | null {
    const s = this.status();
    return s?.purpose === 'movie' && s.movie_id ? s.movie_id : null;
  }

  /** Back to what was being bought: the film, the service page, or a page the modal remembered. */
  nextPage(): string {
    const s = this.status();
    if (s?.purpose === 'movie' && s.movie_id) return `/movie/${s.movie_id}`;
    const remembered = this.depositId ? this.payments.returnContext(this.depositId) : null;
    if (remembered?.kind === 'service') return safeReturnUrl(remembered.returnTo) ?? '/browse';
    return (s && SERVICE_PAGES[s.purpose]) ?? '/browse';
  }

  failureKey(): string {
    switch (this.status()?.failure_reason) {
      case 'expired': return 'paymentReturn.failedExpired';
      case 'cancelled': return 'paymentReturn.failedCancelled';
      case 'declined': return 'paymentReturn.failedDeclined';
      default: return 'paymentReturn.failedGeneric';
    }
  }

  /** One immediate check, then the shared backoff polling while it is still open. */
  check() {
    if (!this.depositId) return;
    const id = this.depositId;
    this.poll?.unsubscribe();
    this.errorKey.set('');
    this.state.set('checking');
    this.poll = this.payments.checkStatus(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        if (this.apply(res)) return;
        this.poll = this.payments.pollUntilSettled(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (r) => this.apply(r),
          error: (err: unknown) => this.onError(err),
          complete: () => { if (this.state() === 'checking') this.state.set('pending'); },
        });
      },
      error: (err: unknown) => this.onError(err),
    });
  }

  /** True when the payment reached a final state. */
  private apply(res: PaymentStatusResponse): boolean {
    this.status.set(res);
    if (res.status === 'Completed' || res.status === 'Failed') {
      this.payments.forgetDeposit(res.deposit_id);
      this.state.set(res.status === 'Completed' ? 'success' : 'failed');
      return true;
    }
    return false;
  }

  private onError(err: unknown) {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    this.state.set(status === 404 || status === 403 ? 'invalid' : 'error');
  }

  /** Playback starts from a click (never on page load), via navigation state — nothing in the URL. */
  watchNow() {
    const id = this.movieId();
    if (id) void this.router.navigate(['/movie', id], { state: { startPlayback: true } });
  }

  continuePayment() {
    const target = this.payments.paymentPageTarget(this.status()?.payment_url);
    if (!target) {
      this.errorKey.set('paymentModal.errors.badPaymentPage');
      return;
    }
    if ('internal' in target) void this.router.navigateByUrl(target.internal);
    else this.openExternal(target.external);
  }

  /** Separate so tests can stub it. */
  openExternal(url: string) {
    window.location.assign(url);
  }

  cancel() {
    if (!this.depositId || this.busy()) return;
    this.busy.set(true);
    this.payments.cancel(this.depositId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); this.check(); },
      error: (err: unknown) => {
        this.busy.set(false);
        // 409: it was paid in the meantime — re-reading shows the success state.
        if (err instanceof HttpErrorResponse && err.status === 409) this.check();
        else this.errorKey.set('paymentReturn.cancelFailed');
      },
    });
  }
}
