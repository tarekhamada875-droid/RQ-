import { describe, expect, it } from 'vitest';
import { ProjectionStateSchema } from '../contracts/projection.js';
import { applyProjectionEvent, reconcileProjection } from '../domain/projections.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const state = ProjectionStateSchema.parse({ garageId: 'garage-1', dateKey: '2026-09-20', activeVehicleCount: 1, entriesToday: 1, exitsToday: 0, grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0, projectionVersion: 1, asOf: '2026-09-20T09:00:00.000Z', appliedEventIds: [] });

describe('v2 projections', () => {
  it('applies entry, revenue, refund, and exit events with integer accounting', () => {
    let current = applyProjectionEvent(state, { id: 'entry-1', garageId: 'garage-1', dateKey: '2026-09-20', type: 'entry', occurredAt: '2026-09-20T09:30:00.000Z' }, now);
    current = applyProjectionEvent(current, { id: 'revenue-1', garageId: 'garage-1', dateKey: '2026-09-20', type: 'revenue', amountMinor: 1000, occurredAt: '2026-09-20T09:40:00.000Z' }, now);
    current = applyProjectionEvent(current, { id: 'refund-1', garageId: 'garage-1', dateKey: '2026-09-20', type: 'refund', amountMinor: 100, occurredAt: '2026-09-20T09:50:00.000Z' }, now);
    current = applyProjectionEvent(current, { id: 'exit-1', garageId: 'garage-1', dateKey: '2026-09-20', type: 'exit', occurredAt: '2026-09-20T10:00:00.000Z' }, now);
    expect(current).toMatchObject({ activeVehicleCount: 1, entriesToday: 2, exitsToday: 1, grossRevenueMinor: 1000, refundTotalMinor: 100, netRevenueMinor: 900, appliedEventIds: ['entry-1', 'revenue-1', 'refund-1', 'exit-1'] });
  });

  it('does not double-apply the same event', () => {
    const event = { id: 'entry-duplicate', garageId: 'garage-1', dateKey: '2026-09-20', type: 'entry' as const, occurredAt: '2026-09-20T09:30:00.000Z' };
    const once = applyProjectionEvent(state, event, now);
    expect(applyProjectionEvent(once, event, now)).toEqual(once);
  });

  it('rejects cross-scope events and negative active counts', () => {
    expect(() => applyProjectionEvent(state, { id: 'wrong-date', garageId: 'garage-1', dateKey: '2026-09-21', type: 'entry', occurredAt: '2026-09-20T09:30:00.000Z' }, now)).toThrow('PROJECTION_SCOPE_MISMATCH');
    const empty = ProjectionStateSchema.parse({ ...state, activeVehicleCount: 0 });
    expect(() => applyProjectionEvent(empty, { id: 'exit-empty', garageId: 'garage-1', dateKey: '2026-09-20', type: 'exit', occurredAt: '2026-09-20T09:30:00.000Z' }, now)).toThrow('PROJECTION_ACTIVE_COUNT_NEGATIVE');
  });

  it('reports reconciliation differences and projection lag', () => {
    const result = reconcileProjection(state, { activeVehicleCount: 1, entriesToday: 1, exitsToday: 0, grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0, asOf: new Date('2026-09-20T09:59:00.000Z') }, now);
    expect(result.consistent).toBe(true);
    expect(result.projectionLagMs).toBe(3_600_000);
    const mismatch = reconcileProjection(state, { activeVehicleCount: 2, entriesToday: 2, exitsToday: 0, grossRevenueMinor: 100, refundTotalMinor: 0, netRevenueMinor: 100, asOf: now }, now);
    expect(mismatch.consistent).toBe(false);
    expect(mismatch.differences).toMatchObject({ activeVehicleCount: -1, grossRevenueMinor: -100, netRevenueMinor: -100 });
  });
});
