import { expect, test } from '@playwright/test';
import { FILMS, signIn } from './support/session';

test('an admin filters films by publication status; the API refuses to publish a film without a poster', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/movies');

  // The coming-soon seed film is scheduled: the filter finds it and the badge shows its Kigali release time.
  await page.getByLabel('Status').selectOption('scheduled');
  const row = page.locator('tbody tr', { hasText: FILMS.comingSoon });
  await expect(row).toHaveCount(1);
  await expect(page.locator('tbody tr', { hasText: FILMS.released })).toHaveCount(0);
  await expect(row.locator('app-film-status-badge')).toContainText('Scheduled');
  await expect(row.locator('app-film-status-badge')).toContainText('(Kigali time)');
  await expect(row.getByRole('button', { name: 'Reschedule…' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Unpublish…' })).toBeVisible();

  // Seed films have no poster, so publishing is refused and nothing changes (the server rolls it back).
  await row.getByRole('button', { name: 'Publish now' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Publish this film now?');
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Missing: a poster');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(row.locator('app-film-status-badge')).toContainText('Scheduled');

  // Released films show as Published.
  await page.getByLabel('Status').selectOption('published');
  await expect(page.locator('tbody tr', { hasText: FILMS.released }).locator('app-film-status-badge')).toContainText('Published');
});

test('an admin schedules, publishes and unpublishes an approved film', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/movies');
  const row = page.locator('tbody tr', { hasText: FILMS.unpublished });
  const badge = row.locator('app-film-status-badge');
  const dialog = page.getByRole('dialog');
  const notice = page.getByRole('status').filter({ hasText: FILMS.unpublished });
  await expect(badge).toContainText('Unpublished');
  await expect(row.getByRole('button', { name: 'Unpublish…' })).toHaveCount(0);

  // Schedule: the field is read as Kigali time, and the API confirms the same wall-clock time.
  const year = new Date().getFullYear() + 1;
  await row.getByRole('button', { name: 'Schedule…' }).click();
  await dialog.getByLabel('Release date and time (Kigali time)').fill(`${year}-11-01T20:00`);
  await dialog.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(notice).toContainText(`01 Nov ${year} at 20:00 (Kigali time)`);
  await expect(badge).toContainText('Scheduled');
  await expect(badge).toContainText(`1 Nov ${year}, 20:00`);

  // Publish now moves the release to now.
  await row.getByRole('button', { name: 'Publish now' }).click();
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(dialog).toBeHidden();
  await expect(badge).toContainText('Published');
  await expect(row.getByRole('button', { name: 'Publish now' })).toHaveCount(0);

  // Unpublish with a reason; a released film can't be scheduled again, but can be published again.
  await row.getByRole('button', { name: 'Unpublish…' }).click();
  await dialog.getByLabel('Reason (optional, kept in the audit log)').fill('E2E: rights check');
  await dialog.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(badge).toContainText('Unpublished');
  await expect(notice).toContainText('is unpublished');

  // The status survives a reload (it comes from the server, not the page).
  await page.reload();
  await page.getByLabel('Status').selectOption('unpublished');
  await expect(page.locator('tbody tr', { hasText: FILMS.unpublished }).locator('app-film-status-badge')).toContainText('Unpublished');
});
