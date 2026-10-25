import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('mobile navigation opens and is accessible', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Navigation' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('link', { name: 'All Requirements' }).click();
  await expect(page).toHaveURL(/\/requirements/);
});
