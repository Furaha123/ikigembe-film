import { Injectable, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { RegisterPayload, RegisterResponse, LoginResponse } from '../models/auth.interface';

export type { RegisterPayload, RegisterErrors } from '../models/auth.interface';

const TOKEN_KEY = 'ikigembe_token';
const NAME_KEY = 'ikigembe_name';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly baseUrl = 'https://ikigembe-backend.onrender.com/api';

  readonly isLoggedIn = signal<boolean>(
    isPlatformBrowser(this.platformId) ? !!localStorage.getItem(TOKEN_KEY) : false
  );

  readonly userName = signal<string>(
    isPlatformBrowser(this.platformId) ? (localStorage.getItem(NAME_KEY) ?? '') : ''
  );

  readonly initials = computed(() => {
    const parts = this.userName().trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return '??';
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

  login(email: string, password: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/login/`, { email, password }).pipe(
      tap((res) => {
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
        const name = [res?.first_name, res?.last_name].filter(Boolean).join(' ');
        if (name && isPlatformBrowser(this.platformId)) {
          localStorage.setItem(NAME_KEY, name);
          this.userName.set(name);
        }
      })
    );
  }

  logout() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NAME_KEY);
    }
    this.isLoggedIn.set(false);
    this.userName.set('');
  }
}
