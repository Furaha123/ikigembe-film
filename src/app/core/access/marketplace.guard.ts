import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { MarketplaceAccessService } from './marketplace-access.service';
import { MarketplaceFeatureKey } from './marketplace-access';

/** Route data key naming the marketplace feature a route belongs to. */
export const MARKETPLACE_FEATURE = 'marketplaceFeature';

/** Route data for a marketplace route: `data: marketplaceRoute('find-actors')`. */
export function marketplaceRoute(feature: MarketplaceFeatureKey, extra: Record<string, unknown> = {}) {
  return { ...extra, [MARKETPLACE_FEATURE]: feature };
}

/**
 * Lets the route through only if the access map allows its feature; otherwise
 * redirects to the user's marketplace home before the page (and its requests) load.
 * Put it after `authGuard`, which handles signed-out visitors.
 */
export const marketplaceGuard: CanActivateFn = (route) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const access = inject(MarketplaceAccessService);
  const router = inject(Router);
  const feature = route.data[MARKETPLACE_FEATURE] as MarketplaceFeatureKey | undefined;
  return access.resolved().pipe(
    map(() => (feature && access.can(feature)) ? true : router.parseUrl(access.home())),
  );
};
