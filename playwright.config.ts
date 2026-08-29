import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    locale: 'zh-CN',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'CONVERGENE_E2E_PROVIDER_CONFIG=1 APP_ENCRYPTION_SECRET=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc= UPSTASH_REDIS_REST_URL=https://redis.invalid UPSTASH_REDIS_REST_TOKEN=e2e-test-token pnpm exec next dev --hostname 127.0.0.1 --port 3100',
    // These tests depend on the isolated provider-config runtime above. Reusing an
    // arbitrary dev server can silently route them to Redis or missing credentials.
    reuseExistingServer: false,
    timeout: 30_000,
    url: 'http://127.0.0.1:3100',
  },
});
