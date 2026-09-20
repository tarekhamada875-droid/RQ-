import { describe, expect, it } from 'vitest';
import { AuthorizationContextSchema } from '../contracts/auth.js';
import { createRequestContext, hashSessionId } from '../observability/requestContext.js';
import { redactAuditPayload } from '../observability/redaction.js';
import { InMemoryRateLimiter } from '../security/rateLimit.js';

describe('v2 observability and operational policies', () => {
  it('stores audit-safe request context without a raw session ID', () => {
    const authorization = AuthorizationContextSchema.parse({ uid: 'uid-1', sessionId: 'session-secret', role: 'garage', garageId: 'garage-1', delegateGarageIds: [] });
    const context = createRequestContext({
      requestId: '2f1d4d2d-3b15-4a01-9d45-8ee1d8cf0c16', route: '/v2/garages/garage-1/summary',
      operation: 'garage_summary.read', resultCode: 'OK', latencyMs: 12, authorization, firestoreReads: 1
    });
    expect(context.actorUid).toBe('uid-1');
    expect(context.tenantId).toBe('garage-1');
    expect(context.sessionIdHash).toBe(hashSessionId('session-secret'));
    expect(JSON.stringify(context)).not.toContain('session-secret');
  });

  it('redacts credentials and financial fields recursively', () => {
    expect(redactAuditPayload({ authorization: 'Bearer secret', pin: '1234', wallet: { balance: 9000 }, safe: 'ok' })).toEqual({
      authorization: '[REDACTED]', pin: '[REDACTED]', wallet: '[REDACTED]', safe: 'ok'
    });
  });

  it('enforces independent fixed windows and retry timing', () => {
    const limiter = new InMemoryRateLimiter(2, 1000);
    expect(limiter.check('uid-1', 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check('uid-1', 100)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check('uid-1', 200)).toMatchObject({ allowed: false, remaining: 0, retryAfterMs: 800 });
    expect(limiter.check('uid-2', 200)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check('uid-1', 1000)).toMatchObject({ allowed: true, remaining: 1 });
  });
});
