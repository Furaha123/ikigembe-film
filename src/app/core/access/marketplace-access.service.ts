import { Injectable, InjectionToken, Signal, computed, inject, isDevMode } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, defer, throwError } from 'rxjs';
import { switchMap, take, tap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import {
  MarketplaceFeature, MarketplaceFeatureKey, MarketplaceUser,
  can, inactiveNoticeFor, marketplaceHomeFor, marketplaceTabsFor, toRole,
} from './marketplace-access';

/** Who is signed in, as the marketplace needs it. Replaced in tests (`provideMarketplaceUser`). */
export interface MarketplaceSession {
  /** null when signed out. */
  user: Signal<MarketplaceUser | null>;
  /** Completes once role and account status are current; nothing is decided before. */
  resolved(): Observable<unknown>;
}

export const MARKETPLACE_SESSION = new InjectionToken<MarketplaceSession>('MARKETPLACE_SESSION', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(AuthService);
    return {
      user: computed(() => auth.isLoggedIn()
        ? { role: toRole(auth.userRole(), auth.isAdmin()), accountStatus: auth.accountStatus() }
        : null),
      resolved: () => auth.syncProfile(),
    };
  },
});

/** Thrown instead of sending a request the signed-in user isn't allowed to make. */
export class MarketplaceAccessError extends Error {
  constructor(readonly feature: MarketplaceFeatureKey) {
    super(`Marketplace feature "${feature}" is not available to this account.`);
    this.name = 'MarketplaceAccessError';
  }
}

/**
 * Signals and helpers over the permission map for components, guards and the
 * marketplace API services. Components never compare roles themselves.
 */
@Injectable({ providedIn: 'root' })
export class MarketplaceAccessService {
  private readonly session = inject(MARKETPLACE_SESSION);

  readonly user = this.session.user;
  readonly tabs = computed<MarketplaceFeature[]>(() => marketplaceTabsFor(this.user()));
  readonly home = computed(() => marketplaceHomeFor(this.user()));
  /** 'suspended' / 'notActive' when the account can't use the actor or producer features. */
  readonly inactiveNotice = computed(() => inactiveNoticeFor(this.user()));

  can(feature: MarketplaceFeatureKey): boolean {
    return can(this.user(), feature);
  }

  /** Completes once role and status are current (immediately after the first time). */
  resolved(): Observable<unknown> {
    return this.session.resolved().pipe(take(1));
  }

  /**
   * Sends `send()` only if the user may use `feature`, after the role is known;
   * otherwise fails with MarketplaceAccessError without touching the network.
   * A 403 that still comes back is a bug in the map: it is logged in development.
   */
  request<T>(feature: MarketplaceFeatureKey, send: () => Observable<T>): Observable<T> {
    return defer(() => this.resolved()).pipe(
      switchMap(() => {
        if (!this.can(feature)) {
          if (isDevMode()) console.warn(`[marketplace] blocked a "${feature}" request for`, this.user());
          return throwError(() => new MarketplaceAccessError(feature));
        }
        return send().pipe(tap({
          error: (err: unknown) => {
            if (isDevMode() && err instanceof HttpErrorResponse && err.status === 403) {
              console.error(`[marketplace] 403 on "${feature}" (${err.url}) — the access map and the API disagree`, this.user(), err.error);
            }
          },
        }));
      }),
    );
  }
}
