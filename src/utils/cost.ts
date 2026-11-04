import { safeDate } from './dates';

/**
 * Client-side vehicle cost calculation.
 *
 * Mirrors server/domain/vehicleCost.ts calculateVehicleCost() — keep the
 * two in sync if either changes. The server is authoritative at checkout;
 * this function is used for live cost previews in the UI.
 */

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const GRACE_PERIOD_MS = 300000;

export const calculateCost = (vehicle: any, garage: any, referenceNow?: Date): number => {
  if (!vehicle || !garage) return 0;

  // Default to hourly if type is missing (for legacy data in activePlates)
  const type = vehicle.type || 'hourly';

  const now = referenceNow || new Date();
  let start = now;

  if (vehicle.entryTime) {
    start = safeDate(vehicle.entryTime);
  }

  const diffMs = now.getTime() - start.getTime();

  // If it's been less than 5 minutes, it's FREE (protection against accidental entry error)
  if (diffMs < GRACE_PERIOD_MS) return 0;

  // 0. Subscribers are always FREE at check-out
  if (vehicle.isSubscriber) return 0;

  if (type === 'overnight') {
    const overnightRate = garage.overnightRate || 0;
    const days = Math.ceil(diffMs / MS_PER_DAY);
    const total = Math.max(1, days) * overnightRate;
    return Math.round(total * 100) / 100;
  }

  if (type === 'hourly') {
    const hourlyRate = garage.hourlyRate || 0;
    const hours = Math.ceil(diffMs / MS_PER_HOUR);
    // Hourly billing is independent of overnight — no cap, no ceiling.
    // A car checked in as hourly pays hours × rate indefinitely. The overnight
    // rate only applies to cars explicitly checked in as 'overnight'.
    // (Previous day-cap logic removed per owner directive.)
    const total = Math.max(1, hours) * hourlyRate;
    return Math.round(total * 100) / 100;
  }
  return 0;
};
