import crypto from 'node:crypto';
import { VehicleOperationSchema, VehicleStateSchema, type VehicleOperation, type VehicleState } from '../contracts/vehicle.js';
import { canAcceptVehicle, type CapacityInput } from './capacity.js';

export type VehicleOperationInput = Readonly<{
  operation: 'check_in' | 'check_out';
  vehicle: VehicleState;
  garageId: string;
  plate: string;
  carsInside: number;
  capacity: CapacityInput;
  occurredAt: Date;
}>;

function operationId(input: VehicleOperationInput): string {
  return `vehicle_${crypto.createHash('sha256').update(`${input.operation}:${input.vehicle.id}:${input.occurredAt.toISOString()}`).digest('hex').slice(0, 32)}`;
}

export function executeVehicleOperation(input: VehicleOperationInput): VehicleOperation {
  const vehicle = VehicleStateSchema.parse(input.vehicle);
  if (vehicle.garageId !== input.garageId) throw new Error('GARAGE_SCOPE_MISMATCH');
  if (vehicle.plate !== input.plate) throw new Error('PLATE_MISMATCH');
  if (Number.isNaN(input.occurredAt.getTime())) throw new Error('INVALID_DATE');
  if (input.operation === 'check_in') {
    if (vehicle.status === 'inside') throw new Error('VEHICLE_ALREADY_INSIDE');
    if (!canAcceptVehicle({ ...input.capacity, carsInside: input.carsInside })) throw new Error('CAPACITY_EXCEEDED');
  } else if (vehicle.status !== 'inside') {
    throw new Error('VEHICLE_NOT_INSIDE');
  }
  return VehicleOperationSchema.parse({
    operationId: operationId(input), operation: input.operation, vehicleId: vehicle.id,
    garageId: vehicle.garageId, plate: vehicle.plate, occurredAt: input.occurredAt.toISOString()
  });
}
