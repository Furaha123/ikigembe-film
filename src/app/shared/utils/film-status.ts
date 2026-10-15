/**
 * Film lifecycle as the API reports it (`lifecycle_status`, derived server-side from approval, active flag
 * and release time — `apps/movies/release.py`). Labels and badge classes for admin and producer lists, and
 * Kigali-time helpers: release times are stored in UTC and always shown in Africa/Kigali (UTC+2, no DST).
 */
export type LifecycleStatus =
  | 'draft'
  | 'in_review'
  | 'awaiting_contract'
  | 'changes_requested'
  | 'rejected'
  | 'unpublished'
  | 'scheduled'
  | 'published';

export const LIFECYCLE_STATUSES: readonly LifecycleStatus[] = [
  'draft', 'in_review', 'awaiting_contract', 'changes_requested', 'rejected', 'unpublished', 'scheduled', 'published',
];

const LABEL_KEYS: Record<LifecycleStatus, string> = {
  draft: 'filmStatus.draft',
  in_review: 'filmStatus.inReview',
  awaiting_contract: 'filmStatus.awaitingContract',
  changes_requested: 'filmStatus.changesRequested',
  rejected: 'filmStatus.rejected',
  unpublished: 'filmStatus.unpublished',
  scheduled: 'filmStatus.scheduled',
  published: 'filmStatus.published',
};

/** Fallback for rows from an older API without `lifecycle_status`. */
export function lifecycleFromApproval(approval: string | null | undefined, isActive?: boolean): LifecycleStatus {
  switch (approval) {
    case 'draft': return 'draft';
    case 'approved_pending_contract': return 'awaiting_contract';
    case 'changes_requested': return 'changes_requested';
    case 'rejected': return 'rejected';
    case 'approved': return isActive === false ? 'unpublished' : 'published';
    default: return 'in_review';
  }
}

export function lifecycleLabelKey(status: LifecycleStatus | string | null | undefined): string {
  return LABEL_KEYS[status as LifecycleStatus] ?? 'filmStatus.inReview';
}

/** CSS classes used by `FilmStatusBadgeComponent`: `film-status film-status--<status>`. */
export function lifecycleBadgeClass(status: LifecycleStatus | string | null | undefined): string {
  return `film-status film-status--${(status && status in LABEL_KEYS) ? status : 'in_review'}`;
}

export const KIGALI_TIME_ZONE = 'Africa/Kigali';
/** Kigali is UTC+2 all year; Angular's DatePipe takes this offset. */
export const KIGALI_OFFSET = '+0200';

/** "1 Nov 2026, 20:00" in Kigali time (whatever the viewer's own timezone). */
export function formatKigali(iso: string | null | undefined, locale = 'en-GB'): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: KIGALI_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** `<input type="datetime-local">` value ("2026-11-01T20:00") for a UTC instant, in Kigali time. */
export function kigaliInputValue(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(ms + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** A datetime-local value read as Kigali time, as ISO 8601 with its offset (what the API needs), or null. */
export function kigaliInputToIso(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return `${v}:00+02:00`;
}
