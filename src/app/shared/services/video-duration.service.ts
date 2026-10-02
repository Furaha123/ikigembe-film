import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** How long to wait for the browser to read a file's metadata. */
const READ_TIMEOUT_MS = 10_000;

/** Reads a local video file's duration before it is uploaded. */
@Injectable({ providedIn: 'root' })
export class VideoDurationService {
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Duration in seconds, or null when it can't be read (server, unsupported
   * container such as some .avi/.mkv files, or a timeout). Callers should let
   * the upload proceed on null rather than block the user.
   */
  read(file: File): Promise<number | null> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve(null);

    return new Promise(resolve => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (seconds: number | null) => {
        clearTimeout(timer);
        video.onloadedmetadata = video.onerror = null;
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        resolve(seconds);
      };

      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
      video.onerror = () => finish(null);
      timer = setTimeout(() => finish(null), READ_TIMEOUT_MS);
      video.src = url;
    });
  }
}
