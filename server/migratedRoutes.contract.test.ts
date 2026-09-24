import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from './app';
import { createRequestFingerprint } from './idempotency';

let server: ReturnType<typeof app.listen>;
let port = 0;
const originalOperatorToken = process.env.BACKEND_OPERATOR_TOKEN;

async function post(path: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  delete process.env.BACKEND_OPERATOR_TOKEN;
  server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  if (originalOperatorToken === undefined) delete process.env.BACKEND_OPERATOR_TOKEN;
  else process.env.BACKEND_OPERATOR_TOKEN = originalOperatorToken;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('migrated route HTTP contracts', () => {
  it('rejects unauthenticated subscriber and vehicle mutations consistently', async () => {
    const paths = [
      '/api/subscribers/add',
      '/api/subscribers/renew',
      '/api/subscribers/update',
      '/api/subscribers/delete',
      '/api/vehicles/check-in',
      '/api/vehicles/check-out',
    ];
    for (const path of paths) {
      const response = await post(path);
      const payload = await response.json() as { success: boolean; code?: string };
      expect(response.status, path).toBe(401);
      expect(payload).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    }
  });

  it('keeps authenticated invalid-request envelopes before any Firestore mutation', async () => {
    process.env.BACKEND_OPERATOR_TOKEN = 'route-contract-test-secret';
    const paths = [
      '/api/subscribers/add',
      '/api/subscribers/renew',
      '/api/subscribers/update',
      '/api/subscribers/delete',
      '/api/vehicles/check-in',
      '/api/vehicles/check-out',
    ];
    for (const path of paths) {
      const response = await post(path, {}, { 'x-backend-operator-token': 'route-contract-test-secret' });
      const payload = await response.json() as { success: boolean; error?: string };
      expect(response.status, path).toBe(400);
      expect(payload.success, path).toBe(false);
      expect(payload.error, path).toBeDefined();
    }
  });

  it('binds same-payload replay and changed-payload reuse to different fingerprints', () => {
    const base = { garageId: 'garage_1', subscriberId: 'sub_1', newDates: { startDate: '2026-09-01', endDate: '2026-09-30' } };
    expect(createRequestFingerprint(base)).toBe(createRequestFingerprint({ subscriberId: 'sub_1', newDates: { endDate: '2026-09-30', startDate: '2026-09-01' }, garageId: 'garage_1' }));
    expect(createRequestFingerprint(base)).not.toBe(createRequestFingerprint({ ...base, newDates: { ...base.newDates, endDate: '2026-10-01' } }));
    expect(createRequestFingerprint({ garageId: 'garage_1', plateNumber: 'ABC 123', plateRaw: 'ABC123', type: 'hourly' })).not.toBe(createRequestFingerprint({ garageId: 'garage_1', plateNumber: 'ABC 123', plateRaw: 'ABC123', type: 'overnight' }));
  });
});
