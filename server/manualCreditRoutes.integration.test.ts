import express from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface DocumentReference {
  path: string;
  id: string;
}

interface PendingWrite {
  kind: 'set' | 'delete';
  ref: DocumentReference;
  value?: Record<string, unknown>;
  merge?: boolean;
}

const harness = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('./firebaseAdmin', () => ({
  get adminDb() {
    return harness.db;
  },
  adminAuth: null,
  firebaseConfig: {}
}));

vi.mock('./middleware', () => ({
  requireAuth(req: express.Request & { user?: unknown }, _res: express.Response, next: express.NextFunction) {
    const role = String(req.header('x-test-role') || 'garage');
    const uid = String(req.header('x-test-uid') || 'test-actor');
    req.user = { role, uid };
    next();
  },
  financialRateLimiter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  sendApiError(res: express.Response, statusCode: number, code: string, message: string) {
    return res.status(statusCode).json({ success: false, error: code, message });
  }
}));

import rechargesRouter from './routes/recharges';

class InMemoryFirestore {
  readonly records = new Map<string, Record<string, unknown>>();
  readonly committedBatches: PendingWrite[][] = [];
  failNextCommit = false;
  private sequence = 0;
  private transactionTail: Promise<void> = Promise.resolve();

  doc(path: string): DocumentReference {
    return { path, id: path.split('/').at(-1) || '' };
  }

  collection(path: string) {
    return {
      doc: (id?: string) => this.doc(`${path}/${id || `auto_${++this.sequence}`}`)
    };
  }

  async runTransaction<T>(callback: (transaction: {
    get(ref: DocumentReference): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    set(ref: DocumentReference, value: Record<string, unknown>, options?: { merge?: boolean }): void;
    delete(ref: DocumentReference): void;
  }) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previousTransaction = this.transactionTail;
    this.transactionTail = new Promise<void>((resolveTransaction) => {
      release = resolveTransaction;
    });
    await previousTransaction;

    const writes: PendingWrite[] = [];
    const transaction = {
      get: async (ref: DocumentReference) => {
        const record = this.records.get(ref.path);
        return {
          exists: record !== undefined,
          data: () => record === undefined ? undefined : structuredClone(record)
        };
      },
      set: (ref: DocumentReference, value: Record<string, unknown>, options?: { merge?: boolean }) => {
        writes.push({ kind: 'set', ref, value: structuredClone(value), merge: options?.merge });
      },
      delete: (ref: DocumentReference) => writes.push({ kind: 'delete', ref })
    };

    try {
      const result = await callback(transaction);
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error('INJECTED_ATOMIC_COMMIT_FAILURE');
      }
      for (const write of writes) {
        if (write.kind === 'delete') {
          this.records.delete(write.ref.path);
        } else {
          const value = write.value || {};
          this.records.set(
            write.ref.path,
            write.merge ? { ...(this.records.get(write.ref.path) || {}), ...value } : value
          );
        }
      }
      this.committedBatches.push(writes);
      return result;
    } finally {
      release();
    }
  }

  seed(path: string, value: Record<string, unknown>): void {
    this.records.set(path, structuredClone(value));
  }

  matchingPaths(prefix: string): string[] {
    return [...this.records.keys()].filter((path) => path.startsWith(prefix));
  }
}

const db = new InMemoryFirestore();
let server: Server;
let baseUrl: string;

async function post(path: string, body: Record<string, unknown>, role = 'admin') {
  const url = new URL(`/api/transactions${path}`, baseUrl);
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const request = httpRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(JSON.stringify(body)),
        'x-test-role': role,
        'x-test-uid': 'admin-1'
      }
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode || 0, body: responseBody }));
    });
    request.on('error', rejectResponse);
    request.end(JSON.stringify(body));
  });
  return { status: response.status, json: async () => JSON.parse(response.body) };
}

function seedCreditRequest(requestId: string, amount: number, garageId = 'garage_1') {
  db.seed(`recharge_requests/${requestId}`, {
    status: 'pending',
    requestType: 'balance_topup',
    garageId,
    amount,
    externalReference: `transfer-${requestId}`
  });
  if (!db.records.has(`garages/${garageId}`)) {
    db.seed(`garages/${garageId}`, { name: 'Test Garage', balance: 40, totalAdminRevenue: 0 });
  }
}

