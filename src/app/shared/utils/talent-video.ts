import { hasAllowedExtension } from '../models/upload.constants';

/**
 * Talent-video rules, mirroring the backend defaults (MarketplaceSettings talent_video_max_*,
 * apps/marketplace/media.py). Early checks only: the server measures the stored file again after
 * upload and is the final judge (a failed check can be retried on the same paid slot).
 */
export const TALENT_VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.mov'];
export const TALENT_VIDEO_ACCEPT = '.mp4,.mov,video/mp4,video/quicktime';
export const TALENT_VIDEO_MAX_SECONDS = 300;
export const TALENT_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

/** The backend's age threshold for the talent-video fee (apps/marketplace/services.py). */
export const TALENT_FEE_AGE_THRESHOLD = 30;

export type TalentFeeTier = 'under30' | 'from30';

/** Whole years on `today` for a YYYY-MM-DD birth date, as the backend counts them; null if unreadable. */
export function ageOn(dateOfBirth: string | null | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const beforeBirthday = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  const age = today.getFullYear() - y - (beforeBirthday ? 1 : 0);
  return age >= 0 ? age : null;
}

/**
 * Which fee tier the profile's birth date falls in. Display only: the amount
 * always comes from the server quote, which applies the same rule.
 */
export function talentFeeTier(dateOfBirth: string | null | undefined, today: Date = new Date()): TalentFeeTier | null {
  const age = ageOn(dateOfBirth, today);
  if (age === null) return null;
  return age < TALENT_FEE_AGE_THRESHOLD ? 'under30' : 'from30';
}

export type TalentVideoProblem = 'type' | 'tooLong' | 'tooLarge';

/** Early checks before paying. The backend stays the final validator. */
export function talentVideoProblem(fileName: string, durationSeconds: number | null, sizeBytes = 0): TalentVideoProblem | null {
  if (!hasAllowedExtension(fileName, TALENT_VIDEO_EXTENSIONS)) return 'type';
  if (sizeBytes > TALENT_VIDEO_MAX_BYTES) return 'tooLarge';
  if (durationSeconds !== null && durationSeconds > TALENT_VIDEO_MAX_SECONDS + 0.5) return 'tooLong';
  return null;
}

/**
 * Reads a local video's duration from its metadata. Resolves null when the
 * browser can't decode it (e.g. some .avi/.mkv files); the upload is then
 * allowed and moderation checks the length.
 */
export function readVideoDuration(file: File, timeoutMs = 10000): Promise<number | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** "2:05" for a number of seconds. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "12.4 MB" for a byte count. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
