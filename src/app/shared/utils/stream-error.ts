import { HttpErrorResponse } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { apiErrorMessage } from './api-error';

export type StreamDenialKind =
  | 'purchase_required'   // 403, never bought (or refunded)
  | 'view_used'           // 403, single-device policy: the purchase's one view is consumed
  | 'other_device'        // 403, single-device policy: purchase is bound to another device
  | 'device_id_missing'   // 400, X-Device-Id header absent — a client bug
  | 'not_found'           // 404
  | 'unknown';

export interface StreamDenial {
  kind: StreamDenialKind;
  /** Backend message to show verbatim, or null to show `key` instead. */
  text: string | null;
  /** Translation key used when there is no backend message. */
  key: string;
  /** Whether a (re-)purchase would resolve this — show a Buy / Buy again action. */
  canBuy: boolean;
}

/*
 * The backend has no machine-readable error codes for /stream/ yet, so the 403
 * cases are told apart by message text (apps/movies/playback.py). Keep ALL of
 * that matching here: when the backend adds codes, only this function changes.
 */
const VIEW_USED_MSG    = 'your view of this movie has been used';
const OTHER_DEVICE_MSG = 'already being watched on another device';

export function classifyStreamError(err: unknown): StreamDenial {
  const status = err instanceof HttpErrorResponse ? err.status : 0;
  const message = apiErrorMessage(err);
  const lower = (message ?? '').toLowerCase();

  if (status === 403) {
    if (lower.includes(VIEW_USED_MSG)) {
      return { kind: 'view_used', text: message, key: 'viewer.stream.viewUsed', canBuy: true };
    }
    if (lower.includes(OTHER_DEVICE_MSG)) {
      return { kind: 'other_device', text: message, key: 'viewer.stream.otherDevice', canBuy: false };
    }
    return { kind: 'purchase_required', text: message, key: 'viewer.stream.purchaseRequired', canBuy: true };
  }
  if (status === 400) {
    // Should never happen: MovieService.getStream() always sends X-Device-Id in the browser.
    if (isDevMode()) console.error('[stream] 400 from /stream/:', message);
    return { kind: 'device_id_missing', text: null, key: 'viewer.stream.failed', canBuy: false };
  }
  if (status === 404) {
    return { kind: 'not_found', text: message, key: 'viewer.stream.notFound', canBuy: false };
  }
  return { kind: 'unknown', text: null, key: 'viewer.stream.failed', canBuy: false };
}
