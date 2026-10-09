import { APIRequestContext, expect, Page } from '@playwright/test';

/** Accounts created by the backend's `seed_e2e` command (ikigembe_backend). */
export const PASSWORD = 'E2e-Passw0rd!';
export const ACCOUNTS = {
  admin:    { email: 'e2e-admin@ikigembe.test', name: 'Ada Admin' },
  viewer:   { email: 'e2e-viewer@ikigembe.test', name: 'Vava Viewer' },
  refund:   { email: 'e2e-refund@ikigembe.test', name: 'Rita Refund' },
  producer: { email: 'e2e-producer@ikigembe.test', name: 'Paul Producer' },
  maker:    { email: 'e2e-maker@ikigembe.test', name: 'Mara Maker' },
} as const;
export type AccountKey = keyof typeof ACCOUNTS;

export const FILMS = {
  released: 'E2E Released Film',
  comingSoon: 'E2E Coming Soon Film',
  refunded: 'E2E Refund Film',
} as const;

/** Signs in through the real form and waits until the app has left /login. */
export async function signIn(page: Page, account: AccountKey): Promise<void> {
  await page.goto('/login');
  await page.locator('#identifier').fill(ACCOUNTS[account].email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button.submit-btn').click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** The id of a seeded, listed film (public search API). */
export async function filmId(request: APIRequestContext, title: string): Promise<number> {
  const res = await request.get(`/api/movies/search/?q=${encodeURIComponent(title)}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as { results: { id: number; title: string }[] };
  const film = body.results.find(m => m.title === title);
  expect(film, `seeded film "${title}"`).toBeTruthy();
  return film!.id;
}

/**
 * Media lives on fake storage in this stack. Abort those requests in the browser so the
 * player fails fast instead of waiting on a closed port; API calls are not affected.
 */
export async function blockFakeStorage(page: Page): Promise<void> {
  await page.route(/127\.0\.0\.1:9\/|e2e-media\.invalid/, route => route.abort());
}

/** Fills the payment modal's Mobile Money number and pays (demo mode settles after ~1 s). */
export async function payWithMobileMoney(page: Page): Promise<void> {
  const modal = page.locator('dialog.pm-card');
  await expect(modal).toBeVisible();
  await modal.locator('#pm-phone').fill('0788123456');
  await modal.locator('button.pm-pay-btn').click();
  await expect(modal.getByText('Payment Successful!')).toBeVisible({ timeout: 30_000 });
}
