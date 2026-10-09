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
  if (hasControlCharOrBackslash(raw)) return null;
  if (AUTH_PAGES.test(raw)) return null;
  return raw;
}

/** True for C0 control characters (U+0000–U+001F), DEL (U+007F) or a backslash. */
function hasControlCharOrBackslash(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}
