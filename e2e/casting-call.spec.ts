import { Page, expect, test } from '@playwright/test';
import { payWithMobileMoney, signIn } from './support/session';

const TITLE = `E2E Casting ${Date.now()}`;

/** A deadline two weeks ahead, in the datetime-local format. */
function futureDeadline(): string {
  const d = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
}

/** Writes a call in the wizard up to the review step. */
async function writeCall(page: Page, title: string): Promise<void> {
  await page.goto('/producer/casting/new');
  await page.getByRole('button', { name: 'Next' }).click();                           // type: a specific role
  await page.locator('#cw-title').fill(title);
  await page.locator('#cw-deadline').fill(futureDeadline());
  await page.locator('#cw-desc').fill('Feature film shooting in Kigali. Looking for a lead actor.');
  await page.getByRole('button', { name: 'Next' }).click();                           // details
  await page.locator('#cw-role-0').fill('Lead: a teacher in her thirties, warm and determined.');
  await page.getByRole('button', { name: 'Next' }).click();                           // roles → draft saved
  await page.getByRole('button', { name: 'Next' }).click();                           // poster (optional)
}

test('without the Full plan a casting call is published as soon as its per-call fee is paid', async ({ browser }) => {
  // 1. Producer (no plan) writes the call and pays the per-call fee.
  const producer = await browser.newPage();
  await signIn(producer, 'producer');
  await writeCall(producer, TITLE);

  await expect(producer.locator('.mk-price')).toContainText('5,000');
  await producer.getByRole('button', { name: 'Pay & publish' }).click();
  await payWithMobileMoney(producer);

  // Paid → published straight away; nothing waits for an admin.
  await expect(producer.getByText('Published').first()).toBeVisible({ timeout: 30_000 });

  // 2. Viewers see it right away.
  const viewer = await browser.newPage();
  await signIn(viewer, 'viewer');
  await viewer.goto('/casting');
  await expect(viewer.getByRole('heading', { name: 'Casting calls' })).toBeVisible();
  const card = viewer.locator('article.cc-card', { hasText: TITLE });
  await expect(card).toBeVisible();
  await expect(card.locator('.cc-status')).toHaveText('Published');

  // 3. Admins can't approve or reject — only take a call down afterwards.
  const admin = await browser.newPage();
  await signIn(admin, 'admin');
  await admin.goto('/admin/marketplace');
  await admin.getByRole('tab', { name: 'Casting calls' }).click();
  const row = admin.locator('tr', { hasText: TITLE });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Remove' })).toBeVisible();
  await expect(row.getByRole('button', { name: /Approve/ })).toHaveCount(0);
});

test('with the Full plan a casting call is published with no payment', async ({ browser }) => {
  const title = `E2E Full plan ${Date.now()}`;
  const studio = await browser.newPage();
  await signIn(studio, 'studio');
  await writeCall(studio, title);

  await expect(studio.getByText('Included in your Full plan')).toBeVisible();
  await expect(studio.locator('.mk-price')).toHaveCount(0);
  await studio.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(studio.getByText('Published').first()).toBeVisible({ timeout: 30_000 });

  const viewer = await browser.newPage();
  await signIn(viewer, 'viewer');
  await viewer.goto('/casting');
  await expect(viewer.locator('article.cc-card', { hasText: title })).toBeVisible();
});
