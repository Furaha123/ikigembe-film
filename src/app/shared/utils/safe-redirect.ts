/** Query parameter that carries the page to return to after signing in. */
export const RETURN_URL_PARAM = 'returnUrl';

const AUTH_PAGES = /^\/(login|register|forgot-password|reset-password|verify-email)(?=[/?#]|$)/;

/**
 * An in-app path that is safe to navigate to after sign-in, or null.
 * Rejects absolute and protocol-relative URLs (`//evil.example`, `/\evil`), control
 * characters, and the auth pages themselves (which would loop).
 */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  if (AUTH_PAGES.test(raw)) return null;
  return raw;
}
