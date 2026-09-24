import type { VehicleCheckOutGarageState, VehicleCheckOutVehicleState } from '../domain/vehicleCheckOut';

export type LegacyCheckOutRecord = Readonly<Record<string, unknown>>;

export function garageDocumentToCheckOutState(document: LegacyCheckOutRecord | null): VehicleCheckOutGarageState {
  if (!document) return { exists: false };
  return {
    exists: true,
    ...(typeof document.lastTransactionDate === 'string' ? { lastTransactionDate: document.lastTransactionDate } : {}),
  };
}

export function vehicleDocumentToCheckOutState(document: LegacyCheckOutRecord | null): VehicleCheckOutVehicleState {
  if (!document) return { exists: false };
  return {
    exists: true,
    ...(typeof document.status === 'string' ? { status: document.status } : {}),
  };
}
