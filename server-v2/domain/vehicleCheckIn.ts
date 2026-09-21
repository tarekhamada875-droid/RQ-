import crypto from 'node:crypto';
import { VehicleCheckInContextSchema, VehicleCheckInInputSchema, VehicleCheckInResultSchema, type VehicleCheckInContext, type VehicleCheckInInput, type VehicleCheckInResult } from '../contracts/vehicleCommands.js';
import { VehicleStateSchema } from '../contracts/vehicle.js';

function operationId(input: VehicleCheckInInput): string {
  return `vehicle_${crypto.createHash('sha256').update(`${input.garageId}:check_in:${input.idempotencyKey}`).digest('hex').slice(0, 32)}`;
}

export function decideVehicleCheckIn(input: VehicleCheckInInput, context: VehicleCheckInContext, existingVehicle: unknown | null): VehicleCheckInResult {
  const command = VehicleCheckInInputSchema.parse(input);
  const state = VehicleCheckInContextSchema.parse(context);
  const existing = existingVehicle === null ? null : VehicleStateSchema.parse(existingVehicle);

  if (state.garageId !== command.garageId) throw new Error('GARAGE_SCOPE_MISMATCH');
  if (state.isDeleting) throw new Error('GARAGE_DELETION_IN_PROGRESS');
  if (state.isLocked || state.isSuspended) throw new Error('GARAGE_CHECK_IN_LOCKED');
  if (new Date(state.subscriptionExpiresAt).getTime() < new Date(command.occurredAt).getTime()) throw new Error('SUBSCRIPTION_EXPIRED');
  if (state.activeSubscriber) throw new Error('MONTHLY_SUBSCRIBER_NOT_CHECKED_IN');
  if (!state.fairUseAllowed) throw new Error('FAIR_USE_LIMIT_REACHED');
  if (!state.isUnlimited && state.dailyCount >= state.dailyCapacity) throw new Error('CAPACITY_LIMIT_REACHED');
  if (existing?.status === 'inside') throw new Error('VEHICLE_ALREADY_INSIDE');

  const vehicle = VehicleStateSchema.parse({
    id: command.plateRaw,
    garageId: command.garageId,
    plate: command.plate,
    status: 'inside',
    entryAt: command.occurredAt,
    updatedAt: command.occurredAt
  });
  return VehicleCheckInResultSchema.parse({
    operationId: operationId(command),
    vehicle,
    carsInside: state.carsInside + 1,
    dailyCount: state.dailyCount + 1,
    dailyCapacity: state.isUnlimited ? 0 : state.dailyCapacity
  });
}
