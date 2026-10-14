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
import {
  MembershipStatus, ProducerPlan, ServicePurchase, ServiceQuote,
} from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { accessTimeLeft } from '../../../shared/utils/marketplace-status';

export type AccessStep = 'status' | 'welcome' | 'info' | 'summary' | 'confirmed';
const WIZARD: readonly AccessStep[] = ['welcome', 'info', 'summary', 'confirmed'];

export const PRODUCER_PLANS: readonly ProducerPlan[] = ['producer_full', 'producer_view'];
const QUOTE_SERVICE = { producer_full: 'producer_full_plan', producer_view: 'producer_view_plan' } as const;

/**
 * My plan: the yearly producer plans. Full = actor directory + unlimited casting calls;
 * View-only = actor directory (each casting call pays the per-call fee). Shows the current plan
 * (from `membership/`) and walks through buying or renewing one. A plan is only reported as
 * granted once the server says so after payment; the countdown is display only.
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

  readonly plans = PRODUCER_PLANS;
  readonly stepLabels = [
    'marketplace.access.stepWelcome', 'marketplace.access.stepInfo', 'marketplace.access.stepSummary', 'marketplace.access.stepDone',
  ];

  step = signal<AccessStep>('status');
  membership = signal<MembershipStatus | null>(null);
  accessLoading = signal(true);
  accessError = signal<string | null>(null);
  me = signal<UserProfile | null>(null);
  meError = signal(false);
  chosen = signal<ProducerPlan>('producer_full');
  quotes = signal<Partial<Record<ProducerPlan, ServiceQuote>>>({});
  quoteError = signal<string | null>(null);
  purchase = signal<ServicePurchase | null>(null);
  /** Paid, but the server hasn't reported the new plan yet. */
  awaitingGrant = signal(false);
  now = signal(Date.now());

  private ticker?: ReturnType<typeof setInterval>;

  readonly stepIndex = computed(() => Math.max(0, WIZARD.indexOf(this.step())));
  readonly producer = computed(() => this.membership()?.producer ?? null);
  readonly active = computed(() => {
    const p = this.producer();
    return !!p?.plan && !!p.expires_at && new Date(p.expires_at).getTime() > this.now();
  });
  readonly currentPlan = computed(() => (this.active() ? this.producer()!.plan : null));
  readonly timeLeft = computed(() => accessTimeLeft(this.producer()?.expires_at ?? null, this.now()));
  /** An old directory pass (bought before the plans) that still runs. */
  readonly legacyUntil = computed(() => {
    const until = this.producer()?.legacy_search_until ?? null;
    return until && new Date(until).getTime() > this.now() ? until : null;
  });
  readonly quote = computed(() => this.quotes()[this.chosen()] ?? null);

  ngOnInit(): void {
    this.loadAccess();
    if (isPlatformBrowser(this.platformId)) {
      this.ticker = setInterval(() => this.tick(), 30000);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.ticker);
  }

  loadAccess(after?: (m: MembershipStatus) => void): void {
    this.accessLoading.set(true);
    this.accessError.set(null);
    this.casting.getMembership().subscribe({
      next: (m) => {
        this.membership.set(m);
        this.accessLoading.set(false);
        this.now.set(Date.now());
        after?.(m);
      },
      error: (err: unknown) => {
        this.accessLoading.set(false);
        this.accessError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  /** Start buying (or renewing): the first step compares the two plans. */
  begin(plan?: ProducerPlan): void {
    this.chosen.set(plan ?? this.currentPlan() ?? 'producer_full');
    this.goTo('welcome');
    this.loadQuotes();
  }

  /** The Full plan already covers what View-only gives, so View-only isn't sold on top of it. */
  canChoose(plan: ProducerPlan): boolean {
    return !(plan === 'producer_view' && this.currentPlan() === 'producer_full');
  }

  choose(plan: ProducerPlan): void {
    if (this.canChoose(plan)) this.chosen.set(plan);
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
    if (!this.quote()) this.loadQuotes();
  }

  back(): void {
    const i = WIZARD.indexOf(this.step());
    this.goTo(i > 0 ? WIZARD[i - 1] : 'status');
  }

  cancelWizard(): void {
    this.goTo('status');
  }

  loadQuotes(): void {
    this.quoteError.set(null);
    for (const plan of PRODUCER_PLANS) {
      this.casting.getQuote(QUOTE_SERVICE[plan]).subscribe({
        next: (q) => this.quotes.update(all => ({ ...all, [plan]: q })),
        error: (err: HttpErrorResponse) => this.quoteError.set(
          err.status === 503 ? 'marketplace.purchase.unavailable' : (marketplaceErrorMessage(err) ?? 'marketplace.purchase.quoteFailed'),
        ),
      });
    }
  }

  /** When the new year starts: after the current one for a renewal of the same plan (the server stacks it), else now. */
  readonly startsAt = computed(() =>
    this.currentPlan() === this.chosen() ? this.producer()!.expires_at : null);

  pay(): void {
    if (this.purchase() || !this.quote()) return;
    const plan = this.chosen();
    this.purchase.set({
      titleKey: `marketplace.access.plan.${plan}`,
      descriptionKey: `marketplace.access.planDesc.${plan}`,
      quote: () => this.casting.getQuote(QUOTE_SERVICE[plan]),
      pendingKey: `service:plan:${plan}`,
      returnTo: '/producer/access',
      initiate: (phone) => this.casting.purchasePlan(plan, phone),
    });
  }

  /** Payment confirmed by the server; the plan is shown only once the server reports it. */
  onPaid(): void {
    this.purchase.set(null);
    const before = this.grantMarker(this.membership());
    this.loadAccess((m) => {
      this.awaitingGrant.set(this.grantMarker(m) === before || m.producer.plan === null);
      this.goTo('confirmed');
    });
  }

  closePurchase(): void {
    this.purchase.set(null);
  }

  /** "Check again" while the grant hasn't shown up yet. */
  recheck(): void {
    const before = this.grantMarker(this.membership());
    this.loadAccess((m) => this.awaitingGrant.set(
      m.producer.plan === null || (this.grantMarker(m) === before && this.awaitingGrant())));
  }

  /** Changes when a purchase lands: a new plan, or a later end date. */
  private grantMarker(m: MembershipStatus | null): string {
    return `${m?.producer.plan ?? ''}|${m?.producer.expires_at ?? ''}`;
  }

  private tick(): void {
    this.now.set(Date.now());
    const p = this.producer();
    // The plan just ended: ask the server instead of assuming.
    if (p?.plan && p.expires_at && new Date(p.expires_at).getTime() <= this.now()) this.loadAccess();
  }

  private goTo(step: AccessStep): void {
    this.step.set(step);
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => this.stepHeading()?.nativeElement.focus());
  }
}
