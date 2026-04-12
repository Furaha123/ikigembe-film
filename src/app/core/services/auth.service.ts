import { Injectable, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RegisterPayload, RegisterResponse, LoginResponse, GoogleAuthPayload, LoginUser } from '../models/auth.interface';
import { environment } from '../../../environments/environment';

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
}

export interface NotificationPreferences {
  notify_new_trailers: boolean;
  notify_new_movies: boolean;
  notify_promotions: boolean;
}

export type { RegisterPayload, RegisterErrors } from '../models/auth.interface';

const TOKEN_KEY    = 'ikigembe_token';
const REFRESH_KEY  = 'ikigembe_refresh';
const NAME_KEY     = 'ikigembe_name';
const EMAIL_KEY    = 'ikigembe_email';
const IS_STAFF_KEY = 'ikigembe_is_staff';
const ROLE_KEY     = 'ikigembe_role';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  readonly baseUrl = environment.apiUrl;

  readonly isLoggedIn = signal<boolean>(
    isPlatformBrowser(this.platformId) ? !!localStorage.getItem(TOKEN_KEY) : false
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

    if (token && isPlatformBrowser(this.platformId)) {
      localStorage.setItem(TOKEN_KEY, token);
      this.isLoggedIn.set(true);
    }

    const refresh =
      res?.AuthenticationResult?.RefreshToken ??
      res?.refresh ??
      res?.refresh_token;
    if (refresh && isPlatformBrowser(this.platformId)) {
      localStorage.setItem(REFRESH_KEY, refresh);
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

    const isStaff = u?.is_staff ?? false;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(IS_STAFF_KEY, isStaff ? '1' : '0');
    }
    this.isAdmin.set(isStaff);

    const role = u?.role ?? 'Viewer';
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(ROLE_KEY, role);
    }
    this.userRole.set(role);
  }

  logout(onDone?: () => void) {
    const token = isPlatformBrowser(this.platformId) ? localStorage.getItem(TOKEN_KEY) : null;
    const refresh = isPlatformBrowser(this.platformId) ? localStorage.getItem(REFRESH_KEY) : null;
    const headers: Record<string, string> = token ? { Authorization: `Token ${token}` } : {};
    const body = refresh ? { refresh } : {};

    this.http.post(`${this.baseUrl}/auth/logout/`, body, { headers }).subscribe({
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

  changePassword(current_password: string, new_password: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/change-password/`, { current_password, new_password });
  }

  private clearSession() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(NAME_KEY);
      localStorage.removeItem(EMAIL_KEY);
      localStorage.removeItem(IS_STAFF_KEY);
      localStorage.removeItem(ROLE_KEY);
    }
    this.isLoggedIn.set(false);
    this.isAdmin.set(false);
    this.userRole.set('Viewer');
    this.userName.set('');
    this.userEmail.set('');
  }
}
