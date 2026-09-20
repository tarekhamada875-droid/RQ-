import { describe, expect, it } from 'vitest';
import type { IdempotencyRecord } from '../contracts/financial.js';
import { executeGarageCommand } from '../domain/garageLifecycle.js';
import { decideGarageLifecycleIdempotency } from '../domain/garageIdempotency.js';

const occurredAt = new Date('2026-09-20T10:00:00.000Z');
const garage = { id: 'garage-1', name: 'Main Garage', isLocked: false, isSuspended: false, updatedAt: '2026-09-19T10:00:00.000Z' };
const fingerprint = 'a'.repeat(64);
const record: IdempotencyRecord = { key: 'garage-op-1', operation: 'garage.lock', fingerprint, status: 'completed', responseJson: '{"ok":true}', createdAt: occurredAt.toISOString() };

describe('v2 garage lifecycle operations', () => {
  it('locks, unlocks, suspends, and resumes with narrow update allowlists', () => {
    const locked = executeGarageCommand({ operation: 'lock', existing: garage, garageId: 'garage-1', occurredAt });
    expect(locked.garage.isLocked).toBe(true);
    expect(locked.operation.allowedUpdates).toEqual(['isLocked', 'updatedAt']);
    const unlocked = executeGarageCommand({ operation: 'unlock', existing: { ...garage, isLocked: true }, garageId: 'garage-1', occurredAt });
    expect(unlocked.garage.isLocked).toBe(false);
    const suspended = executeGarageCommand({ operation: 'suspend', existing: garage, garageId: 'garage-1', occurredAt });
    expect(suspended.garage.isSuspended).toBe(true);
    const active = executeGarageCommand({ operation: 'unsuspend', existing: { ...garage, isSuspended: true }, garageId: 'garage-1', occurredAt });
    expect(active.garage.isSuspended).toBe(false);
  });

  it.each([
    ['lock', { ...garage, isLocked: true }, 'GARAGE_ALREADY_LOCKED'],
    ['unlock', garage, 'GARAGE_ALREADY_UNLOCKED'],
    ['suspend', { ...garage, isSuspended: true }, 'GARAGE_ALREADY_SUSPENDED'],
    ['unsuspend', garage, 'GARAGE_ALREADY_ACTIVE']
  ])('rejects invalid garage transition: %s', (operation, existing, code) => {
    expect(() => executeGarageCommand({ operation: operation as 'lock' | 'unlock' | 'suspend' | 'unsuspend', existing, garageId: 'garage-1', occurredAt })).toThrow(code);
  });

  it('enforces garage scope and replay-safe idempotency', () => {
    expect(() => executeGarageCommand({ operation: 'lock', existing: garage, garageId: 'garage-2', occurredAt })).toThrow('GARAGE_SCOPE_MISMATCH');
    expect(decideGarageLifecycleIdempotency(record, 'garage-op-1', 'garage.lock', fingerprint)).toMatchObject({ kind: 'replay' });
    expect(decideGarageLifecycleIdempotency(record, 'garage-op-1', 'garage.lock', 'b'.repeat(64))).toEqual({ kind: 'conflict' });
  });
});
