import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { ACCOUNTS, blockFakeStorage, filmId, FILMS, PASSWORD } from './support/session';

/**
 * Journey 1 of the demo: a new viewer registers, verifies through the captured email outbox (no email
 * provider), and buys a film with simulated payments: a declined payment grants nothing, a confirmation
 * delivered twice grants once, the receipt says SIMULATED, and another account still can't stream it.
 */

async function apiToken(request: APIRequestContext, identifier: string): Promise<string> {
  const res = await request.post('/api/auth/login/', { data: { identifier, password: PASSWORD } });
  expect(res.ok(), `login ${identifier}`).toBeTruthy();
  return (await res.json() as { access: string }).access;
}

async function pageToken(page: Page): Promise<string> {
  const res = await page.request.post('/api/auth/token/refresh/');
  expect(res.ok()).toBeTruthy();
  return (await res.json() as { access: string }).access;
}

test('a new viewer verifies through the outbox and buys with simulated payments', async ({ page, request }) => {
  const email = `e2e-new-${Date.now()}@ikigembe.test`;

  // 1. Register through the real form.
  await page.goto('/register');
  await page.locator('#first_name').fill('Nina');
  await page.locator('#last_name').fill('New');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#password_confirm').fill(PASSWORD);
  const registered = page.waitForResponse(r => r.url().includes('/api/auth/register/') && r.request().method() === 'POST');
  await page.locator('button.submit-btn').click();
  expect((await registered).status()).toBe(201);

  // 2. No email provider: the verification email is captured in the outbox; an admin reads the link.
  const admin = await apiToken(request, ACCOUNTS.admin.email);
  const headers = { Authorization: `Bearer ${admin}` };
  const list = await request.get(
    `/api/admin/dashboard/email-outbox/?recipient=${encodeURIComponent(email)}&message_type=verification`, { headers });
  expect(list.ok()).toBeTruthy();
  const { results, delivery_mode } = await list.json() as { results: { id: number; status: string }[]; delivery_mode: string };
  expect(delivery_mode).toBe('captured');
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].status).not.toBe('sent');
  const detail = await (await request.get(`/api/admin/dashboard/email-outbox/${results[0].id}/`, { headers })).json() as { plain: string };
  const link = /\/verify-email\?token=[A-Za-z0-9_\-]+/.exec(detail.plain);
  expect(link, 'verification link in the captured email').toBeTruthy();

  // 3. The link works once, against the current frontend.
  const verified = page.waitForResponse(r => r.url().includes('/api/auth/') && r.url().includes('verify') && r.request().method() !== 'OPTIONS');
  await page.goto(link![0]);
  expect((await verified).ok()).toBeTruthy();

  // 4. Verifying signs the viewer in (the guest-only /login page sends them home); the demo banner shows.
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).not.toHaveURL(/\/verify-email/);
  await expect(page.getByRole('note').filter({ hasText: 'Payments are simulated' })).toBeVisible();
  await page.goto('/login');
  await expect(page).not.toHaveURL(/\/login/);

  // 5. A declined demo payment grants nothing.
  const id = await filmId(request, FILMS.released);
  await blockFakeStorage(page);
  await page.goto(`/movie/${id}`);
  await page.locator('button.btn-watch:not(.btn-watch--owned)').click();
  const modal = page.locator('dialog.pm-card');
  await expect(modal.locator('#pm-demo-outcome')).toBeVisible();
  await modal.locator('#pm-demo-outcome').selectOption('declined');
  await modal.locator('#pm-phone').fill('0788123456');
  const failed = page.waitForResponse(async r => r.url().includes('/status/') && (await r.json().catch(() => ({}))).status === 'Failed');
  await modal.locator('button.pm-pay-btn').click();
  await failed;

  let token = await pageToken(page);
  const auth = { Authorization: `Bearer ${token}` };
  const deniedStream = await page.request.get(`/api/movies/${id}/stream/`, { headers: auth });
  expect(deniedStream.ok()).toBeFalsy();

  // 6. A confirmation delivered twice grants exactly once.
  await page.goto(`/movie/${id}`);
  await page.locator('button.btn-watch:not(.btn-watch--owned)').click();
  await modal.locator('#pm-demo-outcome').selectOption('duplicate');
  await modal.locator('#pm-phone').fill('0788123456');
  await modal.locator('button.pm-pay-btn').click();
  await expect(modal.getByText('Payment Successful!')).toBeVisible({ timeout: 30_000 });

  token = await pageToken(page);
  const history = await page.request.get('/api/payments/history/', { headers: { Authorization: `Bearer ${token}` } });
  expect(history.ok()).toBeTruthy();
  const body = await history.json() as unknown;
  const rows = (Array.isArray(body) ? body : (body as { results: unknown[] }).results) as
    { status: string; movie_id?: number; movie?: number | { id: number }; deposit_id: string }[];
  const completed = rows.filter(r => r.status === 'Completed');
  expect(completed.length).toBe(1);
  expect(rows.filter(r => r.status === 'Failed').length).toBe(1);

  // 7. The receipt is labelled SIMULATED.
  const receipt = await page.request.get(`/api/payments/${completed[0].deposit_id}/receipt/`,
    { headers: { Authorization: `Bearer ${token}` } });
  expect((await receipt.json() as { simulated: boolean }).simulated).toBe(true);

  // 8. Another account cannot stream the film this viewer bought.
  // (The seeded producer owns this film, so it uses a viewer who never bought it.)
  const other = await apiToken(request, ACCOUNTS.refund.email);
  const otherStream = await request.get(`/api/movies/${id}/stream/`, { headers: { Authorization: `Bearer ${other}` } });
  expect([402, 403]).toContain(otherStream.status());
});
