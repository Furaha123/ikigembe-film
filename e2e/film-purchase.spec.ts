import { expect, test } from '@playwright/test';
import { blockFakeStorage, filmId, FILMS, payWithMobileMoney, signIn } from './support/session';

test.describe('film purchase and playback', () => {
  test('a coming-soon film shows its release date and cannot be bought or streamed', async ({ page, request }) => {
    const id = await filmId(request, FILMS.comingSoon);
    await signIn(page, 'viewer');
    await page.goto(`/movie/${id}`);
    await expect(page.locator('.btn-watch--soon')).toContainText('Available from');
    await expect(page.locator('button.btn-watch')).toHaveCount(0);

    // The server refuses checkout too, so hiding the button is not the only protection.
    const refresh = await page.request.post('/api/auth/token/refresh/');
    const { access } = await refresh.json() as { access: string };
    const initiate = await page.request.post('/api/payments/initiate/', {
      headers: { Authorization: `Bearer ${access}` },
      data: { movie_id: id, phone_number: '0788123456' },
    });
    expect(initiate.status()).toBe(409);
  });

  test('a viewer buys a released film with demo Mobile Money, plays it, and gets a receipt', async ({ page, request }) => {
    const id = await filmId(request, FILMS.released);
    await blockFakeStorage(page);
    await signIn(page, 'viewer');
    await page.goto(`/movie/${id}`);

    const buy = page.locator('button.btn-watch:not(.btn-watch--owned)');
    await expect(buy).toContainText('RWF 1,000');
    await buy.click();

    // The price comes from the server; paying settles through the demo gateway.
    await expect(page.locator('button.pm-pay-btn')).toContainText('1,000');
    const stream = page.waitForResponse(r => r.url().includes(`/api/movies/${id}/stream/`));
    await payWithMobileMoney(page);

    // After payment the film starts: the stream is authorised for the buyer.
    expect((await stream).status()).toBe(200);
    await expect(page.locator('.player-container')).toBeVisible();
    await page.getByRole('button', { name: 'Close player' }).click();

    // Payment history shows the completed purchase with a receipt.
    await page.goto('/profile');
    const history = page.locator('table.ph-table');
    const row = history.locator('tr', { hasText: FILMS.released });
    await expect(row.locator('.ph-badge')).toHaveText('Completed');
    await row.getByRole('button', { name: 'Receipt' }).click();
    const receipt = page.locator('.receipt-dialog');
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText('1,000');
    await expect(receipt).toContainText(FILMS.released);

    // Escape closes the dialog even with focus inside it.
    await receipt.getByRole('button').first().focus();
    await page.keyboard.press('Escape');
    await expect(receipt).toBeHidden();
  });
});
