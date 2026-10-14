import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { CastingService } from '../../services/casting.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { CastingRolesComponent } from '../../../shared/components/casting-roles/casting-roles.component';
import { CastingCall, ServicePurchase } from '../../../shared/models/marketplace.interface';
import {
  CastingPublicationState, castingDisplayStatus, castingPublicationClass, castingPublicationState,
} from '../../../shared/utils/marketplace-status';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';

export type CastingFilter = 'all' | 'draft' | 'published' | 'closed';

/** Which list tab a call belongs to (removed calls only show under "All"). */
export function castingFilterOf(state: CastingPublicationState): Exclude<CastingFilter, 'all'> | null {
  if (state === 'published') return 'published';
  if (state === 'closed') return 'closed';
  if (state === 'removed') return null;
  return 'draft';
}

/**
 * My Castings: every call this producer created, by state. New calls and
 * draft edits go through the Post Casting wizard; publishing is the fee
 * payment, after which the server publishes the call.
 */
@Component({
  selector: 'app-producer-casting',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, PaymentModalComponent, CastingRolesComponent],
  templateUrl: './producer-casting.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss', './producer-casting.component.scss'],
})
export class ProducerCastingComponent implements OnInit {
  private readonly casting = inject(CastingService);

  readonly filters: CastingFilter[] = ['all', 'published', 'draft', 'closed'];
  readonly publicationState = castingPublicationState;
  readonly publicationClass = castingPublicationClass;
  readonly displayStatus = castingDisplayStatus;

  calls       = signal<CastingCall[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);
  filter      = signal<CastingFilter>('all');
  purchase    = signal<ServicePurchase | null>(null);
  confirmCloseId = signal<number | null>(null);
  closingId   = signal<number | null>(null);
  actionError = signal<string | null>(null);
  actionNotice = signal<string | null>(null);

  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.calls() : this.calls().filter(c => castingFilterOf(castingPublicationState(c)) === f);
  });

  /** Callout under a card: red for a rejection or removal, neutral for other explained states, none otherwise. */
  calloutTone(state: CastingPublicationState): 'danger' | 'neutral' | null {
    if (state === 'rejected' || state === 'removed' || state === 'paymentFailed') return 'danger';
    if (state !== 'published' && state !== 'draft') return 'neutral';
    return null;
  }

  count(f: CastingFilter): number {
    return f === 'all' ? this.calls().length : this.calls().filter(c => castingFilterOf(castingPublicationState(c)) === f).length;
  }

  /** The Full plan covers casting calls (from the fee quote): Publish needs no payment. */
  castingIncluded = signal(false);

  ngOnInit(): void {
    this.load();
    this.casting.getQuote('casting_announcement').subscribe({
      next: (q) => this.castingIncluded.set(!!q.included),
      error: () => { /* the fee path stays; the server decides at publish time */ },
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.casting.getMyCalls().subscribe({
      next: (list) => { this.calls.set(list); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  /** Publish: free with the Full plan, else pay the per-call fee (the call publishes itself once paid). */
  publish(c: CastingCall): void {
    if (c.status !== 'draft' || c.payment_status === 'Pending') return;
    if (new Date(c.deadline_at).getTime() <= Date.now()) {
      this.actionError.set('marketplace.producerCasting.deadlineFuture');
      return;
    }
    this.actionError.set(null);
    if (c.payment_status === 'Completed') {
      this.publishPaid(c);
      return;
    }
    if (this.castingIncluded()) {
      this.publishWith(c, this.casting.publishWithPlan(c.id));
      return;
    }
    this.purchase.set({
      titleKey: 'marketplace.producerCasting.publishTitle',
      descriptionKey: 'marketplace.producerCasting.publishDesc',
      quote: () => this.casting.getQuote('casting_announcement'),
      pendingKey: `service:casting:${c.id}`,
      returnTo: '/producer/casting',
      initiate: (phone) => this.casting.purchaseCall(c.id, phone),
    });
  }

  /** The fee is already paid (the deadline had passed when it was confirmed): publish without paying again. */
  private publishPaid(c: CastingCall): void {
    this.publishWith(c, this.casting.submitCall(c.id));
  }

  private publishWith(c: CastingCall, request: Observable<CastingCall>): void {
    this.closingId.set(c.id);
    request.subscribe({
      next: () => { this.closingId.set(null); this.load(); },
      error: (err: unknown) => {
        this.closingId.set(null);
        this.actionError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.actionFailed');
      },
    });
  }

  onPaid(): void {
    this.purchase.set(null);
    this.load();
  }

  closePurchase(): void {
    this.purchase.set(null);
    this.load();
  }

  closeCall(c: CastingCall): void {
    if (this.closingId()) return;
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.closingId.set(c.id);
    this.casting.closeCall(c.id).subscribe({
      next: () => {
        this.closingId.set(null);
        this.confirmCloseId.set(null);
        this.actionNotice.set('marketplace.producerCasting.closedNotice');
        this.load();
      },
      error: (err: unknown) => {
        this.closingId.set(null);
        this.confirmCloseId.set(null);
        this.actionError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.actionFailed');
      },
    });
  }
}
