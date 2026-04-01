export const environment = {
  production: true,
  apiUrl: (import.meta as any).env?.['NG_APP_API_URL'] ?? 'https://ikigembe-backend.onrender.com/api',
  backendUrl: (import.meta as any).env?.['NG_APP_BACKEND_URL'] ?? 'https://ikigembe-backend.onrender.com',
};
