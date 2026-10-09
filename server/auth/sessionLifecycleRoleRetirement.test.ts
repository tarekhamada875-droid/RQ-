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

import { sessionLifecycleRouter } from './sessionLifecycle';

const app = express();
app.use(express.json());
app.use(sessionLifecycleRouter);

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
  mockDb.seed('supervisors/legacy-supervisor', { name: 'Preserved legacy Supervisor', role: 'supervisor' });
  mockDb.seed('supervisor_sessions/worker-uid', {
    uid: 'worker-uid', role: 'supervisor', entityId: 'legacy-supervisor',
    sessionId: 'legacy-session', isActive: true, lastActive: 'preserve-this-value'
  });
});

async function post(path: string, payload: Record<string, unknown> = {
  uid: 'worker-uid',
  sessionId: 'legacy-session',
  role: 'supervisor',
  entityId: 'legacy-supervisor'
}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-worker-token',
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

describe('Express retired Supervisor session lifecycle', () => {
  it('denies validation without refreshing either preserved legacy record', async () => {
    const response = await post('/api/auth/validate-or-refresh-session');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: false, code: 'ROLE_RETIRED', error: 'ROLE_RETIRED' });
    expect(mockDb.records.get('supervisor_sessions/worker-uid')?.lastActive).toBe('preserve-this-value');
    expect(mockDb.records.get('supervisors/legacy-supervisor')).toEqual({ name: 'Preserved legacy Supervisor', role: 'supervisor' });
  });

  it('denies release without modifying the preserved session marker or account record', async () => {
    const response = await post('/api/auth/release-session');

    expect(response.status).toBe(410);
    expect(mockDb.records.get('supervisor_sessions/worker-uid')?.isActive).toBe(true);
    expect(mockDb.records.get('supervisor_sessions/worker-uid')?.lastActive).toBe('preserve-this-value');
    expect(mockDb.records.get('supervisors/legacy-supervisor')).toEqual({ name: 'Preserved legacy Supervisor', role: 'supervisor' });
  });

  it('does not let a preserved active Supervisor session release another user session', async () => {
    mockDb.seed('supervisor_sessions/worker-uid', {
      uid: 'worker-uid', role: 'supervisor', entityId: 'legacy-supervisor', isActive: true
    });
    const targetSession = { uid: 'target-uid', role: 'delegate', entityId: 'target-delegate', sessionId: 'target-session', isActive: true };
    const targetDelegate = { activeSessionIds: ['target-session'], currentSessionId: 'target-session' };
    mockDb.seed('delegate_sessions/target-uid', targetSession);
    mockDb.seed('delegate_sessions/target-uid/sessions/target-session', targetSession);
    mockDb.seed('delegates/target-delegate', targetDelegate);

    const response = await post('/api/auth/release-session', {
      uid: 'target-uid', sessionId: 'target-session', role: 'delegate', entityId: 'target-delegate'
    });

    expect(response.status).toBe(403);
    expect(mockDb.records.get('delegate_sessions/target-uid')).toEqual(targetSession);
    expect(mockDb.records.get('delegate_sessions/target-uid/sessions/target-session')).toEqual(targetSession);
    expect(mockDb.records.get('delegates/target-delegate')).toEqual(targetDelegate);
  });
});
