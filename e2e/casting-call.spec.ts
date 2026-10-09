import { expect, test } from '@playwright/test';
import { payWithMobileMoney, signIn } from './support/session';

const TITLE = `E2E Casting ${Date.now()}`;

/** A deadline two weeks ahead, in the datetime-local format. */
function futureDeadline(): string {
  const d = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
}

test('a casting call is published only after payment AND admin approval', async ({ browser }) => {
  // 1. Producer writes the call and pays the announcement fee.
  const producer = await browser.newPage();
  await signIn(producer, 'producer');
  await producer.goto('/producer/casting/new');
  await producer.getByRole('button', { name: 'Next' }).click();                       // type: a specific role

  await producer.locator('#cw-title').fill(TITLE);
  await producer.locator('#cw-deadline').fill(futureDeadline());
  await producer.locator('#cw-desc').fill('Feature film shooting in Kigali. Looking for a lead actor.');
  await producer.getByRole('button', { name: 'Next' }).click();                       // details

  await producer.locator('#cw-role-0').fill('Lead: a teacher in her thirties, warm and determined.');
  await producer.getByRole('button', { name: 'Next' }).click();                       // roles → draft saved
  await producer.getByRole('button', { name: 'Next' }).click();                       // poster (optional)

  await expect(producer.locator('.mk-price')).toContainText('20,000');
  await producer.getByRole('button', { name: 'Pay & send for review' }).click();
  await payWithMobileMoney(producer);

  // Paid, but not published: it waits for an admin.
  await expect(producer.getByText('In review').first()).toBeVisible({ timeout: 30_000 });

  // 2. A viewer can't see it yet.
  const viewer = await browser.newPage();
  await signIn(viewer, 'viewer');
  await viewer.goto('/casting');
  await expect(viewer.getByRole('heading', { name: 'Casting calls' })).toBeVisible();
  await expect(viewer.locator('article.cc-card', { hasText: TITLE })).toHaveCount(0);

  // 3. Admin approves it.
  const admin = await browser.newPage();
  await signIn(admin, 'admin');
  await admin.goto('/admin/marketplace');
  await admin.getByRole('tab', { name: 'Casting calls' }).click();
  const row = admin.locator('tr', { hasText: TITLE });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Approve & publish' }).click();
  await expect(row).toHaveCount(0);                                                     // left the "In review" list

  // 4. Now it is public.
  await viewer.reload();
  const card = viewer.locator('article.cc-card', { hasText: TITLE });
  await expect(card).toBeVisible();
  await expect(card.locator('.cc-status')).toHaveText('Published');
});
