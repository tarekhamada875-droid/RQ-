import { describe, it, expect } from 'vitest';
import { workerApp } from '../../server/cloudflareWorker';

describe('CF4 — Cloudflare Worker Public and Read-Heavy Business Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };

  it('1. POST /api/check-subscriber handles subscriber lookup and validations', async () => {
    // Missing garage ID
    const missingGarageRes = await workerApp.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateNumber: '123-abc' })
    }));
    expect(missingGarageRes.status).toBe(400);

    // Non-existent subscriber lookup returns empty match gracefully
    const notFoundRes = await workerApp.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garageId: 'test-garage-non-existent',
        plateNumber: '9999-xyz'
      })
    }));
    expect(notFoundRes.status).toBe(200);
    const notFoundBody = await notFoundRes.json() as any;
    expect(notFoundBody.success).toBe(true);
    expect(notFoundBody.isSubscriber).toBe(false);
    expect(notFoundBody.isActive).toBe(false);
    expect(notFoundBody.subscriber).toBeNull();
  });

  it('2. GET /api/garage-summary requires auth and returns garage summary', async () => {
    // Unauthenticated
    const unauthRes = await workerApp.fetch(new Request('http://localhost/api/garage-summary?garageId=test-garage'));
    expect(unauthRes.status).toBe(401);

    // Authenticated with operator token
    const res = await workerApp.fetch(new Request('http://localhost/api/garage-summary?garageId=test-garage', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    // Either returns 404 (if mock garage doesn't exist) or 200 with structured data
    expect([200, 404]).toContain(res.status);
    const body = await res.json() as any;
    if (res.status === 200) {
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    } else {
      expect(body.error).toBe('GARAGE_NOT_FOUND');
    }
  });

  it('3. GET /api/admin/summary returns aggregated system statistics', async () => {
    // Unauthenticated
    const unauthRes = await workerApp.fetch(new Request('http://localhost/api/admin/summary'));
    expect(unauthRes.status).toBe(401);

    // Authenticated as admin
    const res = await workerApp.fetch(new Request('http://localhost/api/admin/summary', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.totalGarages).toBe('number');
    expect(typeof body.summary.activeGarages).toBe('number');
    expect(typeof body.summary.totalDelegates).toBe('number');
  });

  it('4. GET /api/admin/monthly-subscribers-summary aggregates subscriber metrics', async () => {
    const res = await workerApp.fetch(new Request('http://localhost/api/admin/monthly-subscribers-summary', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.totalSubscribers).toBe('number');
    expect(typeof body.data.activeSubscribers).toBe('number');
    expect(typeof body.data.expiredSubscribers).toBe('number');
  });

  it('5. GET /api/admin/subscribers lists subscriber records', async () => {
    const res = await workerApp.fetch(new Request('http://localhost/api/admin/subscribers?limit=10', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.subscribers)).toBe(true);
    expect(typeof body.count).toBe('number');
  });

  it('6. GET /api/admin/delegates returns delegates list without PIN fields', async () => {
    const res = await workerApp.fetch(new Request('http://localhost/api/admin/delegates', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.delegates)).toBe(true);

    // Verify PIN fields are never leaked
    for (const delegate of body.delegates) {
      expect(delegate.pin).toBeUndefined();
      expect(delegate.ownerPin).toBeUndefined();
      expect(delegate.adminPin).toBeUndefined();
      expect(delegate.pinHash).toBeUndefined();
    }
  });

  it('7. GET /api/admin/delegates/:id handles lookup and 404 on unknown delegate', async () => {
    const res = await workerApp.fetch(new Request('http://localhost/api/admin/delegates/non-existent-delegate-id', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toBe('DELEGATE_NOT_FOUND');
  });
});
