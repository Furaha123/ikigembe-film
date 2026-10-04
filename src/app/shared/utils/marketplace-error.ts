import { HttpErrorResponse } from '@angular/common/http';
import { MarketplaceAccessError } from '../../core/access/marketplace-access.service';
import { apiErrorMessage } from './api-error';

/**
 * apiErrorMessage() for marketplace pages, plus a friendly message when the
 * account isn't allowed to do this: a request the access map blocked, or a 403
 * that got through anyway (a bug, already logged in development by
 * MarketplaceAccessService). Pages that expect a 403 (an expired directory pass)
 * handle it before calling this.
 */
export function marketplaceErrorMessage(err: unknown): string | null {
  if (err instanceof MarketplaceAccessError) return 'marketplace.errors.forbidden';
  if (err instanceof HttpErrorResponse && err.status === 403) return 'marketplace.errors.forbidden';
  return apiErrorMessage(err);
}
