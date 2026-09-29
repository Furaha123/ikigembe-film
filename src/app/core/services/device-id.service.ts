import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export const DEVICE_ID_KEY = 'ikigembe_device_id';

/**
 * Stable per-browser identifier for the single-device view policy. Created once
 * and reused forever. It is not a secret — only an opaque device label sent as
 * `X-Device-Id` to /movies/<id>/stream/. Returns null during SSR.
 */
@Injectable({ providedIn: 'root' })
export class DeviceIdService {
  private readonly platformId = inject(PLATFORM_ID);
  private cached: string | null = null;

  getId(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (this.cached) return this.cached;

    let id: string | null = null;
    try {
      id = localStorage.getItem(DEVICE_ID_KEY);
    } catch { /* storage blocked — fall through to an in-memory id */ }

    if (!id) {
      id = this.generate();
      try {
        localStorage.setItem(DEVICE_ID_KEY, id);
      } catch { /* keep the in-memory id for this session */ }
    }
    this.cached = id;
    return id;
  }

  private generate(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // randomUUID needs a secure context; build a v4 UUID from getRandomValues otherwise.
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
