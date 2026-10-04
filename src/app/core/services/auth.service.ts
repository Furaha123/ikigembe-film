import { Injectable, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, defer, firstValueFrom, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { RegisterPayload, RegisterResponse, LoginResponse, GoogleAuthPayload, LoginUser, AccountStatus } from '../models/auth.interface';
import { environment } from '../../../environments/environment';
import { RETURN_URL_PARAM, safeReturnUrl } from '../../shared/utils/safe-redirect';
import { toAccountStatus } from '../access/marketplace-access';
import { clearAllDrafts } from '../../shared/services/draft-store.service';

export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  role: string;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
  account_status?: string;
  studio_name?: string;
  suspension_reason?: string;
  onboarding_completed?: boolean;
}

export interface NotificationPreferences {
  notify_new_trailers: boolean;
  notify_new_movies: boolean;
  notify_promotions: boolean;
}

export type { RegisterPayload, RegisterErrors } from '../models/auth.interface';

/** Set on requests the auth interceptor must leave alone (the refresh call itself). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

// The refresh token lives in an httpOnly cookie set by the API, and the access
// token only in memory; localStorage holds nothing secret. SESSION_KEY is just
// a hint that a session cookie should exist, so a reload knows to refresh.
const SESSION_KEY     = 'ikigembe_session';
// Where tokens were kept before the cookie; a stored refresh token is traded for
// the cookie on the first refresh, then both keys are removed.
const LEGACY_TOKEN_KEY   = 'ikigembe_token';
const LEGACY_REFRESH_KEY = 'ikigembe_refresh';
const REFRESH_LOCK    = 'ikigembe-token-refresh';
const NAME_KEY        = 'ikigembe_name';
const EMAIL_KEY       = 'ikigembe_email';
const IS_STAFF_KEY    = 'ikigembe_is_staff';
const ROLE_KEY        = 'ikigembe_role';
const ACCT_STATUS_KEY = 'ikigembe_account_status';
const SUSPENSION_KEY  = 'ikigembe_suspension_reason';
const ONBOARDING_KEY  = 'ikigembe_onboarded';

/** Cooldown after a verification email was requested successfully. */
export const RESEND_COOLDOWN_SECONDS = 60;
/** Cooldown after the backend's rate limit (3/hour per IP + email) answered 429. */
export const RESEND_RATE_LIMITED_COOLDOWN_SECONDS = 15 * 60;

/**
 * Outcome of a resend-verification request, shaped for the three pages that offer it.
 * `message` is a translation key or backend text; null when there is nothing to add.
 * Success is reported identically whether or not the email has an account (the backend
 * returns 200 either way to prevent account enumeration).
 */
export interface ResendVerificationResult {
  sent: boolean;
  message: string | null;
  cooldownSeconds: number;
}

