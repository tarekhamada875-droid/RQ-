import type { UnlimitedFairUse } from '../unlimitedFairUse';

export type VehicleCheckInError =
  | 'GARAGE_NOT_FOUND'
  | 'GARAGE_DELETION_IN_PROGRESS'
  | 'GARAGE_CHECK_IN_LOCKED'
  | 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN'
  | 'SUBSCRIPTION_EXPIRED'
  | 'FAIR_USE_LIMIT_REACHED'
  | 'CAPACITY_LIMIT_REACHED'
  | 'VEHICLE_ALREADY_INSIDE';

export type VehicleCheckInResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: VehicleCheckInError };

export interface VehicleCheckInCommand {
  readonly today: string;
  readonly nowMs: number;
  readonly plateNumber: string;
  readonly plateNumberRaw: string;
}

export interface VehicleCheckInGarageState {
  readonly exists: boolean;
  readonly isDeleting: boolean;
  readonly isLocked: boolean;
  readonly isSuspended: boolean;
  readonly balanceExpiryMs: number | null;
  readonly dailyCapacity: number;
  readonly todayCount: number;
  readonly lastTransactionDate?: string;
  readonly isSubscriberAuthoritative: boolean;
  readonly activePackageName: string;
  readonly prepaidCreditsEnabled?: boolean;
}

export interface VehicleCheckInVehicleState {
  readonly exists: boolean;
  readonly status?: string;
}

export interface FairUseDecision {
  readonly allowed: boolean;
  readonly updatedFairUse?: UnlimitedFairUse;
  readonly autoExtended: boolean;
}

export interface VehicleCheckInDecision {
  readonly isUnlimited: boolean;
  readonly isNewDay: boolean;
  readonly used: number;
  readonly capacity: number;
  readonly fairUse?: FairUseDecision;
}

export function decideVehicleCheckIn(
  command: VehicleCheckInCommand,
  garage: VehicleCheckInGarageState,
  vehicle: VehicleCheckInVehicleState,
  _fairUse: FairUseDecision | null,
): VehicleCheckInResult<VehicleCheckInDecision> {
  if (!garage.exists) return { ok: false, error: 'GARAGE_NOT_FOUND' };
  if (garage.isDeleting) return { ok: false, error: 'GARAGE_DELETION_IN_PROGRESS' };
  if (garage.isLocked || garage.isSuspended) return { ok: false, error: 'GARAGE_CHECK_IN_LOCKED' };
  if (garage.isSubscriberAuthoritative) return { ok: false, error: 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN' };
  if (!garage.prepaidCreditsEnabled) {
    return { ok: false, error: 'SUBSCRIPTION_EXPIRED' };
  }

  if (vehicle.exists && vehicle.status === 'inside') {
    return { ok: false, error: 'VEHICLE_ALREADY_INSIDE' };
  }

  return {
    ok: true,
    value: {
      isUnlimited: true,
      isNewDay: garage.lastTransactionDate !== command.today,
      used: 0,
      capacity: 0,
    },
  };
}
