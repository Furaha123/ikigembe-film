export const environment = {
  production: true,
  // Same-origin: vercel.json proxies /api/* to the backend, so the httpOnly
  // refresh cookie is first-party.
  apiUrl: '/api',
};
