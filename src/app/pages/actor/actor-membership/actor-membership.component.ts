import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MembershipStatus, ServicePurchase, ServiceQuote } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { accessTimeLeft } from '../../../shared/utils/marketplace-status';

/**
 * My membership: the yearly actor membership (upload talent videos with no per-video fee, appear in
 * the producer directory, apply to casting calls). Shows the server's status and buys or renews it;
 * it is only reported as active once the server says so after payment.
 */
@Component({
  selector: 'app-actor-membership',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, MarketplaceNavComponent, PaymentModalComponent],
  templateUrl: './actor-membership.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorMembershipComponent implements OnInit, OnDestroy {
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly platformId = inject(PLATFORM_ID);

  status = signal<MembershipStatus | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  quote = signal<ServiceQuote | null>(null);
  quoteError = signal<string | null>(null);
  purchase = signal<ServicePurchase | null>(null);
  /** Paid, but the server hasn't reported the new year yet. */
  awaitingGrant = signal(false);
  /** The server reported the purchase (shown once after paying). */
  granted = signal(false);
  now = signal(Date.now());

  private ticker?: ReturnType<typeof setInterval>;
  /** The end date before the last payment: the grant shows as a later one (or a first one). */
  private beforeGrant: string | null = null;

  readonly expiresAt = computed(() => this.status()?.actor.expires_at ?? null);
  readonly active = computed(() => {
    const until = this.expiresAt();
    return !!this.status()?.actor.active && !!until && new Date(until).getTime() > this.now();
  });
  readonly timeLeft = computed(() => accessTimeLeft(this.expiresAt(), this.now()));

  ngOnInit(): void {
    this.load();
    this.loadQuote();
    if (isPlatformBrowser(this.platformId)) this.ticker = setInterval(() => this.tick(), 30000);
  }

  ngOnDestroy(): void {
    clearInterval(this.ticker);
  }

  load(after?: (m: MembershipStatus) => void): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketplace.getMembership().subscribe({
      next: (m) => {
        this.status.set(m);
        this.loading.set(false);
        this.now.set(Date.now());
        after?.(m);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  loadQuote(): void {
    this.quoteError.set(null);
    this.marketplace.getMembershipQuote().subscribe({
      next: (q) => this.quote.set(q),
      error: (err: HttpErrorResponse) => this.quoteError.set(
        err.status === 503 ? 'marketplace.purchase.unavailable' : (marketplaceErrorMessage(err) ?? 'marketplace.purchase.quoteFailed'),
      ),
    });
  }

  buy(): void {
    if (this.purchase() || !this.quote()) return;
    this.granted.set(false);
    this.purchase.set({
      titleKey: 'marketplace.membership.purchaseTitle',
      descriptionKey: 'marketplace.membership.purchaseDesc',
      quote: () => this.marketplace.getMembershipQuote(),
      pendingKey: 'service:actor_membership',
      returnTo: '/actor/membership',
      initiate: (phone) => this.marketplace.purchaseMembership(phone),
    });
  }

  /** Payment confirmed: the new year shows only once the server reports it. */
  onPaid(): void {
    this.purchase.set(null);
    this.beforeGrant = this.expiresAt();
    this.load((m) => this.settle(m));
  }

  closePurchase(): void {
    this.purchase.set(null);
  }

  recheck(): void {
    this.load((m) => this.settle(m));
  }

  private settle(m: MembershipStatus): void {
    const done = m.actor.active && m.actor.expires_at !== this.beforeGrant;
    this.awaitingGrant.set(!done);
    this.granted.set(done);
  }

  private tick(): void {
    this.now.set(Date.now());
    const until = this.expiresAt();
    if (this.status()?.actor.active && until && new Date(until).getTime() <= this.now()) this.load();
  }
}
