import { describe, expect, it } from 'vitest';
import { listPendingQueue, listRecentActivity } from '../domain/readModels.js';

const pending = [
  { id: 'p-2', garageId: 'garage-1', kind: 'approval' as const, priority: 1, createdAt: '2026-09-20T10:02:00.000Z', status: 'pending' as const },
  { id: 'p-1', garageId: 'garage-1', kind: 'recharge' as const, priority: 2, createdAt: '2026-09-20T10:01:00.000Z', status: 'pending' as const },
  { id: 'p-3', garageId: 'garage-1', kind: 'repair' as const, priority: 3, createdAt: '2026-09-20T10:03:00.000Z', status: 'pending' as const }
];
const activity = [
  { id: 'a-1', garageId: 'garage-1', type: 'entry', occurredAt: '2026-09-20T10:01:00.000Z', resultCode: 'OK', projectionVersion: 1 },
  { id: 'a-2', garageId: 'garage-1', type: 'exit', occurredAt: '2026-09-20T10:02:00.000Z', resultCode: 'OK', projectionVersion: 1 },
  { id: 'a-3', garageId: 'garage-1', type: 'refund', occurredAt: '2026-09-20T10:03:00.000Z', resultCode: 'OK', projectionVersion: 1 }
];

describe('v2 bounded read models', () => {
  it('pages pending items in deterministic ascending order without offsets', () => {
    const first = listPendingQueue(pending, 2);
    expect(first.items.map((item) => item.id)).toEqual(['p-1', 'p-2']);
    expect(first.nextCursor).toBeDefined();
    expect(first.readCount).toBeLessThanOrEqual(2);
    const second = listPendingQueue(pending, 2, first.nextCursor);
    expect(second.items.map((item) => item.id)).toEqual(['p-3']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('pages recent activity newest-first with a bounded read count', () => {
    const first = listRecentActivity(activity, 2);
    expect(first.items.map((item) => item.id)).toEqual(['a-3', 'a-2']);
    expect(first.readCount).toBeLessThanOrEqual(2);
    expect(listRecentActivity(activity, 2, first.nextCursor).items.map((item) => item.id)).toEqual(['a-1']);
  });

  it('rejects unbounded page sizes and malformed read-model records', () => {
    expect(() => listPendingQueue(pending, 101)).toThrow('PAGE_SIZE_OUT_OF_RANGE');
    expect(() => listRecentActivity([{ id: 'bad', garageId: 'garage-1', type: 'entry', occurredAt: '2026-09-20T10:01:00.000Z', resultCode: '', projectionVersion: 1 }], 1)).toThrow();
    expect(() => listRecentActivity(activity, 1, 'bad-cursor')).toThrow();
  });
});
