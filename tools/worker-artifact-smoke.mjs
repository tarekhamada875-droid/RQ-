import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const artifactPath = resolve(process.cwd(), 'dist/worker.js');
const expectedVersion = '1.0.0-artifact-smoke';
const expectedCommitSha = '0123456789abcdef0123456789abcdef01234567';
const allowedOrigin = 'https://rq-acg.pages.dev';
const baseUrl = 'https://worker-artifact-smoke.invalid';

function assert(condition, message) {
  if (!condition) throw new Error(`[FAIL] ${message}`);
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`[FAIL] ${label} did not return valid JSON (HTTP ${response.status}).`);
  }
}

const artifactStat = await stat(artifactPath).catch(() => null);
assert(artifactStat?.isFile() && artifactStat.size > 0, 'dist/worker.js is missing or empty.');

// Import the actual production bundle; no Firebase credentials or live bindings are supplied.
const workerModule = await import(pathToFileURL(artifactPath).href);
const worker = workerModule.default;
assert(worker && typeof worker.fetch === 'function', 'dist/worker.js does not export a default fetch handler.');

const env = {
  ENVIRONMENT: 'artifact-smoke',
  ALLOWED_ORIGINS: allowedOrigin,
  WORKER_VERSION: expectedVersion,
  WORKER_COMMIT_SHA: expectedCommitSha
};

async function send(path, init = {}) {
  return worker.fetch(new Request(new URL(path, baseUrl), init), env);
}

// Health, version, and CORS are read-only. The protected route is a GET with no
// credentials, so it must return at the auth guard before any database access.
const healthResponse = await send('/api/health', { method: 'GET' });
assert(healthResponse.status === 200, `GET /api/health returned HTTP ${healthResponse.status}.`);
const health = await readJson(healthResponse, 'GET /api/health');
assert(health.status === 'ok', 'GET /api/health did not report status=ok.');
assert(health.runtime === 'cloudflare-worker', 'GET /api/health reported the wrong runtime.');
assert(health.version === expectedVersion, 'GET /api/health did not use the synthetic version binding.');
assert(health.commitSha === expectedCommitSha, 'GET /api/health did not use the synthetic commit-SHA binding.');
console.log('[PASS] Built Worker GET /api/health returned the expected JSON and release identity.');

const versionResponse = await send('/api/version', { method: 'GET' });
assert(versionResponse.status === 200, `GET /api/version returned HTTP ${versionResponse.status}.`);
const version = await readJson(versionResponse, 'GET /api/version');
assert(version.version === expectedVersion, 'GET /api/version did not use the synthetic version binding.');
assert(version.commitSha === expectedCommitSha, 'GET /api/version did not use the synthetic commit-SHA binding.');
assert(version.runtime === 'cloudflare-worker', 'GET /api/version reported the wrong runtime.');
assert(version.status === 'operational', 'GET /api/version did not report operational status.');
console.log('[PASS] Built Worker GET /api/version returned the expected JSON and release identity.');

const corsResponse = await send('/api/version', {
  method: 'OPTIONS',
  headers: {
    Origin: allowedOrigin,
    'Access-Control-Request-Method': 'GET'
  }
});
assert(corsResponse.status === 204, `CORS preflight returned HTTP ${corsResponse.status}, not 204.`);
assert(corsResponse.headers.get('access-control-allow-origin') === allowedOrigin, 'CORS preflight did not allow the expected origin.');
assert((corsResponse.headers.get('access-control-allow-methods') || '').includes('GET'), 'CORS preflight did not allow GET.');
console.log('[PASS] Built Worker CORS preflight returned the expected origin and method.');

const protectedResponse = await send('/api/garages', { method: 'GET' });
assert(protectedResponse.status === 401, `Unauthenticated GET /api/garages returned HTTP ${protectedResponse.status}, not 401.`);
const protectedBody = await readJson(protectedResponse, 'Unauthenticated GET /api/garages');
assert(typeof protectedBody.error === 'string' && protectedBody.error.includes('Bearer token required'), 'Protected route did not report the expected missing-token error.');
console.log('[PASS] Built Worker denied unauthenticated GET /api/garages before data access.');

console.log('[PASS] dist/worker.js imported and passed all read-only artifact smoke checks.');
