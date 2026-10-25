import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('vendor directory: create, filter by category, view, export', async ({ page }) => {
  await login(page);
  const name = `E2E Prime ${Date.now()}`;
  await page.goto('/vendors/new');
  await page.getByLabel('Company name *').fill(name);
  await page.getByLabel('Category').selectOption('prime_vendor');
  await page.getByLabel('Official website').fill('https://prime.example.com');
  await page.getByRole('button', { name: 'Save vendor' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);

  await page.goto('/vendors?category=prime_vendor');
  await expect(page.getByRole('heading', { name: 'Prime Vendors' })).toBeVisible();
  await expect(page.getByRole('link', { name })).toBeVisible();

  const res = await page.request.get('/api/vendors/export?category=prime_vendor');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain(name);
});

test('export requires authentication', async ({ request }) => {
  const res = await request.get('/api/vendors/export', { maxRedirects: 0 });
  expect([307, 401]).toContain(res.status());
});
