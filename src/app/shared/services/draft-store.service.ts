import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const PREFIX = 'ikigembe_draft:';

/** Drops every wizard draft (sign-out: drafts belong to the account that wrote them). */
export function clearAllDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* storage unavailable */ }
}

/**
 * Keeps unsent wizard text in sessionStorage so a reload, a sign-in detour or a
 * payment redirect doesn't lose it. Only plain form text goes here: never tokens,
 * signed URLs, files, payment details or another person's contact details.
 * Storage can be unavailable (private mode, SSR); every call degrades to a no-op.
 */
@Injectable({ providedIn: 'root' })
export class DraftStoreService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  load<T extends object>(key: string): Partial<T> | null {
    if (!this.browser) return null;
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      const value: unknown = raw ? JSON.parse(raw) : null;
      return value && typeof value === 'object' ? value as Partial<T> : null;
    } catch {
      return null;
    }
  }

  save<T extends object>(key: string, value: T): void {
    if (!this.browser) return;
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch { /* quota or disabled storage: the draft just isn't kept */ }
  }

  clear(key: string): void {
    if (!this.browser) return;
    try {
      sessionStorage.removeItem(PREFIX + key);
    } catch { /* ignore */ }
  }
}
