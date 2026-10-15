import {
  formatKigali, kigaliInputToIso, kigaliInputValue, lifecycleBadgeClass, lifecycleFromApproval, lifecycleLabelKey,
} from './film-status';

describe('film-status utils', () => {
  it('maps statuses to labels and classes, with a safe fallback', () => {
    expect(lifecycleLabelKey('scheduled')).toBe('filmStatus.scheduled');
    expect(lifecycleLabelKey('awaiting_contract')).toBe('filmStatus.awaitingContract');
    expect(lifecycleLabelKey('nonsense')).toBe('filmStatus.inReview');
    expect(lifecycleBadgeClass('published')).toBe('film-status film-status--published');
    expect(lifecycleBadgeClass(undefined)).toBe('film-status film-status--in_review');
  });

  it('derives a status from older rows without lifecycle_status', () => {
    expect(lifecycleFromApproval('draft')).toBe('draft');
    expect(lifecycleFromApproval('pending_review')).toBe('in_review');
    expect(lifecycleFromApproval('approved', false)).toBe('unpublished');
    expect(lifecycleFromApproval('approved_pending_contract')).toBe('awaiting_contract');
  });

  it('formats times in Kigali whatever the browser timezone', () => {
    expect(formatKigali('2030-12-31T23:30:00Z')).toBe('1 Jan 2031, 01:30');
    expect(formatKigali('2030-06-01T12:00:00+02:00')).toBe('1 Jun 2030, 12:00');
    expect(formatKigali(null)).toBe('');
    expect(formatKigali('not a date')).toBe('');
  });

  it('converts between UTC instants and Kigali datetime-local values', () => {
    expect(kigaliInputValue('2030-12-31T23:30:00Z')).toBe('2031-01-01T01:30');
    expect(kigaliInputValue(null)).toBe('');
    expect(kigaliInputToIso('2031-01-01T01:30')).toBe('2031-01-01T01:30:00+02:00');
    expect(new Date(kigaliInputToIso(kigaliInputValue('2030-06-01T10:00:00Z'))!).toISOString()).toBe('2030-06-01T10:00:00.000Z');
    expect(kigaliInputToIso('')).toBeNull();
    expect(kigaliInputToIso('2031-01-01')).toBeNull();
  });
});
