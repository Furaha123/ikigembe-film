import { Injectable, effect, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { MultipartPart, MultipartUploadApi, MultipartUploadOptions } from '../models/upload.interface';
import { apiErrorMessage } from '../utils/api-error';

export const MULTIPART_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

/** Thrown when an upload is cancelled (user cancel, or the user logged out). Callers stay silent. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'UploadAbortedError';
  }
}

/**
 * A failed upload the UI can explain:
 * - `session`: sign-part/complete returned 403 — the upload was started by another
 *   account/session (logout, account switch, or a pre-deploy key). Start again; never auto-retry.
 * - `storage`: the direct PUT of a part to storage failed (after one re-sign on 403).
 * `detail` is the backend/storage message, for logging only — show a translated message instead.
 */
export class UploadError extends Error {
  constructor(
    readonly kind: 'session' | 'storage',
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(detail ?? `Upload failed (${kind}, ${status})`);
    this.name = 'UploadError';
  }
}

/**
 * Chunked upload straight to object storage: initiate → sign + PUT each part →
 * complete. On failure or cancellation the server-side upload is aborted
 * (best effort) so no orphaned parts are left behind. Uploads still running when
 * the user logs out are cancelled. Browser-only (uses fetch and File) — only call
 * it from user-triggered actions. The `file_key` is opaque: never parse or build it.
 */
@Injectable({ providedIn: 'root' })
export class MultipartUploadService {
  private readonly auth = inject(AuthService);
  private readonly active = new Set<AbortController>();

  constructor() {
    // An upload must not keep running for a user who is no longer logged in.
    effect(() => {
      if (!this.auth.isLoggedIn()) this.cancelAll();
    });
  }

  /** Cancel every in-flight upload (each rejects with UploadAbortedError). */
  cancelAll(): void {
    this.active.forEach(c => c.abort());
    this.active.clear();
  }

  async upload(file: File, api: MultipartUploadApi, options: MultipartUploadOptions = {}): Promise<string> {
    const { onProgress, signal: callerSignal, chunkSize = MULTIPART_CHUNK_SIZE } = options;

    // Our own controller, aborted by the caller's signal or by cancelAll() on logout.
    const controller = new AbortController();
    const signal = controller.signal;
    const forward = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    callerSignal?.addEventListener('abort', forward, { once: true });
    this.active.add(controller);

    const throwIfAborted = () => { if (signal.aborted) throw new UploadAbortedError(); };

    try {
      throwIfAborted();
      // initiate errors (e.g. 403 "Your producer account is not active.") pass through unchanged
      const { upload_id, file_key } = await firstValueFrom(api.initiate(file));

      try {
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        const parts: MultipartPart[] = [];

        for (let i = 0; i < totalChunks; i++) {
          throwIfAborted();
          const partNumber = i + 1;
          const chunk = file.slice(i * chunkSize, partNumber * chunkSize);

          let res = await this.putPart(await this.sign(api, upload_id, file_key, partNumber), chunk, signal, throwIfAborted);
          if (res.status === 403) {
            // The presigned part URL (1 h) probably expired on a slow link: re-sign once and retry.
            res = await this.putPart(await this.sign(api, upload_id, file_key, partNumber), chunk, signal, throwIfAborted);
          }
          if (!res.ok) throw new UploadError('storage', res.status, `Part ${partNumber} failed (${res.status})`);

          parts.push({ PartNumber: partNumber, ETag: res.headers.get('ETag') ?? '' });
          onProgress?.(Math.round((partNumber / totalChunks) * 100));
        }

        throwIfAborted();
        await this.guard(firstValueFrom(api.complete(upload_id, file_key, parts)));
        return file_key;
      } catch (err) {
        firstValueFrom(api.abort(upload_id, file_key)).catch(() => { /* best effort */ });
        throw signal.aborted && !(err instanceof UploadAbortedError) ? new UploadAbortedError() : err;
      }
    } finally {
      this.active.delete(controller);
      callerSignal?.removeEventListener('abort', forward);
    }
  }

  private async sign(api: MultipartUploadApi, uploadId: string, fileKey: string, partNumber: number): Promise<string> {
    const { url } = await this.guard(firstValueFrom(api.signPart(uploadId, fileKey, partNumber)));
    return url;
  }

  private async putPart(url: string, chunk: Blob, signal: AbortSignal, throwIfAborted: () => void): Promise<Response> {
    try {
      return await fetch(url, { method: 'PUT', body: chunk, signal });
    } catch {
      throwIfAborted();
      throw new UploadError('storage', 0, 'Network error while uploading a part');
    }
  }

  /** A 403 from sign-part/complete means the upload doesn't belong to this account/session. */
  private async guard<T>(req: Promise<T>): Promise<T> {
    try {
      return await req;
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        throw new UploadError('session', 403, apiErrorMessage(err));
      }
      throw err;
    }
  }
}
