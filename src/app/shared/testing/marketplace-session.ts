import { Provider, signal } from '@angular/core';
import { of } from 'rxjs';
import { MARKETPLACE_SESSION, MarketplaceSession } from '../../core/access/marketplace-access.service';
import { AccountStatus, MarketplaceUser, Role } from '../../core/access/marketplace-access';

/** A marketplace user for specs; status defaults to `active` and producers to a finished setup. */
export function marketplaceUser(
  role: Role, accountStatus: AccountStatus = 'active', producerReady = role === 'Producer',
): MarketplaceUser {
  return role === 'Producer' ? { role, accountStatus, producerReady } : { role, accountStatus };
}

/** Signs `user` (null = signed out) into the marketplace access layer, already resolved (spec-only helper). */
export function provideMarketplaceUser(user: MarketplaceUser | null): Provider {
  const session: MarketplaceSession = { user: signal(user), resolved: () => of(null) };
  return { provide: MARKETPLACE_SESSION, useValue: session };
}