beforeAll(async () => {
  harness.db = db;
  const app = express();
  app.use(express.json());
  app.use('/api/transactions', rechargesRouter);
  server = createServer(app);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
});

beforeEach(() => {
  db.records.clear();
  db.committedBatches.length = 0;
  db.failNextCommit = false;
});

describe('manual-credit transaction routes', () => {
  it('replays a duplicate approval without crediting the garage twice', async () => {
    seedCreditRequest('request_approve', 100);
    const body = { requestId: 'request_approve', idempotencyKey: 'approve-key-001' };

    const first = await post('/approve-recharge-request', body);
    const firstJson = await first.json();
    const replay = await post('/approve-recharge-request', body);
    const replayJson = await replay.json();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replayJson.data).toEqual(firstJson.data);
    expect(db.records.get('garages/garage_1')?.balance).toBe(140);
    expect(db.matchingPaths('manual_credit_ledger/')).toHaveLength(1);
    expect(db.matchingPaths('garages/garage_1/events/')).toHaveLength(1);
  });

  it('rejects reuse of an approval idempotency key for a changed request payload', async () => {
    seedCreditRequest('request_original', 100);
    seedCreditRequest('request_changed', 225, 'garage_2');

    const first = await post('/approve-recharge-request', {
      requestId: 'request_original', idempotencyKey: 'approve-key-conflict'
    });
    const changed = await post('/approve-recharge-request', {
      requestId: 'request_changed', idempotencyKey: 'approve-key-conflict'
    });
    const changedJson = await changed.json();

    expect(first.status).toBe(200);
    expect(changed.status).toBe(409);
    expect(changedJson.error).toBe('CONFLICT');
    expect(db.records.get('garages/garage_1')?.balance).toBe(140);
    expect(db.records.get('garages/garage_2')?.balance).toBe(40);
    expect(db.records.get('recharge_requests/request_changed')?.status).toBe('pending');
    expect(db.matchingPaths('manual_credit_ledger/')).toHaveLength(1);
  });

  it('replays a duplicate rejection without producing a second event', async () => {
    seedCreditRequest('request_reject', 90);
    const body = { requestId: 'request_reject', idempotencyKey: 'reject-key-001' };

    const first = await post('/reject-recharge-request', body);
    const replay = await post('/reject-recharge-request', body);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(db.records.get('recharge_requests/request_reject')?.status).toBe('rejected');
    expect(db.matchingPaths('garages/garage_1/events/')).toHaveLength(1);
    expect(db.matchingPaths('idempotency_records/')).toHaveLength(1);
  });

  it('replays a duplicate direct top-up without applying a second credit', async () => {
    db.seed('garages/garage_1', { name: 'Test Garage', balance: 40, totalAdminRevenue: 0 });
    const body = { garageId: 'garage_1', amount: 60, idempotencyKey: 'topup-key-001' };

    const first = await post('/admin-topup-balance', body);
    const firstJson = await first.json();
    const replay = await post('/admin-topup-balance', body);
    const replayJson = await replay.json();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replayJson.data).toEqual(firstJson.data);
    expect(db.records.get('garages/garage_1')?.balance).toBe(100);
    expect(db.records.get('garages/garage_1')?.totalAdminRevenue).toBe(60);
    expect(db.matchingPaths('manual_credit_ledger/')).toHaveLength(1);
    expect(db.matchingPaths('garages/garage_1/events/')).toHaveLength(1);
  });

  it('denies non-admin attempts to write financial data before opening a transaction', async () => {
    seedCreditRequest('request_unauthorized', 50);
    const responses = await Promise.all([
      post('/approve-recharge-request', { requestId: 'request_unauthorized', idempotencyKey: 'unauth-approve' }, 'garage'),
      post('/reject-recharge-request', { requestId: 'request_unauthorized', idempotencyKey: 'unauth-reject' }, 'garage'),
      post('/admin-topup-balance', { garageId: 'garage_1', amount: 10, idempotencyKey: 'unauth-topup' }, 'garage')
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(db.committedBatches).toHaveLength(0);
    expect(db.records.get('garages/garage_1')?.balance).toBe(40);
    expect(db.records.get('recharge_requests/request_unauthorized')?.status).toBe('pending');
  });

  it('commits the balance, ledger, event, request, and idempotency record atomically', async () => {
    seedCreditRequest('request_atomic', 75);
    db.failNextCommit = true;

    const failed = await post('/approve-recharge-request', {
      requestId: 'request_atomic', idempotencyKey: 'approve-atomic-001'
    });
    expect(failed.status).toBe(500);
    expect(db.records.get('garages/garage_1')?.balance).toBe(40);
    expect(db.records.get('recharge_requests/request_atomic')?.status).toBe('pending');
    expect(db.matchingPaths('manual_credit_ledger/')).toHaveLength(0);
    expect(db.matchingPaths('garages/garage_1/events/')).toHaveLength(0);
    expect(db.matchingPaths('idempotency_records/')).toHaveLength(0);
    expect(db.committedBatches).toHaveLength(0);

    const succeeded = await post('/approve-recharge-request', {
      requestId: 'request_atomic', idempotencyKey: 'approve-atomic-001'
    });
    expect(succeeded.status).toBe(200);
    const committedPaths = new Set(db.committedBatches[0]?.map((write) => write.ref.path));
    expect(committedPaths.has('garages/garage_1')).toBe(true);
    expect(committedPaths.has('recharge_requests/request_atomic')).toBe(true);
    expect([...committedPaths].some((path) => path.startsWith('manual_credit_ledger/'))).toBe(true);
    expect([...committedPaths].some((path) => path.startsWith('garages/garage_1/events/'))).toBe(true);
    expect([...committedPaths].some((path) => path.startsWith('idempotency_records/'))).toBe(true);
  });

  it('serializes concurrent same-key approvals to one credit and one ledger/event', async () => {
    seedCreditRequest('request_concurrent', 125);
    const body = { requestId: 'request_concurrent', idempotencyKey: 'approve-concurrent-001' };

    const responses = await Promise.all([
      post('/approve-recharge-request', body),
      post('/approve-recharge-request', body)
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(db.records.get('garages/garage_1')?.balance).toBe(165);
    expect(db.matchingPaths('manual_credit_ledger/')).toHaveLength(1);
    expect(db.matchingPaths('garages/garage_1/events/')).toHaveLength(1);
    expect(db.matchingPaths('idempotency_records/')).toHaveLength(1);
  });

  it('allows only one of two concurrent approvals with different keys for the same pending request', async () => {
    seedCreditRequest('request_competing', 80);

    const responses = await Promise.all([
      post('/approve-recharge-request', { requestId: 'request_competing', idempotencyKey: 'approve-race-a' }),
      post('/approve-recharge-request', { requestId: 'request_competing', idempotencyKey: 'approve-race-b' })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(db.records.get('garages/garage_1')?.balance).toBe(120);
    expect(db.matchingPaths('manual_credit_ledger/')).toHaveLength(1);
    expect(db.matchingPaths('garages/garage_1/events/')).toHaveLength(1);
  });
});

describe('Firestore direct-write financial boundary', () => {
  it('keeps authoritative financial fields outside every client garage_update allowlist', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const garageStart = rules.indexOf('match /garages/{garageId} {');
    const vehiclesStart = rules.indexOf('match /vehicles/{vehicleId}', garageStart);
    const garageRules = garageStart >= 0 && vehiclesStart > garageStart
      ? rules.slice(garageStart, vehiclesStart)
      : undefined;
    const sessionUpdate = rules.match(/function isAllowedGarageSessionUpdate\(\) \{([\s\S]*?)\n {4}\}/)?.[1];
    expect(garageRules).toBeDefined();
    expect(sessionUpdate).toBeDefined();

    const protectedFields = [
      'balance', 'balanceExpiry', 'totalAdminRevenue', 'totalRevenue',
      'lastRechargeDate', 'lastRechargeAmount', 'lastRechargePackageName'
    ];
    const adminDenyList = garageRules?.match(/hasAny\(\[([\s\S]*?)\]\)/)?.[1] || '';
    const garageSessionAllowlist = sessionUpdate?.match(/hasOnly\(\[([\s\S]*?)\]\)/)?.[1] || '';
    const delegateAllowlist = garageRules?.match(/isDelegateForGarage\(garageId\)[\s\S]*?hasOnly\(\[([\s\S]*?)\]\)/)?.[1] || '';

    for (const field of protectedFields) {
      expect(adminDenyList).toContain(`'${field}'`);
      expect(garageSessionAllowlist).not.toContain(`'${field}'`);
      expect(delegateAllowlist).not.toContain(`'${field}'`);
    }
  });
});

export {};
