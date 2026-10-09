import { CastingCall, ServicePaymentStatus } from '../models/marketplace.interface';
import { accessTimeLeft, castingPublicationState } from './marketplace-status';

const NOW = Date.UTC(2030, 0, 1);
const call = (status: CastingCall['status'], payment: ServicePaymentStatus | null, deadlineOffsetMs = 86400000) => ({
  id: 1, status, payment_status: payment, deadline_at: new Date(NOW + deadlineOffsetMs).toISOString(),
} as CastingCall);

describe('castingPublicationState', () => {
  it('is published only when the server says published', () => {
    expect(castingPublicationState(call('published', 'Completed'), NOW)).toBe('published');
    expect(castingPublicationState(call('draft', 'Completed'), NOW)).toBe('processing');
  });

  it('a paid call waits for review; payment alone is never "published"', () => {
    expect(castingPublicationState(call('pending_review', 'Completed'), NOW)).toBe('inReview');
    expect(castingPublicationState(call('rejected', 'Completed'), NOW)).toBe('rejected');
  });

  it('never treats a pending or failed payment as published', () => {
    expect(castingPublicationState(call('draft', 'Pending'), NOW)).toBe('paymentPending');
    expect(castingPublicationState(call('draft', 'Failed'), NOW)).toBe('paymentFailed');
    expect(castingPublicationState(call('draft', null), NOW)).toBe('draft');
  });

  it('shows a published call past its deadline as closed', () => {
    expect(castingPublicationState(call('published', 'Completed', -1000), NOW)).toBe('closed');
    expect(castingPublicationState(call('closed', 'Completed'), NOW)).toBe('closed');
    expect(castingPublicationState(call('removed', 'Completed'), NOW)).toBe('removed');
  });
});

describe('accessTimeLeft', () => {
  it('counts down to the expiry', () => {
    const expires = new Date(NOW + ((2 * 24 + 3) * 60 + 4) * 60000 + 30000).toISOString();
    expect(accessTimeLeft(expires, NOW)).toEqual({ days: 2, hours: 3, minutes: 4 });
  });

  it('is null once expired or without an expiry', () => {
    expect(accessTimeLeft(new Date(NOW - 1).toISOString(), NOW)).toBeNull();
    expect(accessTimeLeft(new Date(NOW).toISOString(), NOW)).toBeNull();
    expect(accessTimeLeft(null, NOW)).toBeNull();
    expect(accessTimeLeft('not a date', NOW)).toBeNull();
  });
});
