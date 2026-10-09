import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { loginRedirect } from '../../core/guards/auth.guard';
import { isReadyProducer } from '../../core/access/marketplace-access';
import { map } from 'rxjs/operators';

export const producerGuard: CanActivateFn = (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn() && auth.userRole() === 'Producer') return true;
  if (auth.isLoggedIn()) return router.createUrlTree(['/browse']);
  return loginRedirect(router, state.url);
};

/**
 * Film upload needs a finished producer setup: profile completed and agreement signed (the API
 * refuses otherwise). Waits for the profile sync so a stale stored hint never decides; producers
 * who haven't finished land on their dashboard, whose banner links to the missing step.
 */
export const readyProducerGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.syncProfile().pipe(
    map(() => isReadyProducer({ role: 'Producer', accountStatus: auth.accountStatus(), producerReady: auth.producerReady() })
      ? true
      : router.createUrlTree(['/producer/dashboard'])),
  );
};
