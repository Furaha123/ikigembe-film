import { ActorVideoStatus, ApplicationStatus, CastingCall, CastingCallStatus } from '../models/marketplace.interface';

export function castingDisplayStatus(call: CastingCall, now = Date.now()): CastingCallStatus {
  return call.status === 'published' && !(new Date(call.deadline_at).getTime() > now) ? 'closed' : call.status;
}

export function castingIsOpen(call: CastingCall, now = Date.now()): boolean {
  return castingDisplayStatus(call, now) === 'published';
}

/** Badge classes (see shared/styles/marketplace-page.scss) for marketplace statuses. */
export function applicationStatusClass(status: ApplicationStatus): string {
  switch (status) {
    case 'shortlisted': return 'mk-badge mk-badge--ok';
    case 'declined': return 'mk-badge mk-badge--danger';
    default: return 'mk-badge mk-badge--info';
  }
}

export function actorVideoStatusClass(status: ActorVideoStatus): string {
  switch (status) {
    case 'approved': return 'mk-badge mk-badge--ok';
    case 'rejected':
    case 'upload_failed':
    case 'removed': return 'mk-badge mk-badge--danger';
    case 'pending_review':
    case 'processing': return 'mk-badge mk-badge--info';
    case 'replaced': return 'mk-badge';
    default: return 'mk-badge mk-badge--warn';
  }
}

export function castingCallStatusClass(status: CastingCallStatus): string {
  switch (status) {
    case 'published': return 'mk-badge mk-badge--ok';
    case 'pending_review': return 'mk-badge mk-badge--info';
    case 'rejected':
    case 'removed': return 'mk-badge mk-badge--danger';
    case 'closed': return 'mk-badge';
    default: return 'mk-badge mk-badge--warn';
  }
}

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
}

/** Display-only countdown to an access expiry; null once it has passed (the server decides access). */
export function accessTimeLeft(expiresAt: string | null, now = Date.now()): TimeLeft | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

/**
 * Where a producer's casting call stands, from the server's fields only:
 * "published" only when the server says published (paid AND approved by an admin). A paid call waits
 * for review ("inReview"); a completed fee on a draft is "processing" until the confirmation lands.
 */
export type CastingPublicationState =
  | 'draft' | 'paymentPending' | 'paymentFailed' | 'processing' | 'inReview' | 'rejected' | 'published' | 'closed' | 'removed';

export function castingPublicationState(call: CastingCall, now = Date.now()): CastingPublicationState {
  const status = castingDisplayStatus(call, now);
  if (status === 'published' || status === 'closed' || status === 'removed' || status === 'rejected') return status;
  if (status === 'pending_review') return 'inReview';
  switch (call.payment_status) {
    case 'Pending': return 'paymentPending';
    case 'Failed': return 'paymentFailed';
    case 'Completed': return 'processing';
    default: return 'draft';
  }
}

export function castingPublicationClass(state: CastingPublicationState): string {
  switch (state) {
    case 'published': return 'mk-badge mk-badge--ok';
    case 'removed':
    case 'rejected':
    case 'paymentFailed': return 'mk-badge mk-badge--danger';
    case 'paymentPending':
    case 'processing':
    case 'inReview': return 'mk-badge mk-badge--info';
    case 'closed': return 'mk-badge';
    default: return 'mk-badge mk-badge--warn';
  }
}
