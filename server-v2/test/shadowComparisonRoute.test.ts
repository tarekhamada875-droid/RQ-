import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createV2App } from '../app.js';
import type { ShadowComparisonProvider } from '../contracts/shadowComparison.js';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

async function start(role: 'admin' | 'garage' = 'admin', enabled = true, provider: ShadowComparisonProvider = async () => ({ mode: 'v2', reason: 'comparison_equal', comparison: { endpoint: '/api/v2/packages', requestId: 'req-1', dataVersion: 1, equality: true, mismatches: [], financialMismatch: false, authorizationMismatch: false, financialMismatchHard: false, authorizationMismatchHard: false } })) {
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: enabled ? 'test' : 'production', FIREBASE_PROJECT_ID: 'rq-shadow-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true', V2_SHADOW_COMPARISON_ENABLED: String(enabled) }),
    shadowComparison: provider,
    authMiddleware: (request, _response, next) => { request.v2Authorization = { uid: 'actor-1', sessionId: 'session-1', role, delegateGarageIds: [] }; next(); }
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

const post = (baseUrl: string, body: unknown) => fetch(`${baseUrl}/v2/shadow/compare`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('v2 shadow comparison route', () => {
  it('delegates a valid admin request and returns the outcome', async () => {
    const provider = vi.fn<ShadowComparisonProvider>(async ({ requestId }) => ({ mode: 'legacy', reason: 'comparison_mismatch', comparison: { endpoint: '/api/v2/packages', requestId, dataVersion: 1, equality: false, mismatches: [], financialMismatch: false, authorizationMismatch: false, financialMismatchHard: false, authorizationMismatchHard: false } }));
    const response = await post(await start('admin', true, provider), { endpoint: 'packages' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { mode: 'legacy', reason: 'comparison_mismatch' } });
    expect(provider).toHaveBeenCalledOnce();
  });

  it('requires admin access and strict request validation', async () => {
    expect((await post(await start('garage'), { endpoint: 'packages' })).status).toBe(403);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    expect((await post(await start('admin'), { endpoint: 'garage_summary' })).status).toBe(400);
  });

  it('is not exposed while the feature flag is disabled', async () => {
    expect((await post(await start('admin', false), { endpoint: 'packages' })).status).toBe(404);
  });
});
