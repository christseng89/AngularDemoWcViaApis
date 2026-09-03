import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/live',
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4200',
    headless: true,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
  },
});
