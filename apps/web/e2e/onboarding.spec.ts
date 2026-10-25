import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

async function signUp(page: Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('New Recruiter');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('test-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

test('user without an organization reaches onboarding, cannot enter the app, then creates an org', async ({ page }) => {
  const navigations: string[] = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && navigations.push(new URL(f.url()).pathname));
  await signUp(page, `new-${Date.now()}@test.local`);

  // App pages send a user with no membership to onboarding exactly once (no loop).
  navigations.length = 0;
  const res = await page.goto('/dashboard');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/onboarding$/);
  expect(navigations.filter((p) => p === '/dashboard').length).toBeLessThanOrEqual(1);
  await expect(page.getByRole('heading', { name: 'Create an organization' })).toBeVisible();

  await page.goto('/requirements');
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Organization name').fill('E2E Staffing');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('E2E Staffing')).toBeVisible();
  await expect(page.getByText('No requirements yet.')).toBeVisible();

  // Members are sent away from onboarding.
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('owner invites a teammate who joins with the code', async ({ browser }) => {
  const owner = await browser.newPage();
  await login(owner);
  await owner.goto('/settings/security');
  await owner.getByLabel('Role').selectOption('viewer');
  await owner.getByRole('button', { name: 'Create invitation code' }).click();
  const code = (await owner.getByTestId('invite-code').textContent())!.trim();
  expect(code).toMatch(/^BF-/);

  const joiner = await browser.newPage();
  await signUp(joiner, `join-${Date.now()}@test.local`);
  await joiner.getByLabel('Invitation code').fill('BF-00000-00000-00000-00000');
  await joiner.getByRole('button', { name: 'Join organization' }).click();
  await expect(joiner.getByText('That invitation code is invalid, expired or already used.')).toBeVisible();
  await joiner.getByLabel('Invitation code').fill(code);
  await joiner.getByRole('button', { name: 'Join organization' }).click();
  await expect(joiner).toHaveURL(/\/dashboard$/);
  await expect(joiner.getByText('Demo Staffing (synthetic)')).toBeVisible();
  await expect(joiner.getByText('viewer', { exact: true })).toBeVisible();
});

test('anonymous users are sent from onboarding to login', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/);
});
