export type VehicleCheckOutError =
  | 'GARAGE_NOT_FOUND'
  | 'VEHICLE_NOT_FOUND'
  | 'VEHICLE_ALREADY_OUTSIDE';

export type VehicleCheckOutResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: VehicleCheckOutError };

export interface VehicleCheckOutGarageState {
  readonly exists: boolean;
  readonly lastTransactionDate?: string;
}

export interface VehicleCheckOutVehicleState {
  readonly exists: boolean;
  readonly status?: string;
}

export interface VehicleCheckOutCommand {
  readonly today: string;
  readonly cost: number;
}

export interface VehicleCheckOutDecision {
  readonly cost: number;
  readonly isNewDay: boolean;
}

export function decideVehicleCheckOut(
  command: VehicleCheckOutCommand,
  garage: VehicleCheckOutGarageState,
  vehicle: VehicleCheckOutVehicleState,
): VehicleCheckOutResult<VehicleCheckOutDecision> {
  if (!garage.exists) return { ok: false, error: 'GARAGE_NOT_FOUND' };
  if (!vehicle.exists) return { ok: false, error: 'VEHICLE_NOT_FOUND' };
  if (vehicle.status === 'outside') return { ok: false, error: 'VEHICLE_ALREADY_OUTSIDE' };
  return {
    ok: true,
    value: {
      cost: Math.max(0, command.cost),
      isNewDay: garage.lastTransactionDate !== command.today,
    },
  };
}
