import { HttpErrorResponse } from '@angular/common/http';

/** What a 403 from the yearly plans means: no actor membership, or no producer plan. */
export type EntitlementCode = 'membership_required' | 'plan_required';

/**
 * The 403s the yearly plans send (`{ error, code }`). They are expected (the account is allowed,
 * it just hasn't paid), unlike a 403 the access map should have prevented.
 */
export function entitlementCode(err: unknown): EntitlementCode | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 403) return null;
  const code = (err.error as { code?: unknown } | null)?.code;
  return code === 'membership_required' || code === 'plan_required' ? code : null;
}
