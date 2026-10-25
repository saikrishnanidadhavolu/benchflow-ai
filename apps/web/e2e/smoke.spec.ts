import { expect, test } from '@playwright/test';
import { login, VIEWER } from './helpers';

test('redirects anonymous users to login', async ({ page }) => {
  await page.goto('/requirements');
  await expect(page).toHaveURL(/\/login\?next=%2Frequirements/);
});

test('rejects bad credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@benchflow.local');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
});

test('dashboard shows live counts', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Total collected')).toBeVisible();
  await expect(page.getByText('Synthetic demo data')).toBeVisible();
});

test('boolean search with filters persists when returning from a job', async ({ page }) => {
  await login(page);
  await page.goto('/requirements?q=Java%20AND%20AWS%20AND%20C2C&state=TX');
  await expect(page.getByText(/^\d+ requirements?$/)).toBeVisible();
  const first = page.locator('main ul li a').first();
  const title = await first.textContent();
  await first.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title ?? '');
  await page.getByRole('link', { name: 'Back to results' }).click();
  await expect(page).toHaveURL(/q=Java/);
  await expect(page).toHaveURL(/state=TX/);
});

test('manual entry creates a requirement and detects exact duplicates by job ID', async ({ page }) => {
  await login(page);
  const jobId = `E2E-${Date.now()}`;
  for (let i = 0; i < 2; i++) {
    await page.goto('/requirements/new');
    await page.getByLabel('Job title *').fill('E2E Snowflake Engineer');
    await page.getByLabel('Job ID from source').fill(jobId);
    await page.getByLabel('Required skills').fill('Snowflake, dbt');
    await page.getByLabel('State').fill('Texas');
    await page.getByRole('button', { name: 'Save requirement' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E Snowflake Engineer');
  }
  await page.goto(`/requirements?q=jobid:${jobId}`);
  await expect(page.getByText('1 requirement', { exact: true })).toBeVisible();
});

test('viewer cannot add requirements', async ({ page }) => {
  await login(page, VIEWER);
  await page.goto('/requirements');
  await expect(page.getByRole('link', { name: 'Add requirement' })).toHaveCount(0);
});
