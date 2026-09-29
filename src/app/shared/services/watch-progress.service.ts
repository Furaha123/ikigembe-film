import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { PlaybackProgress, WatchProgressPayload } from '../models/movie-api.interface';
import { MovieService } from './movie.service';

/** Ignore sub-5 s positions (accidental opens) unless playback ended. */
const MIN_REPORT_SECONDS = 5;

/**
 * Posts watch progress. It is load-bearing: the server marks a view used at
 * >= 90 %, so reports are sent on an interval, on pause, on end, when the player
 * closes and when the page is hidden/closed. Failures are ignored — progress
 * must never interrupt playback.
 */
@Injectable({ providedIn: 'root' })
export class WatchProgressService {
  private readonly movies = inject(MovieService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  /** Resolves (never rejects) once the report has been sent or skipped. */
  report(movieId: number, p: PlaybackProgress): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    const payload = this.toPayload(p);
    if (!payload) return Promise.resolve();

    if (p.reason === 'unload') {
      this.sendOnUnload(movieId, payload);
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.movies.saveProgress(movieId, payload).subscribe({
        complete: () => resolve(),
        error: () => resolve(), // best effort
      });
    });
  }

  private toPayload(p: PlaybackProgress): WatchProgressPayload | null {
    if (!Number.isFinite(p.duration) || p.duration <= 0) return null;
    const duration = Math.floor(p.duration);
    const position = p.reason === 'ended' ? duration : Math.floor(Math.min(Math.max(p.position, 0), duration));
    if (position < MIN_REPORT_SECONDS && p.reason !== 'ended') return null;
    return { progress_seconds: position, duration_seconds: duration };
  }

  /** HttpClient requests are cancelled on unload; a keepalive fetch survives it. */
  private sendOnUnload(movieId: number, payload: WatchProgressPayload): void {
    const token = this.auth.getAccessToken();
    if (!token) return;
    try {
      fetch(this.movies.progressUrl(movieId), {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }).catch(() => { /* best effort */ });
    } catch { /* best effort */ }
  }
}
