import crypto from 'node:crypto';
import { GarageLifecycleOperationSchema, GarageLifecycleStateSchema, type GarageLifecycleOperation, type GarageLifecycleState } from '../contracts/garageLifecycle.js';

type GarageCommandInput = Readonly<{
  operation: 'lock' | 'unlock' | 'suspend' | 'unsuspend';
  existing: GarageLifecycleState;
  garageId: string;
  occurredAt: Date;
}>;

export type GarageCommandResult = Readonly<{ garage: GarageLifecycleState; operation: GarageLifecycleOperation }>;

function operationId(input: GarageCommandInput): string {
  return `garage_${crypto.createHash('sha256').update(`${input.operation}:${input.garageId}:${input.occurredAt.toISOString()}`).digest('hex').slice(0, 32)}`;
}

export function executeGarageCommand(input: GarageCommandInput): GarageCommandResult {
  const existing = GarageLifecycleStateSchema.parse(input.existing);
  if (existing.id !== input.garageId) throw new Error('GARAGE_SCOPE_MISMATCH');
  if (Number.isNaN(input.occurredAt.getTime())) throw new Error('INVALID_DATE');
  let garage: GarageLifecycleState;
  let allowedUpdates: GarageLifecycleOperation['allowedUpdates'];
  if (input.operation === 'lock') {
    if (existing.isLocked) throw new Error('GARAGE_ALREADY_LOCKED');
    garage = { ...existing, isLocked: true, updatedAt: input.occurredAt.toISOString() };
    allowedUpdates = ['isLocked', 'updatedAt'];
  } else if (input.operation === 'unlock') {
    if (!existing.isLocked) throw new Error('GARAGE_ALREADY_UNLOCKED');
    garage = { ...existing, isLocked: false, updatedAt: input.occurredAt.toISOString() };
    allowedUpdates = ['isLocked', 'updatedAt'];
  } else if (input.operation === 'suspend') {
    if (existing.isSuspended) throw new Error('GARAGE_ALREADY_SUSPENDED');
    garage = { ...existing, isSuspended: true, updatedAt: input.occurredAt.toISOString() };
    allowedUpdates = ['isSuspended', 'updatedAt'];
  } else {
    if (!existing.isSuspended) throw new Error('GARAGE_ALREADY_ACTIVE');
    garage = { ...existing, isSuspended: false, updatedAt: input.occurredAt.toISOString() };
    allowedUpdates = ['isSuspended', 'updatedAt'];
  }
  const operation = GarageLifecycleOperationSchema.parse({ operationId: operationId(input), operation: input.operation, garageId: input.garageId, occurredAt: garage.updatedAt, allowedUpdates });
  return { garage, operation };
}
