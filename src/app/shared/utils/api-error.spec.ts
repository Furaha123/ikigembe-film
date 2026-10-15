import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { apiErrorMessage, apiErrorReference, firstFieldError } from './api-error';

describe('api-error', () => {
  it('reads request_id from the body first', () => {
    const err = new HttpErrorResponse({
      status: 500,
      error: { error: 'Something went wrong on our side. Please try again.', code: 'server_error', request_id: 'abcdef0123456789' },
      headers: new HttpHeaders({ 'X-Request-ID': 'header-id-12345' }),
    });
    expect(apiErrorReference(err)).toBe('abcdef0123456789');
    expect(apiErrorMessage(err)).toBe('Something went wrong on our side. Please try again.');
  });

  it('falls back to the X-Request-ID header (e.g. a non-JSON error)', () => {
    const err = new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>', headers: new HttpHeaders({ 'X-Request-ID': 'vercel-abc123' }) });
    expect(apiErrorReference(err)).toBe('vercel-abc123');
  });

  it('ignores missing or unsafe ids and non-HTTP errors', () => {
    expect(apiErrorReference(new HttpErrorResponse({ status: 0 }))).toBeNull();
    expect(apiErrorReference(new HttpErrorResponse({ status: 500, error: { request_id: '<script>x</script>' } }))).toBeNull();
    expect(apiErrorReference(new Error('x'))).toBeNull();
  });

  it('keeps reading the first field error before code/request_id', () => {
    const err = new HttpErrorResponse({
      status: 400, error: { email: ['Enter a valid email.'], code: 'validation_error', request_id: 'abcdef0123456789' },
    });
    expect(firstFieldError(err)).toBe('Enter a valid email.');
  });
});
