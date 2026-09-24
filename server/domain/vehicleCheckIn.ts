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
}

export interface VehicleCheckInVehicleState {
  readonly exists: boolean;
  readonly status?: string;
}

export interface FairUseDecision {
  readonly allowed: boolean;
  readonly updatedFairUse?: unknown;
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
  fairUse: FairUseDecision | null,
): VehicleCheckInResult<VehicleCheckInDecision> {
  if (!garage.exists) return { ok: false, error: 'GARAGE_NOT_FOUND' };
  if (garage.isDeleting) return { ok: false, error: 'GARAGE_DELETION_IN_PROGRESS' };
  if (garage.isLocked || garage.isSuspended) return { ok: false, error: 'GARAGE_CHECK_IN_LOCKED' };
  if (garage.isSubscriberAuthoritative) return { ok: false, error: 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN' };
  if (garage.balanceExpiryMs === null || garage.balanceExpiryMs < command.nowMs) {
    return { ok: false, error: 'SUBSCRIPTION_EXPIRED' };
  }

  const isNewDay = garage.lastTransactionDate !== command.today;
  const capacity = garage.dailyCapacity;
  const used = isNewDay ? 0 : garage.todayCount;
  const isUnlimited = capacity === 0 || garage.activePackageName.includes('مفتوح');

  if (isUnlimited) {
    if (!fairUse || !fairUse.allowed) return { ok: false, error: 'FAIR_USE_LIMIT_REACHED' };
  } else if (used >= capacity) {
    return { ok: false, error: 'CAPACITY_LIMIT_REACHED' };
  }

  if (vehicle.exists && vehicle.status === 'inside') {
    return { ok: false, error: 'VEHICLE_ALREADY_INSIDE' };
  }

  return {
    ok: true,
    value: {
      isUnlimited,
      isNewDay,
      used,
      capacity,
      ...(isUnlimited && fairUse ? { fairUse } : {}),
    },
  };
}
