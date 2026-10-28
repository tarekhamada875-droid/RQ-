export type VehicleCheckInError =
  | 'GARAGE_NOT_FOUND'
  | 'GARAGE_DELETION_IN_PROGRESS'
  | 'GARAGE_CHECK_IN_LOCKED'
  | 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN'
  | 'VEHICLE_ALREADY_INSIDE';

export type VehicleCheckInResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: VehicleCheckInError };

export interface VehicleCheckInGarageState {
  readonly exists: boolean;
  readonly isDeleting: boolean;
  readonly isLocked: boolean;
  readonly isSuspended: boolean;
  readonly isSubscriberAuthoritative: boolean;
}

export interface VehicleCheckInVehicleState {
  readonly exists: boolean;
  readonly status?: string;
}

export interface VehicleCheckInDecision {
  readonly isUnlimited: true;
  readonly isNewDay: false;
  readonly used: 0;
  readonly capacity: 0;
}

export function decideVehicleCheckIn(
  garage: VehicleCheckInGarageState,
  vehicle: VehicleCheckInVehicleState,
): VehicleCheckInResult<VehicleCheckInDecision> {
  if (!garage.exists) return { ok: false, error: 'GARAGE_NOT_FOUND' };
  if (garage.isDeleting) return { ok: false, error: 'GARAGE_DELETION_IN_PROGRESS' };
  if (garage.isLocked || garage.isSuspended) return { ok: false, error: 'GARAGE_CHECK_IN_LOCKED' };
  if (garage.isSubscriberAuthoritative) return { ok: false, error: 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN' };
  // Existing records must explicitly be outside before another entry is accepted.
  // Missing or unexpected statuses are ambiguous and must not trigger another credit debit.
  if (vehicle.exists && vehicle.status !== 'outside') {
    return { ok: false, error: 'VEHICLE_ALREADY_INSIDE' };
  }

  return {
    ok: true,
    value: {
      isUnlimited: true,
      isNewDay: false,
      used: 0,
      capacity: 0,
    },
  };
}
