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
