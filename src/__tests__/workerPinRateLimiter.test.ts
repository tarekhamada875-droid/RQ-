import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PinRateLimiterDurableObject, type PinRateLimiterNamespace } from '../../server/workerPinRateLimiter';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { api } from '../../server/api';
import { computeLookupHash, hashPinWithUniqueSalt } from '../../server/utils';

class MemoryStorage {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }
}

class MemoryNamespace implements PinRateLimiterNamespace {
  private readonly records = new Map<string, MemoryStorage>();

  clear(): void {
    this.records.clear();
  }

  idFromName(name: string): string {
    return name;
  }

  get(id: string): { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } {
    let storage = this.records.get(id);
    if (!storage) {
      storage = new MemoryStorage();
      this.records.set(id, storage);
    }
    const object = new PinRateLimiterDurableObject({ storage });
    return { fetch: (input, init) => object.fetch(new Request(input, init)) };
  }
}

describe('Worker PIN rate limiter', () => {
  it('serializes a bounded counter and resets after the window', async () => {
    const storage = new MemoryStorage();
    const object = new PinRateLimiterDurableObject({ storage });
    const bucket = 'a'.repeat(64);

    const first = await object.fetch(new Request(`https://limiter/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'check', maxAttempts: 2, now: 1_000 })
    }));
    const second = await object.fetch(new Request(`https://limiter/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'check', maxAttempts: 2, now: 1_001 })
    }));
    const denied = await object.fetch(new Request(`https://limiter/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'check', maxAttempts: 2, now: 1_002 })
    }));
    const afterWindow = await object.fetch(new Request(`https://limiter/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'check', maxAttempts: 2, now: 62_000 })
    }));

    expect((await first.json()).allowed).toBe(true);
    expect((await second.json()).remaining).toBe(0);
    expect((await denied.json()).allowed).toBe(false);
    expect((await afterWindow.json()).allowed).toBe(true);
  });

  it('rejects malformed buckets and unsupported methods', async () => {
    const object = new PinRateLimiterDurableObject({ storage: new MemoryStorage() });
    const malformed = await object.fetch(new Request('https://limiter/not-a-hash', { method: 'POST', body: '{}' }));
    const method = await object.fetch(new Request(`https://limiter/${'b'.repeat(64)}`, { method: 'GET' }));

    expect(malformed.status).toBe(400);
    expect(method.status).toBe(405);
  });

  describe('authentication route integration', () => {
    const limiter = new MemoryNamespace();

    beforeEach(() => {
      mockDb.clear();
      limiter.clear();
      mockDb.seed('private_pins/auth_pin', { pin: '12345678' });
    });

    async function verifyPin(
      pin: string,
      sessionId: string,
      env: Record<string, unknown> = { PIN_RATE_LIMITER: limiter },
      executionContext?: unknown,
      authToken = 'valid-admin-token',
      expectedRole?: 'delegate'
    ) {
      return api.fetch(new Request('http://localhost/api/auth/verify-pin', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
          'cf-connecting-ip': '198.51.100.20'
        },
        body: JSON.stringify({ pin, sessionId, ...(expectedRole ? { expectedRole } : {}) })
      }), env, executionContext as any);
    }

    async function postAuth(path: string, body: Record<string, unknown>, env: Record<string, unknown> = { PIN_RATE_LIMITER: limiter }) {
      return api.fetch(new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-admin-token',
          'content-type': 'application/json',
          'cf-connecting-ip': '198.51.100.20'
        },
        body: JSON.stringify(body)
      }), env);
    }

    it('fails closed when the production limiter binding is unavailable', async () => {
      const response = await verifyPin('87654321', 'missing-binding', {});
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ success: false, error: 'RATE_LIMITER_UNAVAILABLE' });
    });

    it('enforces the account bucket before PIN lookup', async () => {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const response = await verifyPin('87654321', `failed-${attempt}`);
        expect(response.status).toBe(200);
      }

      const denied = await verifyPin('87654321', 'failed-11');
      expect(denied.status).toBe(429);
      expect(await denied.json()).toMatchObject({ success: false, error: 'RATE_LIMIT_EXCEEDED' });
    });

    it('resets account and IP buckets only after a successful session claim', async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await verifyPin('87654321', `before-success-${attempt}`);
      }

      const success = await verifyPin('12345678', 'successful-session');
      expect(success.status).toBe(200);
      expect(await success.json()).toMatchObject({ success: true, role: 'admin', sessionClaimed: true });

      const allowedAgain = await verifyPin('87654321', 'after-success');
      expect(allowedAgain.status).toBe(200);
      expect(await allowedAgain.json()).toMatchObject({ success: false, error: 'بيانات الدخول غير صحيحة' });
    });

    it('verifies an anonymous identity and claims a PIN role without prior-role lookups', async () => {
      const docSpy = vi.spyOn(mockDb, 'doc');

      try {
        const response = await verifyPin('12345678', 'anonymous-login-session', undefined, undefined, 'valid-worker-token');
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, role: 'admin', sessionClaimed: true });

        const requestedPaths = docSpy.mock.calls.map(([path]) => path);
        expect(requestedPaths).not.toContain('admins/worker-uid');
        expect(requestedPaths).not.toContain('staff/worker-uid');
        expect(requestedPaths).not.toContain('garages/worker-uid');
        expect(requestedPaths).not.toContain('supervisor_sessions/worker-uid');
        expect(requestedPaths).not.toContain('delegate_sessions/worker-uid');
        expect(requestedPaths).not.toContain('garage_sessions/worker-uid');
        expect(requestedPaths).not.toContain('staff_sessions/worker-uid');
        expect(requestedPaths.filter((path) => path === 'admin_sessions/worker-uid')).toHaveLength(1);
      } finally {
        docSpy.mockRestore();
      }
    });

    it('rejects a valid Admin PIN in Delegate-scoped login before migration or session claim', async () => {
      const response = await verifyPin('12345678', 'delegate-scope-admin-pin', undefined, undefined, 'valid-worker-token', 'delegate');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: false, error: 'بيانات الدخول غير صحيحة' });
      expect(mockDb.records.has('admin_sessions/worker-uid')).toBe(false);
      expect(mockDb.records.has('delegate_sessions/worker-uid')).toBe(false);
      expect(mockDb.records.get('private_pins/auth_pin')).toEqual({ pin: '12345678' });
    });

    it('claims a Delegate session for a valid PIN in Delegate-scoped login', async () => {
      const delegatePin = '24681357';
      mockDb.seed('private_pins/qa-delegate', {
        entityType: 'delegates',
        entityId: 'qa-delegate',
        pin: hashPinWithUniqueSalt(delegatePin),
        pinLookupHash: computeLookupHash(delegatePin)
      });
      mockDb.seed('delegates/qa-delegate', { name: 'QA Delegate' });

      const response = await verifyPin(delegatePin, 'delegate-scoped-session', undefined, undefined, 'valid-worker-token', 'delegate');

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, role: 'delegate', accountId: 'qa-delegate', sessionClaimed: true });
      expect(mockDb.records.get('delegate_sessions/worker-uid')).toMatchObject({ role: 'delegate', entityId: 'qa-delegate', isActive: true });
      expect(mockDb.records.has('admin_sessions/worker-uid')).toBe(false);
    });

    it('rejects a preserved legacy Supervisor PIN without creating a session or changing records', async () => {
      const supervisorPin = '13572468';
      mockDb.seed('private_pins/legacy-supervisor', {
        entityType: 'supervisors',
        entityId: 'legacy-supervisor',
        pin: hashPinWithUniqueSalt(supervisorPin),
        pinLookupHash: computeLookupHash(supervisorPin)
      });
      const legacyRecord = { name: 'Preserved legacy Supervisor', role: 'supervisor' };
      mockDb.seed('supervisors/legacy-supervisor', legacyRecord);

      const response = await verifyPin(supervisorPin, 'retired-supervisor-session', undefined, undefined, 'valid-worker-token');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: false, error: 'بيانات الدخول غير صحيحة' });
      expect(mockDb.records.has('supervisor_sessions/worker-uid')).toBe(false);
      expect(mockDb.records.get('supervisors/legacy-supervisor')).toEqual(legacyRecord);
    });

    it('does not migrate a plain legacy Supervisor PIN during rejected login', async () => {
      const supervisorPin = '86421357';
      const legacyRecord = { name: 'Plain legacy Supervisor', role: 'supervisor', pin: supervisorPin };
      mockDb.seed('supervisors/plain-legacy-supervisor', legacyRecord);

      const response = await verifyPin(supervisorPin, 'plain-legacy-supervisor-session', undefined, undefined, 'valid-worker-token');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: false, error: 'بيانات الدخول غير صحيحة' });
      expect(mockDb.records.get('supervisors/plain-legacy-supervisor')).toEqual(legacyRecord);
      expect(mockDb.records.has('private_pins/plain-legacy-supervisor')).toBe(false);
      expect(mockDb.records.has('supervisor_sessions/worker-uid')).toBe(false);
    });

    it('returns a successful claim without waiting for limiter reset and logs only safe timing fields', async () => {
      let releaseReset!: () => void;
      const resetGate = new Promise<void>((resolve) => { releaseReset = resolve; });
      const delayedLimiter: PinRateLimiterNamespace = {
        idFromName: (name) => limiter.idFromName(String(name)),
        get: (id) => {
          const base = limiter.get(String(id));
          return {
            fetch: async (input, init) => {
              const command = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
              if (command.action === 'reset') await resetGate;
              return base.fetch(input, init);
            }
          };
        }
      };
      const backgroundTasks: Promise<unknown>[] = [];
      const executionContext = { waitUntil: (promise: Promise<unknown>) => backgroundTasks.push(promise) };
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const responsePromise = verifyPin('12345678', 'synthetic-delayed-reset-session', { PIN_RATE_LIMITER: delayedLimiter }, executionContext);

      try {
        const outcome = await Promise.race([
          responsePromise.then((response) => ({ response })),
          new Promise<{ timeout: true }>((resolve) => setTimeout(() => resolve({ timeout: true }), 500))
        ]);
        expect('timeout' in outcome).toBe(false);
        if ('timeout' in outcome) return;

        expect(outcome.response.status).toBe(200);
        expect(await outcome.response.json()).toMatchObject({ success: true, role: 'admin', sessionClaimed: true });
        expect(backgroundTasks).toHaveLength(1);

        const timingCall = infoSpy.mock.calls.find(([message]) => message === '[Worker Auth] verify-pin timing');
        expect(timingCall).toBeDefined();
        const timing = JSON.stringify(timingCall?.[1] || {});
        expect(timing).toContain('"resetDeferred":true');
        expect(timing).toContain('"sessionClaimMs"');
        expect(timing).not.toContain('12345678');
        expect(timing).not.toContain('synthetic-delayed-reset-session');
        expect(timing).not.toContain('admin-uid');
      } finally {
        releaseReset();
        await Promise.allSettled(backgroundTasks);
        await responsePromise.catch(() => undefined);
        infoSpy.mockRestore();
      }
    });

    it('supports admin PIN verification and explicit admin session claim', async () => {
      const verification = await postAuth('/api/auth/verify-admin-pin', { pin: '12345678' });
      expect(verification.status).toBe(200);
      expect(await verification.json()).toEqual({ valid: true });

      const claim = await postAuth('/api/auth/claim-admin-session', { uid: 'admin-uid', sessionId: 'claimed-session', pin: '12345678' });
      expect(claim.status).toBe(200);
      expect(await claim.json()).toMatchObject({ success: true, sessionClaimed: true });
      expect(mockDb.records.get('admin_sessions/admin-uid/sessions/claimed-session')?.isActive).toBe(true);
    });

    it('supports sanitized PIN availability and admin PIN rotation', async () => {
      const availability = await postAuth('/api/auth/check-pin-availability', { pin: '12345678' });
      expect(availability.status).toBe(200);
      expect(await availability.json()).toEqual({ taken: true });

      const incorrect = await postAuth('/api/admin/update-pin', { currentPin: '00000000', newPin: '87654321' });
      expect(incorrect.status).toBe(400);
      expect(await incorrect.json()).toMatchObject({ success: false, error: 'CURRENT_PIN_INCORRECT' });

      const rotated = await postAuth('/api/admin/update-pin', { currentPin: '12345678', newPin: '87654321' });
      expect(rotated.status).toBe(200);
      expect(await rotated.json()).toEqual({ success: true });
    });
  });
});
