import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

export const GARAGE_COUNT = 10;
export const READ_ONLY_PROFILE = [
  { name: 'garage-summary', path: (garageId) => `/api/garage-summary?garageId=${encodeURIComponent(garageId)}` },
  { name: 'dashboard-summary', path: (garageId) => `/api/garages/${encodeURIComponent(garageId)}/dashboard-summary` },
  { name: 'vehicles-inside', path: (garageId) => `/api/vehicles/inside?garageId=${encodeURIComponent(garageId)}` },
  { name: 'vehicle-history', path: (garageId) => `/api/vehicles/history?garageId=${encodeURIComponent(garageId)}&limit=50` }
];

const PRODUCTION_HOSTS = new Set(['rq.tarekhamada875.workers.dev', 'rq-acg.pages.dev']);
const NON_PRODUCTION_ENVIRONMENTS = new Set(['staging', 'test', 'qa', 'development']);

export function parseTokens(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw || '');
  } catch {
    throw new Error('LOAD_TEST_TOKENS_JSON must be valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length !== GARAGE_COUNT) {
    throw new Error(`LOAD_TEST_TOKENS_JSON must contain exactly ${GARAGE_COUNT} synthetic garage identities.`);
  }
  const seen = new Set();
  return parsed.map((entry, index) => {
    const garageId = typeof entry?.garageId === 'string' ? entry.garageId.trim() : '';
    const token = typeof entry?.token === 'string' ? entry.token.trim() : '';
    const sessionId = typeof entry?.sessionId === 'string' ? entry.sessionId.trim() : '';
    if (!garageId || !token || seen.has(garageId)) {
      throw new Error(`Synthetic identity ${index + 1} must have a unique garageId and non-empty token.`);
    }
    seen.add(garageId);
    return { garageId, token, ...(sessionId ? { sessionId } : {}) };
  });
}

export function assertSafeTarget(baseUrl, environment) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('LOAD_TEST_BASE_URL must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('LOAD_TEST_BASE_URL must use HTTP(S).');
  if (PRODUCTION_HOSTS.has(parsed.hostname) || environment === 'production') {
    throw new Error('Refusing to run the load test against production.');
  }
  if (!NON_PRODUCTION_ENVIRONMENTS.has(environment)) {
    throw new Error(`LOAD_TEST_ENVIRONMENT must be one of: ${[...NON_PRODUCTION_ENVIRONMENTS].join(', ')}.`);
  }
  if (process.env.LOAD_TEST_ALLOW_NONPROD !== '1') {
    throw new Error('Set LOAD_TEST_ALLOW_NONPROD=1 as an explicit non-production opt-in.');
  }
  return parsed.href.replace(/\/+$/, '');
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(baseUrl, identity, profile) {
  const started = performance.now();
  const headers = { Accept: 'application/json', Authorization: `Bearer ${identity.token}` };
  if (identity.sessionId) headers['x-session-id'] = identity.sessionId;
  let status = 0;
  let error = null;
  try {
    const response = await fetch(`${baseUrl}${profile.path(identity.garageId)}`, { headers });
    status = response.status;
    await response.arrayBuffer();
    if (!response.ok) error = `HTTP_${response.status}`;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { garageId: identity.garageId, route: profile.name, status, error, latencyMs: performance.now() - started };
}

async function verifyTarget(baseUrl, expectedEnvironment) {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  if (response.status !== 200 || body?.status !== 'ok') throw new Error(`Staging health check failed (HTTP ${response.status}).`);
  if (body.environment !== expectedEnvironment) {
    throw new Error(`Target environment mismatch: expected ${expectedEnvironment}, received ${String(body.environment)}.`);
  }
  if (body.environment === 'production') throw new Error('Target health endpoint identifies production; refusing to continue.');
  return { status: response.status, environment: body.environment, version: body.version, commitSha: body.commitSha };
}

export async function runLoadTest({ baseUrl, environment, identities, durationSeconds = 60, concurrency = 20, outputPath }) {
  const safeBaseUrl = assertSafeTarget(baseUrl, environment);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 900) throw new Error('durationSeconds must be an integer from 1 to 900.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error('concurrency must be an integer from 1 to 100.');
  const health = await verifyTarget(safeBaseUrl, environment);
  const startedAt = new Date().toISOString();
  const deadline = performance.now() + durationSeconds * 1000;
  const results = [];
  let nextIdentity = 0;
  let nextProfile = 0;
  async function worker() {
    while (performance.now() < deadline) {
      const identity = identities[nextIdentity++ % identities.length];
      const profile = READ_ONLY_PROFILE[nextProfile++ % READ_ONLY_PROFILE.length];
      results.push(await request(safeBaseUrl, identity, profile));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const finishedAt = new Date().toISOString();
  const latencies = results.map((result) => result.latencyMs);
  const errors = results.filter((result) => result.error);
  const report = {
    benchmark: 'RQ staging ten-garage read-only HTTP load test',
    syntheticOnly: true,
    productionReads: false,
    writesIssued: false,
    target: { baseUrl: safeBaseUrl, environment, health },
    workload: { garages: identities.length, routes: READ_ONLY_PROFILE.map(({ name }) => name), durationSeconds, concurrency },
    startedAt,
    finishedAt,
    totals: { requests: results.length, errors: errors.length, errorRate: results.length ? Number((errors.length / results.length).toFixed(4)) : 0 },
    latencyMs: { min: latencies.length ? Number(Math.min(...latencies).toFixed(2)) : null, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99), max: latencies.length ? Number(Math.max(...latencies).toFixed(2)) : null },
    statusCounts: Object.fromEntries(Object.entries(Object.groupBy(results, (result) => String(result.status))).map(([status, values]) => [status, values.length])),
    routeCounts: Object.fromEntries(Object.entries(Object.groupBy(results, (result) => result.route)).map(([route, values]) => [route, { requests: values.length, errors: values.filter((result) => result.error).length, p95Ms: percentile(values.map((value) => value.latencyMs), 0.95) }])),
    garageCounts: Object.fromEntries(Object.entries(Object.groupBy(results, (result) => result.garageId)).map(([garageId, values]) => [garageId, { requests: values.length, errors: values.filter((result) => result.error).length }])),
    errors: errors.slice(0, 100).map(({ garageId, route, status, error }) => ({ garageId, route, status, error })),
    note: 'Read-only staging traffic using synthetic garage identities. This report does not include Cloudflare CPU/memory or Firestore billing; collect those separately from the staging providers.'
  };
  if (outputPath) {
    const resolvedOutputPath = resolve(outputPath);
    await mkdir(dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const environment = (process.env.LOAD_TEST_ENVIRONMENT || '').trim().toLowerCase();
  const identities = parseTokens(process.env.LOAD_TEST_TOKENS_JSON);
  const report = await runLoadTest({
    baseUrl: process.env.LOAD_TEST_BASE_URL || '',
    environment,
    identities,
    durationSeconds: Number.parseInt(process.env.LOAD_TEST_DURATION_SECONDS || '60', 10),
    concurrency: Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || '20', 10),
    outputPath: process.env.LOAD_TEST_OUTPUT || 'artifacts/ten-garage-load-test.json'
  });
  console.log(JSON.stringify(report, null, 2));
}
