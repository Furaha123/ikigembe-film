import { expect, test } from '@playwright/test';
import { ACCOUNTS, FILMS, signIn } from './support/session';

test('an admin refunds a demo purchase with a reason; the buyer sees it refunded', async ({ browser }) => {
  // The seed made this purchase through the real settlement path (entitlement, ledger, receipt).
  const admin = await browser.newPage();
  await signIn(admin, 'admin');
  await admin.goto('/admin/payments');
  await admin.locator('input[name=q]').fill(ACCOUNTS.refund.email);
  await admin.getByRole('button', { name: 'Apply' }).click();

  const row = admin.locator('table.ledger tbody tr', { hasText: FILMS.refunded });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Details' }).click();

  const drawer = admin.locator('aside.drawer');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Refund', exact: true }).click();

  const form = drawer.locator('form.refund-form');
  const start = form.getByRole('button', { name: 'Start refund' });
  await start.click();                                                   // a reason is required
  await expect(drawer.getByRole('alert')).toContainText('Please give a reason.');
  await form.locator('textarea[name=reason]').fill('Customer could not play the film (E2E).');
  await start.click();

  await expect(drawer.getByText('Refund started.')).toBeVisible();
  // Demo payments return money immediately, so the refund completes and the payment is Refunded.
  await expect(drawer.locator('.status-badge.status-refund').first()).toHaveText('Completed');
  await expect(drawer.getByRole('button', { name: 'Refund', exact: true })).toHaveCount(0);  // nothing left to refund

  // Escape closes the drawer from inside it; clicking inside never did.
  await drawer.locator('h2').click();
  await expect(drawer).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  // The buyer's history shows it, and the film is no longer owned.
  const buyer = await browser.newPage();
  await signIn(buyer, 'refund');
  await buyer.goto('/profile');
  const history = buyer.locator('table.ph-table tr', { hasText: FILMS.refunded });
  await expect(history.locator('.ph-badge')).toHaveText('Refunded');
});
