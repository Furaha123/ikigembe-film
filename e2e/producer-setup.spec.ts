import { expect, Page, test } from '@playwright/test';
import { ACCOUNTS, signIn } from './support/session';

const SETUP_BANNER = 'Finish setting up your producer account';

/** Draws a signature wide and long enough for the pad to accept it. */
async function drawSignature(page: Page): Promise<void> {
  const canvas = page.locator('app-signature-pad canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y - box.height * 0.2, { steps: 15 });
  await page.mouse.move(box.x + box.width * 0.9, y + box.height * 0.2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('app-signature-pad .pad')).toHaveClass(/has-ink/);
}

test('a viewer becomes a producer, completes the profile once, signs the agreement and can upload', async ({ page }) => {
  await signIn(page, 'maker');

  // 1. Become a producer: no admin approval step.
  await page.goto('/profile');
  const card = page.locator('section.card', { hasText: 'Become a Producer' });
  await card.getByRole('button', { name: 'Become a Producer' }).click();
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/\/producer\/onboarding/);

  // 2. The profile can't be skipped and needs every required field.
  await expect(page.getByText('Skip setup for now')).toHaveCount(0);
  await page.locator('#ob-country').selectOption('Rwanda');
  await page.locator('#ob-exp').selectOption('intermediate');
  await page.locator('#ob-bio').fill('Documentary maker from Huye telling stories about rural Rwanda.');
  await page.getByRole('button', { name: 'Complete Setup' }).click();

  // 3. Straight on to the agreement. Before signing, upload stays closed.
  await expect(page).toHaveURL(/\/producer\/contracts\/start/);
  await page.goto('/producer/dashboard');
  await expect(page.getByText(SETUP_BANNER)).toBeVisible();
  await expect(page.locator('a.topbar-upload-btn')).toHaveCount(0);
  await page.goto('/producer/upload');
  await expect(page).toHaveURL(/\/producer\/dashboard/);

  // 4. Sign: welcome → language → review (scroll to the end) → accept (signature, name, consent).
  await page.getByRole('link', { name: 'Sign the agreement' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/contracts\/language/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/contracts\/review/);
  await page.locator('.agreement-scroll').evaluate(el => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await page.getByRole('button', { name: /I've Read This/ }).click();
  await expect(page).toHaveURL(/\/contracts\/accept/);

  await drawSignature(page);
  const accept = page.getByRole('button', { name: /Accept & Continue/ });
  await page.locator('#signed-name').fill('Someone Else');
  await page.locator('label.checkbox-row input[type=checkbox]').check();
  await expect(accept).toBeDisabled();                 // the name must match the account
  await page.locator('#signed-name').fill(ACCOUNTS.maker.name);
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByRole('heading', { name: 'Agreement Approved' })).toBeVisible({ timeout: 30_000 });

  // 5. Setup is done: the banner is gone and upload is open, without reloading.
  await page.getByRole('link', { name: 'Return to Dashboard' }).click();
  await expect(page.getByText(SETUP_BANNER)).toHaveCount(0);
  await page.locator('a.topbar-upload-btn').click();
  await expect(page).toHaveURL(/\/producer\/upload/);
});
