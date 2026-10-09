import { expect, test } from '@playwright/test';

const PREVIEW_WORKER_ORIGIN = 'https://rq-hono-preview.tarekhamada875.workers.dev';

test('migration preview serves the unauthenticated shell and isolated Worker health', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.name));

  const pageResponse = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(pageResponse?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe('https://migration-unified-hono.rq-acg.pages.dev');

  // A fresh browser context must land on the generic login screen. No PIN is
  // entered and the login action remains disabled, so no auth mutation occurs.
  await expect(page.getByText('أدخل الرمز السري...', { exact: true })).toBeVisible();
  const loginButton = page.getByRole('button', { name: 'تسجيل الدخول' });
  await expect(loginButton).toBeVisible();
  await expect(loginButton).toBeDisabled();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  // These are GET-only public health/version routes. Fetching from the Pages
  // origin also exercises the preview Worker CORS allowlist without credentials.
  const workerResponses = await page.evaluate(async (workerOrigin) => {
    const readJson = async (path: string) => {
      const response = await fetch(`${workerOrigin}${path}`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
      const payload = await response.json();
      return {
        httpStatus: response.status,
        status: payload.status,
        environment: payload.environment,
        runtime: payload.runtime,
        version: payload.version,
      };
    };

    return {
      health: await readJson('/api/health'),
      version: await readJson('/api/version'),
    };
  }, PREVIEW_WORKER_ORIGIN);

  expect(workerResponses.health).toMatchObject({
    httpStatus: 200,
    status: 'ok',
    environment: 'preproduction',
    runtime: 'cloudflare-worker',
  });
  expect(workerResponses.version).toMatchObject({
    httpStatus: 200,
    status: 'operational',
    environment: 'preproduction',
    runtime: 'cloudflare-worker',
  });
  expect(workerResponses.version.version).toEqual(expect.any(String));
  expect(workerResponses.version.version.length).toBeGreaterThan(0);

  // Keep diagnostics low-risk: only assert that the page had no uncaught JS
  // exceptions; do not collect or print console payloads or request details.
  expect(pageErrors).toEqual([]);
});
