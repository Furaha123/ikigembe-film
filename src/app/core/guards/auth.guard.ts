import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isLoggedIn()) return true;
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const authService = inject(AuthService);
  const router = inject(Router);
  if (!authService.isLoggedIn()) return true;

  if (authService.isAdmin()) return router.createUrlTree(['/admin/dashboard']);
  if (authService.userRole() === 'Producer') return router.createUrlTree(['/producer/dashboard']);
  return router.createUrlTree(['/browse']);
};

export const viewerGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isAdmin()) return router.createUrlTree(['/admin/dashboard']);
  if (authService.userRole() === 'Producer') return router.createUrlTree(['/producer/dashboard']);
  return true;
};
