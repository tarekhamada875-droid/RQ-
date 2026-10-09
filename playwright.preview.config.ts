import { defineConfig, devices } from '@playwright/test';

const PREVIEW_PAGES_ORIGIN = 'https://migration-unified-hono.rq-acg.pages.dev';
const configuredBaseUrl = process.env.RQ_E2E_BASE_URL;

if (!configuredBaseUrl) {
  throw new Error(
    'RQ_E2E_BASE_URL is required. Set it to the exact approved migration Pages preview URL; production and arbitrary hosts are refused.',
  );
}

let parsedBaseUrl: URL;
try {
  parsedBaseUrl = new URL(configuredBaseUrl);
} catch {
  throw new Error('RQ_E2E_BASE_URL must be a valid HTTPS URL.');
}

if (
  parsedBaseUrl.origin !== PREVIEW_PAGES_ORIGIN ||
  parsedBaseUrl.pathname !== '/' ||
  parsedBaseUrl.search !== '' ||
  parsedBaseUrl.hash !== '' ||
  parsedBaseUrl.username !== '' ||
  parsedBaseUrl.password !== ''
) {
  throw new Error(
    `Playwright preview tests are restricted to ${PREVIEW_PAGES_ORIGIN}. No production or alternate host is allowed.`,
  );
}

export default defineConfig({
  testDir: './e2e/preview',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: 'list',
  outputDir: '.playwright-preview-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: PREVIEW_PAGES_ORIGIN,
    headless: true,
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
});
