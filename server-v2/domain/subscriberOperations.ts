import crypto from 'node:crypto';
import { SubscriberOperationSchema, SubscriberStateSchema, type SubscriberOperation, type SubscriberState } from '../contracts/subscriber.js';

type SubscriberCommandInput = Readonly<{
  operation: 'create' | 'renew' | 'update' | 'suspend' | 'cancel' | 'delete';
  existing: SubscriberState | null;
  subscriberId: string;
  garageId: string;
  plate: string;
  startAt?: Date;
  endAt?: Date;
  occurredAt: Date;
}>;

export type SubscriberCommandResult = Readonly<{ subscriber: SubscriberState; operation: SubscriberOperation }>;

function operationId(input: SubscriberCommandInput): string {
  return `subscriber_${crypto.createHash('sha256').update(`${input.operation}:${input.subscriberId}:${input.occurredAt.toISOString()}`).digest('hex').slice(0, 32)}`;
}

function isoDate(value: Date | undefined, code: string): string {
  if (!value || Number.isNaN(value.getTime())) throw new Error(code);
  return value.toISOString();
}

export function executeSubscriberCommand(input: SubscriberCommandInput): SubscriberCommandResult {
  if (!input.subscriberId || !input.garageId || !input.plate) throw new Error('INVALID_SUBSCRIBER_INPUT');
  const occurredAt = isoDate(input.occurredAt, 'INVALID_DATE');
  const existing = input.existing ? SubscriberStateSchema.parse(input.existing) : null;
  if (existing && existing.garageId !== input.garageId) throw new Error('GARAGE_SCOPE_MISMATCH');
  if (input.operation === 'create') {
    if (existing) throw new Error('SUBSCRIBER_ALREADY_EXISTS');
    const startAt = isoDate(input.startAt, 'START_DATE_REQUIRED');
    const endAt = isoDate(input.endAt, 'END_DATE_REQUIRED');
    if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error('INVALID_DATE_RANGE');
    const subscriber = SubscriberStateSchema.parse({ id: input.subscriberId, garageId: input.garageId, plate: input.plate, status: 'active', startAt, endAt, updatedAt: occurredAt });
    return result(input, subscriber, ['status', 'startAt', 'endAt', 'updatedAt']);
  }
  if (!existing) throw new Error('SUBSCRIBER_NOT_FOUND');
  if (existing.status === 'deleted' && input.operation !== 'delete') throw new Error('SUBSCRIBER_DELETED');
  if (input.operation === 'renew') {
    if (existing.status === 'cancelled') throw new Error('SUBSCRIBER_CANCELLED');
    const startAt = isoDate(input.startAt, 'START_DATE_REQUIRED');
    const endAt = isoDate(input.endAt, 'END_DATE_REQUIRED');
    if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error('INVALID_DATE_RANGE');
    return result(input, { ...existing, status: 'active', startAt, endAt, updatedAt: occurredAt }, ['status', 'startAt', 'endAt', 'updatedAt']);
  }
  if (input.operation === 'update') {
    const startAt = input.startAt ? isoDate(input.startAt, 'INVALID_START_DATE') : existing.startAt;
    const endAt = input.endAt ? isoDate(input.endAt, 'INVALID_END_DATE') : existing.endAt;
    if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error('INVALID_DATE_RANGE');
    const allowedUpdates: SubscriberOperation['allowedUpdates'] = ['updatedAt'];
    if (input.startAt) allowedUpdates.push('startAt');
    if (input.endAt) allowedUpdates.push('endAt');
    return result(input, { ...existing, startAt, endAt, updatedAt: occurredAt }, allowedUpdates);
  }
  if (input.operation === 'suspend') {
    if (existing.status !== 'active') throw new Error('SUBSCRIBER_NOT_ACTIVE');
    return result(input, { ...existing, status: 'suspended', updatedAt: occurredAt }, ['status', 'updatedAt']);
  }
  if (input.operation === 'delete') {
    if (existing.status === 'deleted') throw new Error('SUBSCRIBER_ALREADY_DELETED');
    return result(input, { ...existing, status: 'deleted', updatedAt: occurredAt }, ['status', 'updatedAt']);
  }
  if (existing.status === 'cancelled') throw new Error('SUBSCRIBER_ALREADY_CANCELLED');
  return result(input, { ...existing, status: 'cancelled', updatedAt: occurredAt }, ['status', 'updatedAt']);
}

function result(input: SubscriberCommandInput, subscriber: SubscriberState, allowedUpdates: SubscriberOperation['allowedUpdates']): SubscriberCommandResult {
  return { subscriber, operation: SubscriberOperationSchema.parse({ operationId: operationId(input), operation: input.operation, subscriberId: input.subscriberId, garageId: input.garageId, occurredAt: subscriber.updatedAt, allowedUpdates }) };
}
