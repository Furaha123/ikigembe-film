import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const BACKEND_URL = 'https://ikigembe-backend.onrender.com';
const TOKEN_KEY = 'ikigembe_token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);

  if (!req.url.startsWith(BACKEND_URL)) {
    return next(req);
  }

  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });

  return next(authReq);
};
