const baseUrl = (process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '');

if (!baseUrl) {
  console.log('[SKIP] SMOKE_BASE_URL is not configured; live smoke check was not requested.');
  process.exit(0);
}

const response = await fetch(`${baseUrl}/api/health`, {
  headers: { Accept: 'application/json' }
});
const body = await response.json().catch(() => null) as any;

if (!response.ok || body?.status !== 'ok' || typeof body?.version !== 'string' || body.version === 'unknown') {
  console.error('[FAIL] Live health check failed:', { status: response.status, body });
  process.exit(1);
}

console.log(`[PASS] Live backend is healthy at ${baseUrl} (version ${body.version}).`);
