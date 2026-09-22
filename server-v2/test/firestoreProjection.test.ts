import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreProjectionRepository } from '../repositories/firestoreProjection.js';

const projectId = 'rq-v2-projection-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

const now = new Date('2026-09-22T12:00:00.000Z');
const event = (id: string, type: 'entry' | 'exit' | 'revenue' | 'refund', amountMinor?: number) => ({
  id, garageId: 'garage-1', dateKey: '2026-09-22', type, ...(amountMinor === undefined ? {} : { amountMinor }), occurredAt: '2026-09-22T11:00:00.000Z'
} as const);

describe('Firestore projection repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('creates and advances a date-scoped projection transactionally', async () => {
    const repository = new FirestoreProjectionRepository(firestore);
    await repository.applyEvent(event('entry-1', 'entry'), now);
    const result = await repository.applyEvent(event('revenue-1', 'revenue', 1250), now);
    expect(result).toMatchObject({ garageId: 'garage-1', dateKey: '2026-09-22', activeVehicleCount: 1, entriesToday: 1, grossRevenueMinor: 1250, netRevenueMinor: 1250, appliedEventIds: ['entry-1', 'revenue-1'] });
    await expect(repository.get('garage-1', '2026-09-22')).resolves.toEqual(result);
  });

  it('does not double-apply replayed events or create duplicate writes', async () => {
    const repository = new FirestoreProjectionRepository(firestore);
    const first = await repository.applyEvent(event('entry-1', 'entry'), now);
    const replay = await repository.applyEvent(event('entry-1', 'entry'), now);
    expect(replay).toEqual(first);
    expect(repository.getCostSnapshot().transactionAttempts).toBe(2);
    expect(repository.getCostSnapshot().writes).toBeGreaterThanOrEqual(1);
  });

  it('keeps separate garage/date projections isolated and validates keys', async () => {
    const repository = new FirestoreProjectionRepository(firestore);
    await repository.applyEvent(event('entry-1', 'entry'), now);
    await expect(repository.applyEvent({ ...event('other-date', 'entry'), dateKey: '2026-09-23' }, now)).resolves.toMatchObject({ dateKey: '2026-09-23' });
    await expect(repository.applyEvent({ ...event('other-garage', 'entry'), garageId: 'garage-2' }, now)).resolves.toMatchObject({ garageId: 'garage-2' });
    await expect(repository.get('garage-1', 'bad-date')).rejects.toThrow('Invalid projection date');
  });

  it('serializes concurrent events without losing either event', async () => {
    const repository = new FirestoreProjectionRepository(firestore);
    const [left, right] = await Promise.all([
      repository.applyEvent(event('entry-1', 'entry'), now),
      repository.applyEvent(event('entry-2', 'entry'), now)
    ]);
    const stored = await repository.get('garage-1', '2026-09-22');
    expect(stored?.entriesToday).toBe(2);
    expect(stored?.activeVehicleCount).toBe(2);
    expect(stored?.appliedEventIds).toEqual(expect.arrayContaining(['entry-1', 'entry-2']));
    expect([left.entriesToday, right.entriesToday].sort()).toEqual([1, 2]);
  });
});
