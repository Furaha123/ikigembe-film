import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { GlobalErrorHandler } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  it('logs to the console in development with the request reference', () => {
    const spy = spyOn(console, 'error');
    const err = new HttpErrorResponse({ status: 500, headers: new HttpHeaders({ 'X-Request-ID': 'abcdef0123456789' }) });
    new GlobalErrorHandler().handleError(err);
    // Karma runs in dev mode.
    expect(spy).toHaveBeenCalledWith('[app] Unhandled error (reference abcdef0123456789):', err);
  });

  it('never throws', () => {
    spyOn(console, 'error');
    expect(() => new GlobalErrorHandler().handleError(undefined)).not.toThrow();
  });
});
