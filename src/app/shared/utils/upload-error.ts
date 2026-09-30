import { UploadAbortedError, UploadError } from '../services/multipart-upload.service';
import { apiErrorMessage } from './api-error';

/**
 * What to show for a failed upload: a translation key, or the backend's own
 * message (e.g. initiate's 403 "Your producer account is not active.").
 * Returns null for a cancelled upload — callers stay silent then.
 */
export function uploadErrorMessage(err: unknown, fallbackKey: string): string | null {
  if (err instanceof UploadAbortedError) return null;
  if (err instanceof UploadError) {
    return err.kind === 'session' ? 'uploadErrors.sessionExpired' : fallbackKey;
  }
  return apiErrorMessage(err) ?? fallbackKey;
}

/*
 * The resubmit endpoint has no error codes, so a stale/foreign key is recognised
 * by its message ("<field> was not uploaded by this account or has expired.").
 * Keep this matching here; switch to codes when the backend adds them.
 */
const STALE_KEY_MSG = 'not uploaded by this account or has expired';

/** Which uploaded file the backend rejected as stale or foreign, if any. */
export function staleResubmitKey(err: unknown): 'video' | 'copyright' | null {
  const msg = (apiErrorMessage(err) ?? '').toLowerCase();
  if (!msg.includes(STALE_KEY_MSG)) return null;
  if (msg.startsWith('copyright_document_key')) return 'copyright';
  if (msg.startsWith('video_key')) return 'video';
  return null;
}
