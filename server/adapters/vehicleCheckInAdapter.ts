import type {
  FairUseDecision,
  VehicleCheckInGarageState,
  VehicleCheckInVehicleState,
} from '../domain/vehicleCheckIn';
import type { UnlimitedFairUse } from '../unlimitedFairUse';

export type LegacyVehicleRecord = Readonly<Record<string, unknown>>;

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateToMs(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }
  return null;
}

export function garageDocumentToCheckInState(
  document: LegacyVehicleRecord | null,
  isSubscriberAuthoritative: boolean,
): VehicleCheckInGarageState {
  if (!document) {
    return {
      exists: false,
      isDeleting: false,
      isLocked: false,
      isSuspended: false,
      balanceExpiryMs: null,
      dailyCapacity: 0,
      todayCount: 0,
      isSubscriberAuthoritative,
      activePackageName: '',
    };
  }
  return {
    exists: true,
    isDeleting: document.isDeleting === true,
    isLocked: document.isLocked === true,
    isSuspended: document.isSuspended === true,
    balanceExpiryMs: dateToMs(document.balanceExpiry),
    dailyCapacity: numberOr(document.dailyCapacity, 0),
    todayCount: numberOr(document.todayCount, 0),
    ...(typeof document.lastTransactionDate === 'string' ? { lastTransactionDate: document.lastTransactionDate } : {}),
    isSubscriberAuthoritative,
    activePackageName: typeof document.activePackageName === 'string' ? document.activePackageName : '',
  };
}

export function vehicleDocumentToCheckInState(document: LegacyVehicleRecord | null): VehicleCheckInVehicleState {
  if (!document) return { exists: false };
  return {
    exists: true,
    ...(typeof document.status === 'string' ? { status: document.status } : {}),
  };
}

export function fairUseResultToDecision(result: Readonly<{ allowed: boolean; updatedFairUse?: UnlimitedFairUse; autoExtended: boolean }>): FairUseDecision {
  return {
    allowed: result.allowed,
    autoExtended: result.autoExtended,
    ...(result.updatedFairUse !== undefined ? { updatedFairUse: result.updatedFairUse } : {}),
  };
}
