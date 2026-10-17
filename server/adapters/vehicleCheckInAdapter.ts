import type { VehicleCheckInGarageState, VehicleCheckInVehicleState } from '../domain/vehicleCheckIn';

export type LegacyVehicleRecord = Readonly<Record<string, unknown>>;

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
      isSubscriberAuthoritative,
      prepaidCreditsEnabled: false,
    };
  }
  return {
    exists: true,
    isDeleting: document.isDeleting === true,
    isLocked: document.isLocked === true,
    isSuspended: document.isSuspended === true,
    isSubscriberAuthoritative,
    // Garage access is credit-only after the legacy time-based model retirement.
    prepaidCreditsEnabled: true,
  };
}

export function vehicleDocumentToCheckInState(document: LegacyVehicleRecord | null): VehicleCheckInVehicleState {
  if (!document) return { exists: false };
  return {
    exists: true,
    ...(typeof document.status === 'string' ? { status: document.status } : {}),
  };
}
