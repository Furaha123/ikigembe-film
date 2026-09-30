import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService, SKIP_AUTH } from '../services/auth.service';
import { environment } from '../../../environments/environment';

function withBearer(req: HttpRequest<unknown>, token: string) {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Adds the in-memory access token to API requests. On a 401 it refreshes the
 * token once (from the httpOnly cookie) and retries; if the refresh is refused,
 * AuthService ends the session.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH) || !req.url.startsWith(environment.apiUrl)) return next(req);

  const auth = inject(AuthService);
  return auth.ensureAccessToken().pipe(
    switchMap((token) => next(token ? withBearer(req, token) : req).pipe(
      catchError((error: unknown) => {
        if (!token || !(error instanceof HttpErrorResponse) || error.status !== 401) {
          return throwError(() => error);
        }
        return auth.refreshAccessToken(token).pipe(
          catchError(() => throwError(() => error)),
          switchMap((fresh) => next(withBearer(req, fresh))),
        );
      }),
    )),
  );
};
