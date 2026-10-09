import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, Injector, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/** Browser events the API accepts (apps/analytics). Server facts (payments, playback) are recorded by the API. */
export type ClientEventName = 'page_view' | 'trailer_play' | 'checkout_open' | 'casting_view';

interface QueuedEvent {
  id: string;
  visitor: string;
  name: ClientEventName;
  at: string;
  path: string;
  movie_id?: number;
  object_type?: string;
  object_id?: number;
  props?: Record<string, string>;
}

const VISITOR_KEY = 'ikigembe_visitor';
const FLUSH_MS = 5000;
const MAX_BATCH = 20;

/**
 * Usage analytics: page views and a few product events, batched and sent with keepalive.
 * Never sends query strings, tokens, signed URLs or personal data; honours Do Not Track.
 * Analytics never decides anything — access and money come from the API's own records.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  // Resolved at send time so pages that track events don't need HTTP/auth providers themselves.
  private readonly injector = inject(Injector);
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly enabled = isPlatformBrowser(this.platformId)
    && (globalThis.navigator as Navigator & { doNotTrack?: string })?.doNotTrack !== '1';

  /** Starts page-view tracking (called once from the root component). */
  start(router: Router): void {
    if (!this.enabled) return;
    router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.track('page_view', { path: e.urlAfterRedirects }));
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'hidden') this.flush();
    });
  }

  track(name: ClientEventName, data: { path?: string; movie_id?: number; object_type?: string; object_id?: number; props?: Record<string, string> } = {}): void {
    if (!this.enabled) return;
    const path = (data.path ?? this.document.location?.pathname ?? '').split(/[?#]/)[0].slice(0, 200);
    this.queue.push({
      id: crypto.randomUUID(), visitor: this.visitorId(), name, at: new Date().toISOString(), path,
      movie_id: data.movie_id, object_type: data.object_type, object_id: data.object_id, props: data.props,
    });
    if (this.queue.length >= MAX_BATCH) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.queue.length) return;
    const events = this.queue.splice(0, MAX_BATCH);
    const token = this.accessToken();
    fetch(`${environment.apiUrl}/analytics/events/`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ events }),
    }).catch(() => { /* analytics is best effort */ });
    if (this.queue.length) this.flush();
  }

  private accessToken(): string | null {
    try {
      return this.injector.get(AuthService).getAccessToken();
    } catch {
      return null;
    }
  }

  /** A random, non-identifying id for this browser (not a secret, not linked to the account). */
  private visitorId(): string {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch {
      return 'no-storage-visitor';
    }
  }
}
