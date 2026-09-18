import { describe, expect, it } from 'vitest';
import { createOperationId, nextOperationVersion, projectionShard, createVehicleDelta, projectionBucketPath, projectionBucketUpdate, projectionShardCount } from './deltaProjection';

describe('delta projection primitives', () => {
  it('creates stable scoped operation IDs when a client key is supplied', () => {
    expect(createOperationId('garage-1', 'client-42')).toBe('op_garage-1_client-42');
    expect(createOperationId('garage-1', 'client-42')).toBe(createOperationId('garage-1', 'client-42'));
  });

  it('increments only valid non-negative integer operation versions', () => {
    expect(nextOperationVersion(4)).toBe(5);
    expect(nextOperationVersion(undefined)).toBe(1);
    expect(nextOperationVersion('invalid')).toBe(1);
  });

  it('assigns the same operation to the same bounded shard', () => {
    const first = projectionShard('op_garage-1_client-42', 8);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(8);
    expect(projectionShard('op_garage-1_client-42', 8)).toBe(first);
  });

  it('calculates constant-time vehicle deltas', () => {
    expect(createVehicleDelta('vehicle_entered')).toEqual({ activeVehicleCount: 1, entriesToday: 1 });
    expect(createVehicleDelta('vehicle_exited', 125.5)).toEqual({ activeVehicleCount: -1, exitsToday: 1, grossRevenue: 125.5, netRevenue: 125.5 });
    expect(createVehicleDelta('vehicle_refunded', 25)).toEqual({ refundTotal: 25, netRevenue: -25 });
  });

  it('selects bounded shard counts from estimated operation rate', () => {
    expect(projectionShardCount(1)).toBe(2);
    expect(projectionShardCount(8)).toBe(8);
    expect(projectionShardCount(30)).toBe(16);
  });

  it('creates deterministic day-scoped bucket paths and updates', () => {
    const operationId = 'op_garage-1_client-42';
    expect(projectionBucketPath('garage-1', '2026-09-18', operationId, 8)).toMatch(/^garages\/garage-1\/projection_buckets\/2026-09-18_\d+$/);
    expect(projectionBucketUpdate(operationId, '2026-09-18', { entriesToday: 1 })).toMatchObject({
      operationId,
      projectionVersion: 1,
      dateId: '2026-09-18',
      entriesToday: 1
    });
  });
});
