import express from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface DocumentReference {
  path: string;
  id: string;
}

interface QueryReference {
  __query: true;
  prefix: string;
  field: string;
  value: unknown;
  max: number;
}

interface PendingWrite {
  kind: 'set' | 'update' | 'delete';
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
    const uid = String(req.header('x-test-uid') || 'garage-actor');
    const garageId = req.header('x-test-garage-id') || 'garage_1';
    req.user = { role, uid, garageId };
    next();
  }
}));

import subscribersRouter from './routes/subscribers';

class InMemoryFirestore {
  readonly records = new Map<string, Record<string, unknown>>();
  readonly committedBatches: PendingWrite[][] = [];
  private sequence = 0;
  private transactionTail: Promise<void> = Promise.resolve();

  doc(path: string): DocumentReference {
    return { path, id: path.split('/').at(-1) || '' };
  }

  collection(path: string) {
    return {
      doc: (id?: string) => this.doc(`${path}/${id || `auto_${++this.sequence}`}`),
      where: (field: string, _operator: string, value: unknown) => ({
        limit: (max: number): QueryReference => ({ __query: true, prefix: path, field, value, max })
      })
    };
  }

  async runTransaction<T>(callback: (transaction: {
    get(ref: DocumentReference | QueryReference): Promise<{ exists: boolean; empty?: boolean; docs?: Array<{ id: string; data(): Record<string, unknown> }> ; data(): Record<string, unknown> | undefined }>;
    set(ref: DocumentReference, value: Record<string, unknown>, options?: { merge?: boolean }): void;
    update(ref: DocumentReference, value: Record<string, unknown>): void;
    delete(ref: DocumentReference): void;
  }) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previousTransaction = this.transactionTail;
    this.transactionTail = new Promise<void>((resolveTransaction) => { release = resolveTransaction; });
    await previousTransaction;

    const writes: PendingWrite[] = [];
    const transaction = {
      get: async (ref: DocumentReference | QueryReference) => {
        if ('__query' in ref) {
          const docs = [...this.records.entries()]
            .filter(([path, value]) => path.startsWith(`${ref.prefix}/`) && path.split('/').length === ref.prefix.split('/').length + 1 && value[ref.field] === ref.value)
            .slice(0, ref.max)
            .map(([path, value]) => ({ id: path.split('/').at(-1) || '', data: () => structuredClone(value) }));
          return { exists: docs.length > 0, empty: docs.length === 0, docs, data: () => undefined };
        }
        const record = this.records.get(ref.path);
        return { exists: record !== undefined, data: () => record === undefined ? undefined : structuredClone(record) };
      },
      set: (ref: DocumentReference, value: Record<string, unknown>, options?: { merge?: boolean }) => {
        writes.push({ kind: 'set', ref, value: structuredClone(value), merge: options?.merge });
      },
      update: (ref: DocumentReference, value: Record<string, unknown>) => {
        writes.push({ kind: 'update', ref, value: structuredClone(value) });
      },
      delete: (ref: DocumentReference) => writes.push({ kind: 'delete', ref })
    };

    try {
      const result = await callback(transaction);
      for (const write of writes) {
        if (write.kind === 'delete') {
          this.records.delete(write.ref.path);
          continue;
        }
        const value = write.value || {};
        this.records.set(write.ref.path, write.kind === 'update' || write.merge
          ? { ...(this.records.get(write.ref.path) || {}), ...value }
          : value);
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

  read(path: string): Record<string, unknown> | undefined {
    const value = this.records.get(path);
    return value === undefined ? undefined : structuredClone(value);
  }

  count(prefix: string): number {
    return [...this.records.keys()].filter((path) => path.startsWith(prefix)).length;
  }
}

const db = new InMemoryFirestore();
let server: Server;
let baseUrl = '';

async function post(path: string, body: Record<string, unknown>, role = 'garage', garageId = 'garage_1') {
  const payload = JSON.stringify(body);
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const request = httpRequest(new URL(`/api/subscribers${path}`, baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'x-test-role': role,
        'x-test-uid': `${role}-actor`,
        'x-test-garage-id': garageId
      }
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode || 0, body: responseBody }));
    });
    request.on('error', rejectResponse);
    request.end(payload);
  });
  return { status: response.status, json: async () => JSON.parse(response.body) as Record<string, unknown> };
}

