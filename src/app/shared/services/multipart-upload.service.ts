import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MultipartPart, MultipartUploadApi, MultipartUploadOptions } from '../models/upload.interface';

export const MULTIPART_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

/** Thrown when an upload is cancelled through its AbortSignal. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'UploadAbortedError';
  }
}

/**
 * Chunked upload straight to object storage: initiate → sign + PUT each part →
 * complete. On failure or cancellation the server-side upload is aborted
 * (best effort) so no orphaned parts are left behind. Browser-only (uses fetch
 * and File) — only call it from user-triggered actions.
 */
@Injectable({ providedIn: 'root' })
export class MultipartUploadService {
  async upload(file: File, api: MultipartUploadApi, options: MultipartUploadOptions = {}): Promise<string> {
    const { onProgress, signal, chunkSize = MULTIPART_CHUNK_SIZE } = options;
    const throwIfAborted = () => { if (signal?.aborted) throw new UploadAbortedError(); };

    throwIfAborted();
    const { upload_id, file_key } = await firstValueFrom(api.initiate(file));

    try {
      const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
      const parts: MultipartPart[] = [];

      for (let i = 0; i < totalChunks; i++) {
        throwIfAborted();
        const partNumber = i + 1;
        const chunk = file.slice(i * chunkSize, partNumber * chunkSize);
        const { url } = await firstValueFrom(api.signPart(upload_id, file_key, partNumber));

        let res: Response;
        try {
          res = await fetch(url, { method: 'PUT', body: chunk, signal });
        } catch (err) {
          throwIfAborted();
          throw err;
        }
        if (!res.ok) throw new Error(`Part ${partNumber} failed (${res.status})`);

        parts.push({ PartNumber: partNumber, ETag: res.headers.get('ETag') ?? '' });
        onProgress?.(Math.round((partNumber / totalChunks) * 100));
      }

      throwIfAborted();
      await firstValueFrom(api.complete(upload_id, file_key, parts));
      return file_key;
    } catch (err) {
      firstValueFrom(api.abort(upload_id, file_key)).catch(() => { /* best effort */ });
      throw err;
    }
  }
}
