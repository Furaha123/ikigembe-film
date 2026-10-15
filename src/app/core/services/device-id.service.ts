import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/** Pre-server-issued ids: a raw UUID the browser made itself. Kept (never deleted) and sent as `legacy_id`. */
export const DEVICE_ID_KEY = 'ikigembe_device_id';
/** Server-issued, signed device id for the signed-in user: JSON `{ user, id }`. */
export const DEVICE_KEY = 'ikigembe_device';

interface StoredDevice { user: string; id: string; }
interface DeviceResponse { device_id: string; enforced: boolean; }

/**
 * Device label for the single-device view policy. The id is issued by the API
 * (`POST /movies/device/`), signed and bound to the signed-in account, and sent as
 * `X-Device-Id` on /movies/<id>/stream/ only. It is not a credential for anything
 * but device binding (copying it to another browser is the residual risk; this is
 * not DRM), so localStorage is acceptable. Returns null during SSR.
 */
@Injectable({ providedIn: 'root' })
export class DeviceIdService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private cached: StoredDevice | null = null;
  private inFlight: Observable<string | null> | null = null;

  /** The signed device id for the current user, requesting one from the API when needed. */
  getId(): Observable<string | null> {
    if (!isPlatformBrowser(this.platformId)) return of(null);
    const user = this.userKey();
    const stored = this.cached ?? this.read();
    if (stored && stored.user === user) {
      this.cached = stored;
      return of(stored.id);
    }
    return this.issue(user);
  }

  /** Forget the stored id (the API answered `device_invalid`); the next getId() asks for a new one. */
  reset(): void {
    this.cached = null;
    this.inFlight = null;
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.removeItem(DEVICE_KEY); } catch { /* storage blocked */ }
  }

  private issue(user: string): Observable<string | null> {
    if (this.inFlight) return this.inFlight;
    const legacy = this.legacyId();
    const body = legacy ? { legacy_id: legacy } : {};
    this.inFlight = this.http.post<DeviceResponse>(`${environment.apiUrl}/movies/device/`, body).pipe(
      map(res => {
        const device = { user, id: res.device_id };
        this.cached = device;
        try { localStorage.setItem(DEVICE_KEY, JSON.stringify(device)); } catch { /* keep it in memory */ }
        return res.device_id;
      }),
      // No id: /stream/ answers 400/403 and the page shows its usual error.
      catchError(() => of(null)),
      finalize(() => { this.inFlight = null; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inFlight;
  }

  private userKey(): string {
    return this.auth.userEmail() || this.auth.userName() || '';
  }

  private read(): StoredDevice | null {
    try {
      const raw = localStorage.getItem(DEVICE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredDevice>;
      return typeof parsed?.id === 'string' && typeof parsed.user === 'string'
        ? { user: parsed.user, id: parsed.id } : null;
    } catch {
      return null;
    }
  }

  private legacyId(): string | null {
    try {
      const raw = localStorage.getItem(DEVICE_ID_KEY);
      return raw && /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : null;
    } catch {
      return null;
    }
  }
}
