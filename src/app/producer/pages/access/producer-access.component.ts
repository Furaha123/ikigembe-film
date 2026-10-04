import {
  Component, ElementRef, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CastingService } from '../../services/casting.service';
import { AuthService, UserProfile } from '../../../core/services/auth.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { WizardStepsComponent } from '../../../shared/components/wizard-steps/wizard-steps.component';
import { ActorSearchAccess, ServicePurchase, ServiceQuote } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { accessTimeLeft } from '../../../shared/utils/marketplace-status';

export type AccessStep = 'status' | 'welcome' | 'info' | 'summary' | 'confirmed';
const WIZARD: readonly AccessStep[] = ['welcome', 'info', 'summary', 'confirmed'];

/**
 * My Access: the actor-directory pass. Shows the current window (from
 * `actor-search/access/`), and walks through buying or renewing it. Access is
 * only reported as granted once the server says so after payment; the
 * countdown is display only. Directory access and casting-post fees are
 * separate purchases.
 */
@Component({
  selector: 'app-producer-access',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, PaymentModalComponent, WizardStepsComponent],
  templateUrl: './producer-access.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ProducerAccessComponent implements OnInit, OnDestroy {
  private readonly casting = inject(CastingService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  readonly stepLabels = [
    'marketplace.access.stepWelcome', 'marketplace.access.stepInfo', 'marketplace.access.stepSummary', 'marketplace.access.stepDone',
  ];

  step = signal<AccessStep>('status');
  access = signal<ActorSearchAccess | null>(null);
  accessLoading = signal(true);
  accessError = signal<string | null>(null);
  me = signal<UserProfile | null>(null);
  meError = signal(false);
  quote = signal<ServiceQuote | null>(null);
  quoteError = signal<string | null>(null);
  purchase = signal<ServicePurchase | null>(null);
  /** Paid, but the server hasn't reported the new window yet. */
  awaitingGrant = signal(false);
  now = signal(Date.now());

  private ticker?: ReturnType<typeof setInterval>;

  readonly stepIndex = computed(() => Math.max(0, WIZARD.indexOf(this.step())));
  readonly active = computed(() => {
    const a = this.access();
    return !!a?.active && !!a.expires_at && new Date(a.expires_at).getTime() > this.now();
  });
  readonly timeLeft = computed(() => accessTimeLeft(this.access()?.expires_at ?? null, this.now()));

  ngOnInit(): void {
    this.loadAccess();
    if (isPlatformBrowser(this.platformId)) {
      this.ticker = setInterval(() => this.tick(), 30000);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.ticker);
  }

  loadAccess(after?: (a: ActorSearchAccess) => void): void {
    this.accessLoading.set(true);
    this.accessError.set(null);
    this.casting.getSearchAccess().subscribe({
      next: (a) => {
        this.access.set(a);
        this.accessLoading.set(false);
        this.now.set(Date.now());
        after?.(a);
      },
      error: (err: unknown) => {
        this.accessLoading.set(false);
        this.accessError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  /** Start buying (or renewing): the welcome step explains what the pass gives. */
  begin(): void {
    this.goTo('welcome');
    this.loadQuote();
  }

  toInfo(): void {
    this.goTo('info');
    if (!this.me()) {
      this.meError.set(false);
      this.auth.getMe().subscribe({
        next: (me) => this.me.set(me),
        error: () => this.meError.set(true),
      });
    }
  }

  toSummary(): void {
    this.goTo('summary');
    if (!this.quote()) this.loadQuote();
  }

  back(): void {
    const i = WIZARD.indexOf(this.step());
    this.goTo(i > 0 ? WIZARD[i - 1] : 'status');
  }

  cancelWizard(): void {
    this.goTo('status');
  }

  loadQuote(): void {
    this.quoteError.set(null);
    this.casting.getQuote('actor_search').subscribe({
      next: (q) => this.quote.set(q),
      error: (err: HttpErrorResponse) => this.quoteError.set(
        err.status === 503 ? 'marketplace.purchase.unavailable' : (marketplaceErrorMessage(err) ?? 'marketplace.purchase.quoteFailed'),
      ),
    });
  }

  /** When the new window would start: now, or at the end of the current one (the server extends it). */
  readonly startsAt = computed(() => (this.active() ? this.access()!.expires_at! : null));

  pay(): void {
    if (this.purchase() || !this.quote()) return;
    this.purchase.set({
      titleKey: 'marketplace.directory.purchaseTitle',
      descriptionKey: 'marketplace.directory.purchaseDesc',
      quote: () => this.casting.getQuote('actor_search'),
      pendingKey: 'service:actor_search',
      returnTo: '/producer/access',
      initiate: (phone) => this.casting.purchaseSearch(phone),
    });
  }

  /** Payment confirmed by the server; access is shown only once the server reports it. */
  onPaid(): void {
    this.purchase.set(null);
    const before = this.access()?.expires_at ?? null;
    this.loadAccess((a) => {
      this.awaitingGrant.set(!a.active || a.expires_at === before);
      this.goTo('confirmed');
    });
  }

  closePurchase(): void {
    this.purchase.set(null);
  }

  /** "Check again" while the grant hasn't shown up yet. */
  recheck(): void {
    const before = this.access()?.expires_at ?? null;
    this.loadAccess((a) => this.awaitingGrant.set(!a.active || (a.expires_at === before && this.awaitingGrant())));
  }

  private tick(): void {
    this.now.set(Date.now());
    const a = this.access();
    // The window just ended: ask the server instead of assuming.
    if (a?.active && a.expires_at && new Date(a.expires_at).getTime() <= this.now()) this.loadAccess();
  }

  private goTo(step: AccessStep): void {
    this.step.set(step);
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => this.stepHeading()?.nativeElement.focus());
  }
}
