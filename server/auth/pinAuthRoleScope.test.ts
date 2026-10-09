import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFirestore, mockAdminAuth } from '../../src/__tests__/mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { computeLookupHash, hashPinWithUniqueSalt } from '../utils';
import { pinAuthRouter } from './pinAuth';

const app = express();
app.use(express.json());
app.use(pinAuthRouter);

let server: ReturnType<typeof app.listen>;
let baseUrl = '';

beforeAll(async () => {
  server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  mockDb.clear();
  mockDb.seed('private_pins/auth_pin', { pin: '12345678' });
});

async function verifyPin(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/auth/verify-pin`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-worker-token',
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.21'
    },
    body: JSON.stringify({ sessionId: 'express-role-scope-test', ...body })
  });
}

describe('Express PIN authentication role scope', () => {
  it('rejects an Admin PIN from Delegate-scoped login before migration or session claim', async () => {
    const response = await verifyPin({ pin: '12345678', expectedRole: 'delegate' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: false, error: 'بيانات الدخول غير صحيحة' });
    expect(mockDb.records.has('admin_sessions/worker-uid')).toBe(false);
    expect(mockDb.records.has('delegate_sessions/worker-uid')).toBe(false);
    expect(mockDb.records.get('private_pins/auth_pin')).toEqual({ pin: '12345678' });
  });

  it('claims only a Delegate session for a valid PIN in Delegate-scoped login', async () => {
    const pin = '24681357';
    mockDb.seed('private_pins/qa-delegate', {
      entityType: 'delegates',
      entityId: 'qa-delegate',
      pin: hashPinWithUniqueSalt(pin),
      pinLookupHash: computeLookupHash(pin)
    });
    mockDb.seed('delegates/qa-delegate', { name: 'QA Delegate' });

    const response = await verifyPin({ pin, expectedRole: 'delegate' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, role: 'delegate', accountId: 'qa-delegate', sessionClaimed: true });
    expect(mockDb.records.get('delegate_sessions/worker-uid')).toMatchObject({ role: 'delegate', entityId: 'qa-delegate', isActive: true });
    expect(mockDb.records.has('admin_sessions/worker-uid')).toBe(false);
  });

  it('rejects a legacy Supervisor PIN without changing its record or claiming a session', async () => {
    const pin = '13572468';
    mockDb.seed('private_pins/legacy-supervisor', {
      entityType: 'supervisors',
      entityId: 'legacy-supervisor',
      pin: hashPinWithUniqueSalt(pin),
      pinLookupHash: computeLookupHash(pin)
    });
    const record = { name: 'Preserved legacy Supervisor', role: 'supervisor' };
    mockDb.seed('supervisors/legacy-supervisor', record);

    const response = await verifyPin({ pin });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: false, error: 'بيانات الدخول غير صحيحة' });
    expect(mockDb.records.has('supervisor_sessions/worker-uid')).toBe(false);
    expect(mockDb.records.get('supervisors/legacy-supervisor')).toEqual(record);
  });

  it('does not migrate a plain legacy Supervisor PIN during rejected login', async () => {
    const pin = '86421357';
    const legacyRecord = { name: 'Plain legacy Supervisor', role: 'supervisor', pin };
    mockDb.seed('supervisors/plain-legacy-supervisor', legacyRecord);

    const response = await verifyPin({ pin });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: false, error: 'بيانات الدخول غير صحيحة' });
    expect(mockDb.records.get('supervisors/plain-legacy-supervisor')).toEqual(legacyRecord);
    expect(mockDb.records.has('private_pins/plain-legacy-supervisor')).toBe(false);
    expect(mockDb.records.has('supervisor_sessions/worker-uid')).toBe(false);
  });
});
