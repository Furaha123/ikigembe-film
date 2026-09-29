import { ActorVideoStatus, ApplicationStatus, CastingCallStatus } from '../models/marketplace.interface';

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
    case 'removed': return 'mk-badge mk-badge--danger';
    case 'pending_review':
    case 'processing': return 'mk-badge mk-badge--info';
    default: return 'mk-badge mk-badge--warn';
  }
}

export function castingCallStatusClass(status: CastingCallStatus): string {
  switch (status) {
    case 'published': return 'mk-badge mk-badge--ok';
    case 'removed': return 'mk-badge mk-badge--danger';
    case 'closed': return 'mk-badge';
    default: return 'mk-badge mk-badge--warn';
  }
}
