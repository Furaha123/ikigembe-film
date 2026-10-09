import { expect, test } from '@playwright/test';
import { signIn } from './support/session';

test.describe('access control', () => {
  test('signed-out visitors are sent to sign in, keeping where they were going', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fprofile/);
  });

  test('a viewer cannot open the admin or producer dashboards', async ({ page }) => {
    await signIn(page, 'viewer');
    for (const url of ['/admin/dashboard', '/admin/payments', '/producer/dashboard', '/producer/upload']) {
      await page.goto(url);
      await expect(page, url).toHaveURL(/\/browse/);
    }
  });

  test('the API refuses a viewer on admin and producer endpoints, whatever the browser shows', async ({ page }) => {
    await signIn(page, 'viewer');
    // Read the in-memory access token through the app's own refresh flow: call an API with the session cookie.
    const refresh = await page.request.post('/api/auth/token/refresh/');
    expect(refresh.ok()).toBeTruthy();
    const { access } = await refresh.json() as { access: string };
    const headers = { Authorization: `Bearer ${access}` };
    expect((await page.request.get('/api/admin/dashboard/overview/', { headers })).status()).toBe(403);
    expect((await page.request.get('/api/admin/dashboard/payments/', { headers })).status()).toBe(403);
    expect((await page.request.post('/api/movies/create/', { headers, data: {} })).status()).toBe(403);
  });
});
