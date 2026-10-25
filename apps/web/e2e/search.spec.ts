import { expect, test } from '@playwright/test';
import { login } from './helpers';

const count = async (page: import('@playwright/test').Page) =>
  Number((await page.getByText(/^\d+ requirements?$/).textContent())!.split(' ')[0]);

test.beforeEach(async ({ page }) => login(page));

test('uppercase state code expands; lowercase and ambiguous two-letter words stay literal', async ({ page }) => {
  await page.goto('/requirements?q=Data%20Engineer%20AND%20Snowflake%20AND%20TX');
  expect(await count(page)).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Data Engineer', exact: true })).toBeVisible();

  await page.goto('/requirements?q=QA');
  await expect(page.getByRole('link', { name: 'QA Automation Engineer' })).toBeVisible();

  await page.goto('/requirements?q=state:IN');
  await expect(page.getByText('No requirements match this search.')).toBeVisible();
});

test('combined query and filters, and empty results', async ({ page }) => {
  await page.goto('/requirements?q=Java%20AND%20TX&tax=C2C&arrangement=onsite');
  expect(await count(page)).toBe(2);
  await page.goto('/requirements?q=zzzznotaskill');
  await expect(page.getByText('0 requirements')).toBeVisible();
  await expect(page.getByText('No requirements match this search.')).toBeVisible();
});
