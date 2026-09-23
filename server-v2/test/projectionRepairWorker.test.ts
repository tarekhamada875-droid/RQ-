import { describe, expect, it } from 'vitest';
import type { ProjectionRepository } from '../repositories/firestoreProjection.js';
import type { ProjectionRebuildResult } from '../contracts/projectionRepair.js';
import type { ProjectionState } from '../contracts/projection.js';
import { ProjectionRepairWorker } from '../workers/projectionRepairWorker.js';

const state: ProjectionState = {
  garageId: 'garage-1', dateKey: '2026-09-22', activeVehicleCount: 1, entriesToday: 1, exitsToday: 0,
  grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0, projectionVersion: 1,
  asOf: '2026-09-22T12:00:00.000Z', appliedEventIds: ['entry-1']
};
const task = {
  taskId: 'task-1', garageId: 'garage-1', dateKey: '2026-09-22', idempotencyKey: 'repair-task-1',
  events: [{ id: 'entry-1', garageId: 'garage-1', dateKey: '2026-09-22', type: 'entry' as const, occurredAt: '2026-09-22T11:00:00.000Z' }]
};
const rebuilt: ProjectionRebuildResult = { projection: state, sourceEventCount: 1, replayed: false };

function repository(rebuild: ProjectionRepository['rebuild']): ProjectionRepository {
  return { get: async () => state, applyEvent: async () => state, rebuild };
}

describe('projection repair worker', () => {
  it('runs a bounded batch sequentially and reports rebuilt tasks', async () => {
    const calls: string[] = [];
    const worker = new ProjectionRepairWorker({
      repository: repository(async (input) => { calls.push(input.idempotencyKey); return rebuilt; }),
      actorUid: 'projection-worker'
    });
    const result = await worker.run({ tasks: [task, { ...task, taskId: 'task-2', idempotencyKey: 'repair-task-2' }], occurredAt: '2026-09-22T12:00:00.000Z' });
    expect(calls).toEqual(['repair-task-1', 'repair-task-2']);
    expect(result).toMatchObject({ attempted: 2, rebuilt: 2, replayed: 0, failed: 0 });
    expect(result.results[0]).toMatchObject({ taskId: 'task-1', state: 'rebuilt', sourceEventCount: 1 });
  });

  it('classifies repository replays and redacts unexpected errors', async () => {
    let count = 0;
    const worker = new ProjectionRepairWorker({
      repository: repository(async () => {
        count += 1;
        if (count === 1) return { ...rebuilt, replayed: true };
        throw new Error('firebase: customer payload and credentials');
      }),
      actorUid: 'projection-worker'
    });
    const result = await worker.run({ tasks: [task, { ...task, taskId: 'task-2', idempotencyKey: 'repair-task-2' }, { ...task, taskId: 'task-3', idempotencyKey: 'repair-task-3' }], occurredAt: '2026-09-22T12:00:00.000Z' });
    expect(result).toMatchObject({ attempted: 2, rebuilt: 0, replayed: 1, failed: 1 });
    expect(result.results[0]).toMatchObject({ state: 'replayed' });
    expect(result.results[1]).toMatchObject({ state: 'failed', errorCode: 'REPAIR_FAILED' });
    expect(JSON.stringify(result)).not.toContain('customer payload');
  });

  it('reports known repository failures and continues to the next task', async () => {
    let count = 0;
    const worker = new ProjectionRepairWorker({
      repository: repository(async () => {
        count += 1;
        if (count === 1) throw new Error('PROJECTION_SCOPE_MISMATCH');
        return rebuilt;
      }),
      actorUid: 'projection-worker'
    });
    const result = await worker.run({ tasks: [task, { ...task, taskId: 'task-2', idempotencyKey: 'repair-task-2' }], occurredAt: '2026-09-22T12:00:00.000Z' });
    expect(result).toMatchObject({ attempted: 2, rebuilt: 1, replayed: 0, failed: 1 });
    expect(result.results[0]).toMatchObject({ taskId: 'task-1', state: 'failed', errorCode: 'PROJECTION_SCOPE_MISMATCH' });
    expect(result.results[1]).toMatchObject({ taskId: 'task-2', state: 'rebuilt' });
  });

  it('rejects batches larger than the bounded worker limit', async () => {
    const worker = new ProjectionRepairWorker({ repository: repository(async () => rebuilt), actorUid: 'projection-worker' });
    await expect(worker.run({ tasks: Array.from({ length: 26 }, (_, index) => ({ ...task, taskId: `task-${index}`, idempotencyKey: `repair-task-${index}` })), occurredAt: '2026-09-22T12:00:00.000Z' })).rejects.toThrow();
  });
});