/** Label for a running resend cooldown: seconds under a minute, whole minutes above. */
export function resendCooldownLabel(seconds: number): { key: string; n: number } {
  return seconds > 60
    ? { key: 'auth.common.resendInMinutes', n: Math.ceil(seconds / 60) }
    : { key: 'auth.common.resendIn', n: seconds };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  readonly baseUrl = environment.apiUrl;

  /** In memory only: page scripts can't find it in storage, and it dies with the tab. */
  private accessToken: string | null = null;
  private refreshInFlight: Observable<string> | null = null;
  /** `/auth/me/` once per session, so role and account status are current (see syncProfile). */
  private profileSync: Observable<void> | null = null;

  readonly isLoggedIn = signal<boolean>(
    isPlatformBrowser(this.platformId)
      ? localStorage.getItem(SESSION_KEY) === '1' || !!localStorage.getItem(LEGACY_REFRESH_KEY)
      : false
  );

  readonly isAdmin = signal<boolean>(
    isPlatformBrowser(this.platformId) ? localStorage.getItem(IS_STAFF_KEY) === '1' : false
  );

  readonly userName = signal<string>(
    isPlatformBrowser(this.platformId) ? (localStorage.getItem(NAME_KEY) ?? '') : ''
  );

  readonly userEmail = signal<string>(
    isPlatformBrowser(this.platformId) ? (localStorage.getItem(EMAIL_KEY) ?? '') : ''
  );

  readonly userRole = signal<string>(
    isPlatformBrowser(this.platformId) ? (localStorage.getItem(ROLE_KEY) ?? 'Viewer') : 'Viewer'
  );

  readonly accountStatus = signal<AccountStatus>(
    isPlatformBrowser(this.platformId)
      ? toAccountStatus(localStorage.getItem(ACCT_STATUS_KEY))
      : 'active'
  );

  readonly suspensionReason = signal<string>(
    isPlatformBrowser(this.platformId) ? (localStorage.getItem(SUSPENSION_KEY) ?? '') : ''
  );

  readonly onboardingComplete = signal<boolean>(
    isPlatformBrowser(this.platformId) ? localStorage.getItem(ONBOARDING_KEY) === '1' : false
  );

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Signed out in another tab: this tab's in-memory token must go too.
      window.addEventListener('storage', (e) => {
        if (e.key === SESSION_KEY && e.newValue === null && this.isLoggedIn()) this.clearSession();
      });
    }
  }

  readonly initials = computed(() => {
    const name = this.userName().trim();
    if (name) {
      const parts = name.split(' ').filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    const email = this.userEmail().trim();
    if (email) return email.slice(0, 2).toUpperCase();
    return '?';
  });

  register(payload: RegisterPayload) {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/auth/register/`, payload).pipe(
      tap(() => {
        const name = `${payload.first_name} ${payload.last_name}`.trim();
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem(NAME_KEY, name);
        }
        this.userName.set(name);
      })
    );
  }

  completeOnboarding() {
    this.onboardingComplete.set(true);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(ONBOARDING_KEY, '1');
    }
  }

  setAccountStatus(status: AccountStatus, reason?: string) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(ACCT_STATUS_KEY, status);
      if (reason) localStorage.setItem(SUSPENSION_KEY, reason);
      else localStorage.removeItem(SUSPENSION_KEY);
    }
    this.accountStatus.set(status);
    this.suspensionReason.set(reason ?? '');
  }

  login(identifier: string, password: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/login/`, { identifier, password }).pipe(
      tap((res) => {
        this.storeSession(res, identifier);
      })
    );
  }

  loginWithGoogle(idToken: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/google/`, { id_token: idToken } as GoogleAuthPayload).pipe(
      tap((res) => {
        this.storeSession(res);
      })
    );
  }

  private storeSession(res: LoginResponse, fallbackEmail?: string) {
    const token =
      res?.AuthenticationResult?.AccessToken ??
      res?.AuthenticationResult?.IdToken ??
      res?.AccessToken ??
      res?.access_token ??
      res?.access ??
      res?.token ??
      res?.key;

    // The refresh token arrives as an httpOnly cookie; any copy in the body is ignored.
    if (token && isPlatformBrowser(this.platformId)) {
      this.accessToken = token;
      localStorage.setItem(SESSION_KEY, '1');
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_REFRESH_KEY);
      this.isLoggedIn.set(true);
    }

    const u: LoginUser | undefined = res?.user;
    const name = [u?.first_name ?? res?.first_name, u?.last_name ?? res?.last_name].filter(Boolean).join(' ');
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(NAME_KEY, name);
      this.userName.set(name);
    }

    const resolvedEmail = u?.email ?? res?.email ?? fallbackEmail;
    if (resolvedEmail && isPlatformBrowser(this.platformId)) {
      localStorage.setItem(EMAIL_KEY, resolvedEmail);
      this.userEmail.set(resolvedEmail);
    }

    const onboarded = u?.onboarding_completed ?? false;
    this.onboardingComplete.set(onboarded);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(ONBOARDING_KEY, onboarded ? '1' : '0');
    }

    const isStaff = u?.is_staff ?? false;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(IS_STAFF_KEY, isStaff ? '1' : '0');
    }
    this.isAdmin.set(isStaff);

    const role = u?.role ?? roleClaim(token) ?? 'Viewer';
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(ROLE_KEY, role);
    }
    this.userRole.set(role);

    const status = ((res as any)?.user?.account_status ?? (res as any)?.account_status) as AccountStatus | undefined;
    if (status && isPlatformBrowser(this.platformId)) {
      const normalised = toAccountStatus(status);
      localStorage.setItem(ACCT_STATUS_KEY, normalised);
      this.accountStatus.set(normalised);
    }
    // The response carried the user, so role and status are already current.
    if (u) this.profileSync = of(undefined);
  }

  /** The role in a fresh access token is authoritative: the stored hint may be stale. */
  private applyRoleClaim(token: string) {
    const role = roleClaim(token);
    if (!role || role === this.userRole()) return;
    localStorage.setItem(ROLE_KEY, role);
    this.userRole.set(role);
  }

  /**
   * Brings role, staff flag and account status up to date from `/auth/me/`, once
   * per session (shared by concurrent callers). Never errors: on failure the
   * stored values stay. Role-restricted marketplace requests and guards wait for it.
   */
  syncProfile(): Observable<void> {
    if (!isPlatformBrowser(this.platformId) || !this.isLoggedIn()) return of(undefined);
    if (!this.profileSync) {
      this.profileSync = this.getMe().pipe(
        tap(profile => this.applyProfile(profile)),
        map(() => undefined),
        catchError(() => {
          this.profileSync = null; // try again next time
          return of(undefined);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.profileSync;
  }

  private applyProfile(profile: UserProfile) {
    if (!this.isLoggedIn()) return;
    if (profile.role) {
      localStorage.setItem(ROLE_KEY, profile.role);
      this.userRole.set(profile.role);
    }
    if (typeof profile.is_staff === 'boolean') {
      localStorage.setItem(IS_STAFF_KEY, profile.is_staff ? '1' : '0');
      this.isAdmin.set(profile.is_staff);
    }
    if (profile.account_status) {
      this.setAccountStatus(toAccountStatus(profile.account_status), profile.suspension_reason || undefined);
    }
  }

  /** Current access token (browser only). For requests HttpClient can't make, e.g. keepalive fetch on unload. */
  getAccessToken(): string | null {
    return isPlatformBrowser(this.platformId) ? this.accessToken : null;
  }

  /**
   * The access token for an API request: the one in memory, or — after a reload,
   * when only the cookie survives — a fresh one. `null` when signed out.
   */
  ensureAccessToken(): Observable<string | null> {
    if (!isPlatformBrowser(this.platformId)) return of(null);
    if (this.accessToken) return of(this.accessToken);
    if (!this.isLoggedIn()) return of(null);
    return this.refreshAccessToken().pipe(catchError(() => of(null)));
  }

  /**
   * Trade the refresh cookie for a new access token. Concurrent callers share one
   * request. Pass the token the API just rejected: if another request has already
   * replaced it, that newer token is returned without a second refresh.
   * If the API rejects the refresh, the session is over: it is cleared and the
   * user is sent to sign in.
   */
  refreshAccessToken(rejected?: string): Observable<string> {
    if (rejected && this.accessToken && this.accessToken !== rejected) return of(this.accessToken);
    if (!this.refreshInFlight) {
      this.refreshInFlight = defer(() => this.withRefreshLock(() => firstValueFrom(this.requestRefresh()))).pipe(
        finalize(() => { this.refreshInFlight = null; }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshInFlight;
  }

  private requestRefresh(): Observable<string> {
    const legacy = localStorage.getItem(LEGACY_REFRESH_KEY);
    return this.http.post<{ access: string }>(
      `${this.baseUrl}/auth/token/refresh/`,
      legacy ? { refresh: legacy } : {},
      { context: new HttpContext().set(SKIP_AUTH, true) },
    ).pipe(
      map((res) => {
        this.accessToken = res.access;
        this.applyRoleClaim(res.access);
        localStorage.setItem(SESSION_KEY, '1');
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(LEGACY_REFRESH_KEY);
        return res.access;
      }),
      catchError((err: unknown) => {
        const ended = err instanceof HttpErrorResponse && (err.status === 400 || err.status === 401);
        if (ended && this.isLoggedIn()) {
          this.clearSession();
          // Come back to the same page after signing in again ('/' only redirects to /login).
          const here = safeReturnUrl(this.router.url);
          void this.router.navigateByUrl(here && here !== '/'
            ? this.router.createUrlTree(['/login'], { queryParams: { [RETURN_URL_PARAM]: here } })
            : '/login');
        }
        return throwError(() => err);
      }),
    );
  }

  /**
   * Refresh tokens rotate, so tabs sharing the cookie must not refresh at the same
   * time: the second request would carry a token the first just revoked.
   */
  private withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks ? locks.request(REFRESH_LOCK, task) : task();
  }

  logout(onDone?: () => void) {
    // The API revokes the cookie's refresh token and clears the cookie.
    const legacy = isPlatformBrowser(this.platformId) ? localStorage.getItem(LEGACY_REFRESH_KEY) : null;
    this.http.post(`${this.baseUrl}/auth/logout/`, legacy ? { refresh: legacy } : {}).subscribe({
      complete: () => { this.clearSession(); onDone?.(); },
      error: () => { this.clearSession(); onDone?.(); },
    });
  }

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.baseUrl}/auth/me/`);
  }

  updateProfile(payload: { first_name: string; last_name: string; phone_number: string }): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.baseUrl}/auth/me/`, payload);
  }

  getNotifications(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.baseUrl}/auth/notifications/`);
  }

  updateNotifications(prefs: Partial<NotificationPreferences>): Observable<NotificationPreferences> {
    return this.http.patch<NotificationPreferences>(`${this.baseUrl}/auth/notifications/`, prefs);
  }

  upgradeToProducer(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/upgrade-to-producer/`, {}).pipe(
      tap((res) => this.storeSession(res))
    );
  }

  changePassword(current_password: string, new_password: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/change-password/`, { current_password, new_password });
  }

  forgotPassword(identifier: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/forgot-password/`, { identifier });
  }

  resetPassword(token: string, new_password: string, confirm_password: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/reset-password/`, { token, new_password, confirm_password });
  }

  /** Verify an email link's token. The API answers with a new session, so the user is signed in. */
  verifyEmail(token: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/verify-email/`, { token }).pipe(
      tap((res) => this.storeSession(res))
    );
  }

  /** Where a signed-in user lands: producer onboarding until it is done, otherwise the catalogue. */
  homeUrl(): string {
    return this.userRole() === 'Producer' && !this.onboardingComplete() ? '/producer/onboarding' : '/browse';
  }

  /** Where to go after signing in: the requested page if it is safe, unless producer onboarding comes first. */
  postLoginUrl(returnUrl: string | null | undefined): string {
    const home = this.homeUrl();
    if (home === '/producer/onboarding') return home;
    return safeReturnUrl(returnUrl) ?? home;
  }

  resendVerification(email: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/resend-verification/`, { email });
  }

  /**
   * Request a new verification email and map the response for the UI (never errors):
   * 200 → sent + short cooldown; 429 → translated "too many requests" + long cooldown
   * (the backend's `detail` is English, so it isn't shown); other errors → backend text.
   */
  requestVerificationEmail(email: string): Observable<ResendVerificationResult> {
    return this.resendVerification(email).pipe(
      map((): ResendVerificationResult => ({ sent: true, message: null, cooldownSeconds: RESEND_COOLDOWN_SECONDS })),
      catchError((err: unknown) => {
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (status === 429) {
          return of<ResendVerificationResult>({
            sent: false, message: 'auth.common.resendTooMany', cooldownSeconds: RESEND_RATE_LIMITED_COOLDOWN_SECONDS,
          });
        }
        const body = err instanceof HttpErrorResponse ? err.error as { detail?: string; email?: string[] } | null : null;
        return of<ResendVerificationResult>({
          sent: false, message: body?.detail ?? body?.email?.[0] ?? null, cooldownSeconds: 0,
        });
      }),
    );
  }

  private clearSession() {
    this.accessToken = null;
    this.profileSync = null;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_REFRESH_KEY);
      localStorage.removeItem(NAME_KEY);
      localStorage.removeItem(EMAIL_KEY);
      localStorage.removeItem(IS_STAFF_KEY);
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(ACCT_STATUS_KEY);
      localStorage.removeItem(SUSPENSION_KEY);
      localStorage.removeItem(ONBOARDING_KEY);
      clearAllDrafts();
    }
    this.isLoggedIn.set(false);
    this.isAdmin.set(false);
    this.userRole.set('Viewer');
    this.userName.set('');
    this.userEmail.set('');
    this.accountStatus.set('active');
    this.suspensionReason.set('');
    this.onboardingComplete.set(false);
  }
}

/** The `role` claim of a JWT access token, or null if it can't be read. Never verifies the token. */
function roleClaim(token: string | undefined | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload || typeof atob !== 'function') return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' && role ? role : null;
  } catch {
    return null;
  }
}
