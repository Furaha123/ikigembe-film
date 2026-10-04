import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CastingService } from '../../services/casting.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
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
  imports: [CommonModule, RouterLink, TranslatePipe, PaymentModalComponent],
  templateUrl: './producer-casting.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
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

  count(f: CastingFilter): number {
    return f === 'all' ? this.calls().length : this.calls().filter(c => castingFilterOf(castingPublicationState(c)) === f).length;
  }

  ngOnInit(): void {
    this.load();
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

  /** Pay the announcement fee — the call publishes itself once the payment completes. */
  publish(c: CastingCall): void {
    if (c.status !== 'draft' || c.payment_status === 'Pending') return;
    if (new Date(c.deadline_at).getTime() <= Date.now()) {
      this.actionError.set('marketplace.producerCasting.deadlineFuture');
      return;
    }
    this.actionError.set(null);
    this.purchase.set({
      titleKey: 'marketplace.producerCasting.publishTitle',
      descriptionKey: 'marketplace.producerCasting.publishDesc',
      quote: () => this.casting.getQuote('casting_announcement'),
      pendingKey: `service:casting:${c.id}`,
      returnTo: '/producer/casting',
      initiate: (phone) => this.casting.purchaseCall(c.id, phone),
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
