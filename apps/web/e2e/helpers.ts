import { expect, type Page } from '@playwright/test';

export const DEMO = { email: 'demo@benchflow.local', password: 'demo-password-123' };
export const VIEWER = { email: 'viewer@benchflow.local', password: 'demo-password-123' };

export async function login(page: Page, user = DEMO) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
