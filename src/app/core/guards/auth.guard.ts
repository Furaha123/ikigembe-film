import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { RETURN_URL_PARAM } from '../../shared/utils/safe-redirect';

/** Sends a signed-out visitor to sign in, remembering where they were going. */
export function loginRedirect(router: Router, returnUrl: string) {
  return router.createUrlTree(['/login'], { queryParams: { [RETURN_URL_PARAM]: returnUrl } });
}

export const authGuard: CanActivateFn = (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isLoggedIn()) return true;
  return loginRedirect(router, state.url);
};

export const guestGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const authService = inject(AuthService);
  const router = inject(Router);
  if (!authService.isLoggedIn()) return true;

  return router.createUrlTree(['/browse']);
};

export const viewerGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  return true;
};