const subscriberData = {
  plateNumber: 'ABC 123',
  plateNumberRaw: 'ABC123',
  ownerName: 'Synthetic Owner',
  phone: '01000000000',
  startDate: '2026-09-01',
  endDate: '2026-09-30'
};

beforeAll(async () => {
  harness.db = db;
  const app = express();
  app.use(express.json());
  app.use('/api/subscribers', subscribersRouter);
  server = createServer(app);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
});

beforeEach(() => {
  db.records.clear();
  db.committedBatches.length = 0;
});

describe('synthetic subscriber lifecycle routes', () => {
  it('adds a subscriber atomically and persists its creation event', async () => {
    const response = await post('/add', { garageId: 'garage_1', subscriberData, idempotencyKey: 'subscriber-add-1' });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, id: 'plate_QUJDMTIz' });
    expect(db.read('garages/garage_1/subscribers/plate_QUJDMTIz')).toMatchObject({
      plateNumberRaw: 'ABC123',
      garageId: 'garage_1'
    });
    expect(db.count('garages/garage_1/events/')).toBe(1);
    expect(db.count('idempotency_records/')).toBe(1);
  });

  it('replays an identical add and rejects changed idempotency payloads', async () => {
    const first = await post('/add', { garageId: 'garage_1', subscriberData, idempotencyKey: 'add-replay' });
    const replay = await post('/add', { garageId: 'garage_1', subscriberData, idempotencyKey: 'add-replay' });
    const changed = await post('/add', {
      garageId: 'garage_1',
      subscriberData: { ...subscriberData, ownerName: 'Changed Owner' },
      idempotencyKey: 'add-replay'
    });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    expect(changed.status).toBe(409);
    expect(db.count('garages/garage_1/subscribers/')).toBe(1);
    expect(db.count('garages/garage_1/events/')).toBe(1);
  });

  it('renews, updates mutable fields, and deletes a subscriber through the same transaction boundary', async () => {
    await post('/add', { garageId: 'garage_1', subscriberData });
    const renew = await post('/renew', {
      garageId: 'garage_1', subscriberId: 'plate_QUJDMTIz',
      newDates: { startDate: '2026-10-01', endDate: '2026-10-31' }, idempotencyKey: 'subscriber-renew-1'
    });
    const update = await post('/update', {
      garageId: 'garage_1', subscriberId: 'plate_QUJDMTIz',
      subscriberData: { ownerName: 'Updated Owner', startDate: '2026-10-01', endDate: '2026-10-31' }, idempotencyKey: 'subscriber-update-1'
    });
    expect(renew.status).toBe(200);
    expect(update.status).toBe(200);
    expect(db.read('garages/garage_1/subscribers/plate_QUJDMTIz')).toMatchObject({ ownerName: 'Updated Owner', endDate: '2026-10-31' });
    const removed = await post('/delete', { garageId: 'garage_1', subscriberId: 'plate_QUJDMTIz', idempotencyKey: 'subscriber-delete-1' });
    expect(removed.status).toBe(200);
    expect(db.read('garages/garage_1/subscribers/plate_QUJDMTIz')).toBeUndefined();
    expect(db.count('garages/garage_1/events/')).toBe(4);
  });

  it('rejects immutable plate changes and cross-garage management', async () => {
    await post('/add', { garageId: 'garage_1', subscriberData });
    const plateChange = await post('/update', {
      garageId: 'garage_1', subscriberId: 'plate_QUJDMTIz',
      subscriberData: { plateNumber: 'XYZ 999', plateNumberRaw: 'XYZ999', startDate: '2026-09-01', endDate: '2026-09-30' }
    });
    const crossGarage = await post('/delete', { garageId: 'garage_2', subscriberId: 'plate_QUJDMTIz' });
    expect(plateChange.status).toBe(409);
    expect(crossGarage.status).toBe(403);
    expect(db.read('garages/garage_1/subscribers/plate_QUJDMTIz')).toMatchObject({ plateNumberRaw: 'ABC123' });
  });

  it('rejects invalid dates before any subscriber write', async () => {
    const response = await post('/add', {
      garageId: 'garage_1',
      subscriberData: { ...subscriberData, startDate: '2026-02-30', endDate: '2026-03-01' }
    });
    expect(response.status).toBe(400);
    expect(db.count('garages/garage_1/subscribers/')).toBe(0);
    expect(db.count('garages/garage_1/events/')).toBe(0);
  });
});
