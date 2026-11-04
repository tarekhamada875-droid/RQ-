/**
 * Server-authoritative vehicle cost calculation.
 *
 * Extracted from server/utils.ts (Wave 6a). The server is authoritative
 * at checkout; the client has its own copy in src/utils/cost.ts for
 * live previews. Keep the two in sync if either changes.
 */

export function calculateVehicleCost(
  vehicleData: { isSubscriber?: boolean; type?: string; entryTime: any },
  garageData: { hourlyRate?: number; overnightRate?: number },
  now: number = Date.now()
): number {
  if (vehicleData.isSubscriber) return 0;

  const entryTime = vehicleData.entryTime?.toDate
    ? vehicleData.entryTime.toDate()
    : new Date(vehicleData.entryTime);
  if (!entryTime || isNaN(entryTime.getTime())) return 0;

  const diffMs = now - entryTime.getTime();

  // 5-minute grace period: protects against accidental/instant check-in errors
  if (diffMs < 5 * 60 * 1000) return 0;

  const type = vehicleData.type || 'hourly';

  if (type === 'overnight') {
    const overnightRate = Number(garageData.overnightRate || 0);
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return Number((days * overnightRate).toFixed(2));
  }

  const hourlyRate = Number(garageData.hourlyRate || 0);
  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  // Hourly billing is independent of overnight — no cap, no ceiling.
  const total = hours * hourlyRate;
  return Number(total.toFixed(2));
}
