export type VehicleCheckInError =
  | 'GARAGE_NOT_FOUND'
  | 'GARAGE_DELETION_IN_PROGRESS'
  | 'GARAGE_CHECK_IN_LOCKED'
  | 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN'
  | 'VEHICLE_ALREADY_INSIDE';

export type VehicleCheckInResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: VehicleCheckInError };

export interface VehicleCheckInCommand {
  readonly today: string;
}

export interface VehicleCheckInGarageState {
  readonly exists: boolean;
  readonly isDeleting: boolean;
  readonly isLocked: boolean;
  readonly isSuspended: boolean;
  readonly isSubscriberAuthoritative: boolean;
  readonly lastTransactionDate?: string;
}

export interface VehicleCheckInVehicleState {
  readonly exists: boolean;
  readonly status?: string;
}

export interface VehicleCheckInDecision {
  readonly isUnlimited: true;
  readonly isNewDay: boolean;
}

export function decideVehicleCheckIn(
  command: VehicleCheckInCommand,
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

  // A new Cairo day begins when the garage's last transaction was on a different
  // date. The first check-in of the new day must reset the garage-doc today
  // accumulators (todayRevenue, todayCount) so they don't carry yesterday's
  // totals into the new day — mirrors decideVehicleCheckOut's logic.
  return {
    ok: true,
    value: {
      isUnlimited: true,
      isNewDay: garage.lastTransactionDate !== command.today,
    },
  };
}
