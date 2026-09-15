const baseUrl = (process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '');
const expectedVersion = (process.env.SMOKE_EXPECTED_VERSION || '').trim();

if (!baseUrl) {
  console.log('[SKIP] SMOKE_BASE_URL is not configured; live smoke check was not requested.');
  process.exit(0);
}

const response = await fetch(`${baseUrl}/api/health`, {
  headers: { Accept: 'application/json' }
});
const body = await response.json().catch(() => null) as any;

if (!response.ok || body?.status !== 'ok' || body?.adminSdk !== true || typeof body?.version !== 'string' || body.version === 'unknown') {
  console.error('[FAIL] Live health check failed:', { status: response.status, body });
  process.exit(1);
}

if (expectedVersion && body.version !== expectedVersion) {
  console.error('[FAIL] Live backend commit does not match the release commit:', {
    expectedVersion,
    actualVersion: body.version,
  });
  process.exit(1);
}

const frontendResponse = await fetch(baseUrl, { headers: { Accept: 'text/html' } });
if (!frontendResponse.ok) {
  console.error('[FAIL] Live frontend check failed:', { status: frontendResponse.status });
  process.exit(1);
}

console.log(`[PASS] Live backend and frontend are healthy at ${baseUrl} (version ${body.version}).`);
