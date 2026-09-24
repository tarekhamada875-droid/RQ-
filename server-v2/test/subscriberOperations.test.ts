import { describe, expect, it } from 'vitest';
import type { IdempotencyRecord } from '../contracts/financial.js';
import { executeSubscriberCommand } from '../domain/subscriberOperations.js';
import { decideSubscriberIdempotency } from '../domain/subscriberIdempotency.js';

const occurredAt = new Date('2026-09-20T10:00:00.000Z');
const startAt = new Date('2026-09-20T10:00:00.000Z');
const endAt = new Date('2026-10-20T10:00:00.000Z');
const existing = { id: 'sub-1', garageId: 'garage-1', plate: 'ABC123', status: 'active' as const, startAt: startAt.toISOString(), endAt: endAt.toISOString(), updatedAt: '2026-09-19T10:00:00.000Z' };
const fingerprint = 'a'.repeat(64);
const record: IdempotencyRecord = { key: 'subscriber-op-1', operation: 'subscriber.renew', fingerprint, status: 'completed', responseJson: '{"ok":true}', createdAt: occurredAt.toISOString() };

describe('v2 subscriber lifecycle operations', () => {
  it('creates and renews subscribers with an explicit update allowlist', () => {
    const created = executeSubscriberCommand({ operation: 'create', existing: null, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', startAt, endAt, occurredAt });
    expect(created.subscriber).toMatchObject({ status: 'active', garageId: 'garage-1' });
    expect(created.operation.allowedUpdates).toEqual(['status', 'startAt', 'endAt', 'updatedAt']);
    const renewed = executeSubscriberCommand({ operation: 'renew', existing, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', startAt, endAt: new Date('2026-11-20T10:00:00.000Z'), occurredAt });
    expect(renewed.subscriber.status).toBe('active');
  });

  it('suspends and cancels without allowing arbitrary field updates', () => {
    const suspended = executeSubscriberCommand({ operation: 'suspend', existing, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', occurredAt });
    expect(suspended.subscriber.status).toBe('suspended');
    expect(suspended.operation.allowedUpdates).toEqual(['status', 'updatedAt']);
    const cancelled = executeSubscriberCommand({ operation: 'cancel', existing, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', occurredAt });
    expect(cancelled.subscriber.status).toBe('cancelled');
  });

  it('creates a deleted tombstone while retaining identity fields and rejects later lifecycle mutation', () => {
    const deleted = executeSubscriberCommand({ operation: 'delete', existing, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', occurredAt });
    expect(deleted.subscriber).toMatchObject({ status: 'deleted', plate: existing.plate, startAt: existing.startAt, endAt: existing.endAt, updatedAt: occurredAt.toISOString() });
    expect(deleted.operation.allowedUpdates).toEqual(['status', 'updatedAt']);
    expect(() => executeSubscriberCommand({ operation: 'delete', existing: deleted.subscriber, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', occurredAt })).toThrow('SUBSCRIBER_ALREADY_DELETED');
    expect(() => executeSubscriberCommand({ operation: 'cancel', existing: deleted.subscriber, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', occurredAt })).toThrow('SUBSCRIBER_DELETED');
  });

  it.each([
    ['create', existing, 'SUBSCRIBER_ALREADY_EXISTS'],
    ['renew', { ...existing, status: 'cancelled' as const }, 'SUBSCRIBER_CANCELLED'],
    ['suspend', { ...existing, status: 'suspended' as const }, 'SUBSCRIBER_NOT_ACTIVE'],
    ['cancel', { ...existing, status: 'cancelled' as const }, 'SUBSCRIBER_ALREADY_CANCELLED']
  ])('rejects invalid subscriber transition: %s', (operation, subscriber, code) => {
    expect(() => executeSubscriberCommand({ operation: operation as 'create' | 'renew' | 'suspend' | 'cancel', existing: subscriber, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', startAt, endAt, occurredAt })).toThrow(code);
  });

  it('enforces garage scope and replay-safe idempotency', () => {
    expect(() => executeSubscriberCommand({ operation: 'renew', existing, subscriberId: 'sub-1', garageId: 'garage-2', plate: 'ABC123', startAt, endAt, occurredAt })).toThrow('GARAGE_SCOPE_MISMATCH');
    expect(decideSubscriberIdempotency(record, 'subscriber-op-1', 'subscriber.renew', fingerprint)).toMatchObject({ kind: 'replay' });
    expect(decideSubscriberIdempotency(record, 'subscriber-op-1', 'subscriber.renew', 'b'.repeat(64))).toEqual({ kind: 'conflict' });
  });

  it('keeps distinct command idempotency keys distinct in operation IDs', () => {
    const first = executeSubscriberCommand({ operation: 'renew', existing, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', idempotencyKey: 'renew-op-1', startAt, endAt, occurredAt });
    const second = executeSubscriberCommand({ operation: 'renew', existing, subscriberId: 'sub-1', garageId: 'garage-1', plate: 'ABC123', idempotencyKey: 'renew-op-2', startAt, endAt, occurredAt });
    expect(first.operation.operationId).not.toBe(second.operation.operationId);
  });
});
