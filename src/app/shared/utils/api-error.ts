import { HttpErrorResponse } from '@angular/common/http';

/** Backend errors are `{ "error": "<message>" }`; returns that message, or null if absent. */
export function apiErrorMessage(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const body: unknown = err.error;
  if (body && typeof body === 'object' && 'error' in body) {
    const msg = (body as { error: unknown }).error;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return null;
}

/** A user-facing error: the backend's message when it sent one, else a translation key. */
export interface UiError {
  text: string | null;
  key: string;
}

/** First message of a DRF `{ field: [msg] }` validation error, or null. */
export function firstFieldError(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const body: unknown = err.error;
  if (!body || typeof body !== 'object') return null;
  for (const v of Object.values(body as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length) return String(v[0]);
    if (typeof v === 'string') return v;
  }
  return null;
}

/** Request ids the API sends: short and plain, so they are safe to show and copy. */
const REFERENCE_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * The support reference of a failed API call: `request_id` from the error body, else the
 * `X-Request-ID` response header (every API response carries one). It finds the request in the
 * server logs, so show it next to unexpected errors (`<app-error-reference>`). Null when absent.
 */
export function apiErrorReference(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const body: unknown = err.error;
  const fromBody = body && typeof body === 'object' ? (body as { request_id?: unknown }).request_id : null;
  const candidate = typeof fromBody === 'string' && fromBody ? fromBody : err.headers?.get('X-Request-ID');
  return typeof candidate === 'string' && REFERENCE_PATTERN.test(candidate) ? candidate : null;
}
