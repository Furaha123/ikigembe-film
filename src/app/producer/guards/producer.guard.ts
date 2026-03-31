import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

export const producerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn() && auth.userRole() === 'Producer') return true;
  if (auth.isLoggedIn()) return router.createUrlTree(['/browse']);
  return router.createUrlTree(['/login']);
};

export const producerGuestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn() && auth.userRole() === 'Producer') {
    return router.createUrlTree(['/producer/dashboard']);
  }
  return true;
};
