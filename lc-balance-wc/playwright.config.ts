import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'live/**',
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, channel: 'chrome' },
  webServer: {
    command: 'npm run release:prepare && npm run build:e2e-hosts && node scripts/serve-e2e.mjs',
    port: 4173,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
