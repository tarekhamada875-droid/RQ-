type HealthBody = {
  status?: unknown;
  adminSdk?: unknown;
  version?: unknown;
};

const baseUrl = (process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '');
const expectedVersion = (process.env.SMOKE_EXPECTED_VERSION || '').trim();
const frontendUrl = (process.env.SMOKE_FRONTEND_URL || baseUrl).replace(/\/+$/, '');
const maxAttempts = Math.max(1, Number.parseInt(process.env.SMOKE_MAX_ATTEMPTS || '12', 10) || 12);
const retryDelayMs = Math.max(1000, Number.parseInt(process.env.SMOKE_RETRY_DELAY_MS || '10000', 10) || 10000);

const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

const isHealthyBody = (body: HealthBody | null): body is HealthBody & {
  status: 'ok';
  adminSdk: true;
  version: string;
} => (
  body?.status === 'ok' &&
  body.adminSdk === true &&
  typeof body.version === 'string' &&
  body.version !== 'unknown'
);

if (!baseUrl) {
  console.log('[SKIP] SMOKE_BASE_URL is not configured; live smoke check was not requested.');
  process.exit(0);
}

let responseStatus = 0;
let body: HealthBody | null = null;
let healthPassed = false;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Accept: 'application/json' }
    });
    responseStatus = response.status;
    body = await response.json().catch(() => null) as HealthBody | null;
    healthPassed = response.ok && isHealthyBody(body);

    const versionMatches = healthPassed && (!expectedVersion || body.version === expectedVersion);
    if (versionMatches) break;

    if (attempt < maxAttempts) {
      const reason = healthPassed && expectedVersion
        ? `waiting for Railway release ${expectedVersion}; currently serving ${body.version}`
        : `waiting for a healthy Railway response (HTTP ${responseStatus})`;
      console.warn(`[WAIT] ${reason} (attempt ${attempt}/${maxAttempts})`);
      await sleep(retryDelayMs);
    }
  } catch (error) {
    if (attempt === maxAttempts) {
      console.error('[FAIL] Live health request failed:', error);
      process.exit(1);
    }
    console.warn(`[WAIT] Live health request failed; retrying (attempt ${attempt}/${maxAttempts})`);
    await sleep(retryDelayMs);
  }
}

if (!healthPassed || !isHealthyBody(body)) {
  console.error('[FAIL] Live health check failed:', { status: responseStatus, body });
  process.exit(1);
}

if (expectedVersion && body.version !== expectedVersion) {
  console.error('[FAIL] Live backend commit does not match the release commit:', {
    expectedVersion,
    actualVersion: body.version,
  });
  process.exit(1);
}

const frontendResponse = await fetch(frontendUrl, { headers: { Accept: 'text/html' } });
if (!frontendResponse.ok) {
  console.error('[FAIL] Live frontend check failed:', { frontendUrl, status: frontendResponse.status });
  process.exit(1);
}

console.log(`[PASS] Live backend ${baseUrl} and frontend ${frontendUrl} are healthy (version ${body.version}).`);
