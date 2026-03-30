import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { throwError, BehaviorSubject, Observable } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';

const BACKEND_URL = 'https://ikigembe-backend.onrender.com';
const TOKEN_KEY   = 'ikigembe_token';
const REFRESH_KEY = 'ikigembe_refresh';

// Shared refresh state — prevents multiple simultaneous refresh calls
let isRefreshing = false;
const refreshDone$ = new BehaviorSubject<string | null>(null);

function addBearer(req: HttpRequest<unknown>, token: string) {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function getToken()   { return localStorage.getItem(TOKEN_KEY); }
function getRefresh() { return localStorage.getItem(REFRESH_KEY); }
function saveToken(token: string) { localStorage.setItem(TOKEN_KEY, token); }

function doRefresh(http: HttpClient): Observable<string> {
  const refresh = getRefresh();
  return new Observable(observer => {
    if (!refresh) {
      observer.error('No refresh token');
      return;
    }
    http.post<{ access: string }>(
      `${BACKEND_URL}/api/auth/token/refresh/`,
      { refresh }
    ).subscribe({
      next: (res) => {
        saveToken(res.access);
        observer.next(res.access);
        observer.complete();
      },
      error: (err) => observer.error(err),
    });
  });
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const platformId = inject(PLATFORM_ID);
  const http       = inject(HttpClient);

  // Only intercept requests to our backend
  if (!req.url.startsWith(BACKEND_URL)) return next(req);

  // Skip token injection on SSR
  if (!isPlatformBrowser(platformId)) return next(req);

  // Attach current access token
  const token = getToken();
  const authReq = token ? addBearer(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only handle 401 — and don't retry the refresh endpoint itself
      if (error.status !== 401 || req.url.includes('/auth/token/refresh/')) {
        return throwError(() => error);
      }

      if (isRefreshing) {
        // Another refresh is already in flight — wait for it then retry
        return refreshDone$.pipe(
          filter(t => t !== null),
          take(1),
          switchMap(newToken => next(addBearer(req, newToken!)))
        );
      }

      isRefreshing = true;
      refreshDone$.next(null);

      return doRefresh(http).pipe(
        switchMap(newToken => {
          isRefreshing = false;
          refreshDone$.next(newToken);
          return next(addBearer(req, newToken));
        }),
        catchError(refreshErr => {
          isRefreshing = false;
          refreshDone$.next(null);
          // Refresh failed — clear session and redirect to login
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_KEY);
          window.location.href = '/login';
          return throwError(() => refreshErr);
        })
      );
    })
  );
};
