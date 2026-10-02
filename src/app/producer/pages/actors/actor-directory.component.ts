import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CastingService } from '../../services/casting.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import {
  ActorGender, ActorSearchAccess, DirectoryActor, DirectoryFilters, ServicePurchase, ShortlistEntry,
} from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';

type Tab = 'search' | 'shortlist';

@Component({
  selector: 'app-actor-directory',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, PaymentModalComponent],
  templateUrl: './actor-directory.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorDirectoryComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly casting = inject(CastingService);

  readonly genders: ActorGender[] = ['female', 'male', 'other'];

  access        = signal<ActorSearchAccess | null>(null);
  accessLoading = signal(true);
  /** Set when the pass expired mid-session (a 403 from a directory call). */
  expired       = signal(false);
  purchase      = signal<ServicePurchase | null>(null);
  tab           = signal<Tab>('search');

  actors      = signal<DirectoryActor[]>([]);
  page        = signal(1);
  totalPages  = signal(0);
  totalCount  = signal(0);
  searching   = signal(false);
  error       = signal<string | null>(null);

  shortlist         = signal<ShortlistEntry[]>([]);
  shortlistedIds    = signal<Set<number>>(new Set());
  shortlistBusyId   = signal<number | null>(null);

  filters = this.fb.nonNullable.group({
    q: [''],
    gender: ['' as ActorGender | ''],
    min_age: [null as number | null],
    max_age: [null as number | null],
    location: [''],
    skill: [''],
    language: [''],
  });

  ngOnInit(): void {
    this.checkAccess();
  }

  checkAccess(): void {
    this.accessLoading.set(true);
    this.casting.getSearchAccess().subscribe({
      next: (a) => {
        this.access.set(a);
        this.accessLoading.set(false);
        if (a.active) {
          this.expired.set(false);
          this.search(1);
          this.loadShortlist();
        }
      },
      error: (err: unknown) => {
        this.accessLoading.set(false);
        this.access.set({ active: false, expires_at: null });
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  buyAccess(): void {
    this.purchase.set({
      titleKey: 'marketplace.directory.purchaseTitle',
      descriptionKey: 'marketplace.directory.purchaseDesc',
      pendingKey: 'service:actor_search',
      returnTo: '/producer/actors',
      initiate: (phone) => this.casting.purchaseSearch(phone),
    });
  }

  onPaid(): void {
    this.purchase.set(null);
    this.checkAccess();
  }

  search(page = 1): void {
    const v = this.filters.getRawValue();
    const f: DirectoryFilters = { ...v, page };
    this.searching.set(true);
    this.error.set(null);
    this.casting.searchActors(f).subscribe({
      next: (res) => {
        this.searching.set(false);
        this.actors.set(res.results);
        this.page.set(res.page);
        this.totalPages.set(res.total_pages);
        this.totalCount.set(res.total_results);
      },
      error: (err: HttpErrorResponse) => this.handleError(err, () => this.searching.set(false)),
    });
  }

  resetFilters(): void {
    this.filters.reset();
    this.search(1);
  }

  loadShortlist(): void {
    this.casting.getShortlist().subscribe({
      next: (list) => {
        this.shortlist.set(list);
        this.shortlistedIds.set(new Set(list.map(e => e.actor.id)));
      },
      error: (err: HttpErrorResponse) => this.handleError(err),
    });
  }

  addToShortlist(actor: DirectoryActor): void {
    this.shortlistBusyId.set(actor.id);
    this.casting.addToShortlist(actor.id).subscribe({
      next: () => { this.shortlistBusyId.set(null); this.loadShortlist(); },
      error: (err: HttpErrorResponse) => {
        this.shortlistBusyId.set(null);
        if (err.status === 409) { this.loadShortlist(); return; } // already there
        this.handleError(err);
      },
    });
  }

  removeFromShortlist(actorId: number): void {
    this.shortlistBusyId.set(actorId);
    this.casting.removeFromShortlist(actorId).subscribe({
      next: () => { this.shortlistBusyId.set(null); this.loadShortlist(); },
      error: (err: HttpErrorResponse) => { this.shortlistBusyId.set(null); this.handleError(err); },
    });
  }

  /** A 403 means the pass is gone (expired mid-session) — back to the purchase screen. */
  private handleError(err: HttpErrorResponse, done?: () => void): void {
    done?.();
    if (err.status === 403) {
      this.expired.set(true);
      this.access.set({ active: false, expires_at: null });
      this.actors.set([]);
      this.shortlist.set([]);
      return;
    }
    this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
  }
}
