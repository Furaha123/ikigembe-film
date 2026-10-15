import { ErrorHandler, Injectable, isDevMode } from '@angular/core';
import { apiErrorReference } from '../../shared/utils/api-error';

/**
 * Uncaught errors: printed to the console in development only. Production builds stay quiet, because
 * error objects can carry request URLs (signed media links are credentials, see CLAUDE.md) and nothing
 * reads the console there; failed API calls still have their support reference in the UI.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    if (!isDevMode()) return;
    const reference = apiErrorReference(error);
    console.error(reference ? `[app] Unhandled error (reference ${reference}):` : '[app] Unhandled error:', error);
  }
}
