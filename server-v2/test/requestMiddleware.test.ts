import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import { createV2AuthMiddleware, type V2AuthDependencies } from '../http/auth.js';
import { createV2RateLimitMiddleware, createV2RequestContextMiddleware } from '../http/observability.js';
import { InMemoryRateLimiter } from '../security/rateLimit.js';
import { InMemoryPackageCatalogRepository } from '../repositories/packageCatalog.js';
import type { RequestContext } from '../observability/requestContext.js';

const session = {
  id: 'session-1', uid: 'uid-1', role: 'garage' as const, garageId: 'garage-1', delegateGarageIds: [],
  expiresAt: '2026-09-20T12:00:00.000Z', lastActiveAt: '2026-09-20T09:55:00.000Z', revoked: false
};
const auth: V2AuthDependencies = {
  verifyIdToken: async () => ({ uid: 'uid-1' }),
  getSession: async () => session,
  now: () => new Date('2026-09-20T10:00:00.000Z')
};
const packageItem = { id: 'package-1', name: 'Weekly', durationDays: 7, vehicleLimit: 10, priceMinor: 1000, active: true };
let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe('v2 request observability middleware', () => {
  it('uses one request ID, limits by authenticated UID, and records a redacted context', async () => {
    const contexts: RequestContext[] = [];
    const app = express();
    app.use(createV2App({
      environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-observability-test' }),
      packageCatalog: new InMemoryPackageCatalogRepository([packageItem]),
      requestContextMiddleware: createV2RequestContextMiddleware((context) => contexts.push(context)),
      authMiddleware: createV2AuthMiddleware(auth),
      rateLimitMiddleware: createV2RateLimitMiddleware(new InMemoryRateLimiter(1, 60_000))
    }));
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const headers = { Authorization: 'Bearer valid-token', 'X-Session-ID': 'session-1', 'X-Request-ID': '2f1d4d2d-3b15-4a01-9d45-8ee1d8cf0c16' };

    const first = await fetch(`http://127.0.0.1:${address.port}/v2/packages`, { headers });
    const second = await fetch(`http://127.0.0.1:${address.port}/v2/packages`, { headers });

    expect(first.status).toBe(200);
    expect(first.headers.get('x-request-id')).toBe(headers['X-Request-ID']);
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBe('60');
    expect(second.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toMatchObject({ requestId: headers['X-Request-ID'], actorUid: 'uid-1', tenantId: 'garage-1' });
    expect(JSON.stringify(contexts[0])).not.toContain('session-1');
  });
});
