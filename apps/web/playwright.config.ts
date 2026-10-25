import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) }, testIgnore: /responsive/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) }, testMatch: /responsive/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm start', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
