import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import { createV2AuthMiddleware, createV2CorsMiddleware, type V2AuthDependencies } from '../http/auth.js';
import { InMemoryPackageCatalogRepository } from '../repositories/packageCatalog.js';
import type { Session } from '../contracts/entities.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const session: Session = {
  id: 'session-1', uid: 'uid-1', role: 'garage', garageId: 'garage-1', delegateGarageIds: [],
  expiresAt: '2026-09-20T12:00:00.000Z', lastActiveAt: '2026-09-20T09:55:00.000Z', revoked: false
};
const packageItem = { id: 'package-1', name: 'Weekly', durationDays: 7, vehicleLimit: 10, priceMinor: 1000, active: true };
let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

async function start(dependencies: V2AuthDependencies, cors = false): Promise<string> {
  const v2 = createV2App({
    environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-auth-test' }),
    packageCatalog: new InMemoryPackageCatalogRepository([packageItem]),
    authMiddleware: createV2AuthMiddleware(dependencies),
    ...(cors ? { corsMiddleware: createV2CorsMiddleware({ allowedOrigins: new Set(['https://rq-acg.pages.dev']) }) } : {})
  });
  const root = express();
  root.use(v2);
  server = root.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

const validDependencies: V2AuthDependencies = {
  verifyIdToken: async (token) => {
    if (token !== 'valid-token') throw new Error('INVALID_TOKEN');
    return { uid: 'uid-1' };
  },
  getSession: async () => session,
  now: () => now
};

describe('v2 HTTP authentication and CORS', () => {
  it('rejects protected reads without a bearer token and accepts a valid canonical session', async () => {
    const baseUrl = await start(validDependencies);
    const missing = await fetch(`${baseUrl}/v2/packages`);
    const valid = await fetch(`${baseUrl}/v2/packages`, { headers: { Authorization: 'Bearer valid-token', 'X-Session-ID': 'session-1' } });
    expect(missing.status).toBe(401);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ success: true, data: { items: [packageItem] } });
  });

  it('rejects invalid tokens and stale sessions before reaching the route', async () => {
    const invalidTokenBaseUrl = await start(validDependencies);
    const invalidToken = await fetch(`${invalidTokenBaseUrl}/v2/packages`, { headers: { Authorization: 'Bearer bad-token', 'X-Session-ID': 'session-1' } });
    expect(invalidToken.status).toBe(401);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;

    const staleBaseUrl = await start({ ...validDependencies, getSession: async () => ({ ...session, lastActiveAt: '2026-09-20T09:00:00.000Z' }) });
    const stale = await fetch(`${staleBaseUrl}/v2/packages`, { headers: { Authorization: 'Bearer valid-token', 'X-Session-ID': 'session-1' } });
    expect(stale.status).toBe(401);
  });

  it('enforces role policy after authentication', async () => {
    const baseUrl = await start(validDependencies);
    const pending = await fetch(`${baseUrl}/v2/pending`, { headers: { Authorization: 'Bearer valid-token', 'X-Session-ID': 'session-1' } });
    expect(pending.status).toBe(403);
    expect(await pending.json()).toMatchObject({ success: false, code: 'FORBIDDEN' });
  });

  it('enforces an allowlist and handles CORS preflight without exposing credentials broadly', async () => {
    const baseUrl = await start(validDependencies, true);
    const allowed = await fetch(`${baseUrl}/v2/health`, { headers: { Origin: 'https://rq-acg.pages.dev' } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://rq-acg.pages.dev');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

    const blocked = await fetch(`${baseUrl}/v2/health`, { headers: { Origin: 'https://evil.example' } });
    expect(blocked.status).toBe(403);

    const preflight = await fetch(`${baseUrl}/v2/packages`, { method: 'OPTIONS', headers: { Origin: 'https://rq-acg.pages.dev', 'Access-Control-Request-Method': 'GET' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
