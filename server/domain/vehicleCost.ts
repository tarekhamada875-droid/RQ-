/**
 * Server-authoritative vehicle cost calculation.
 *
 * The client has its own copy in src/utils/cost.ts for live previews.
 * Keep the two in sync if either changes. Both must return 0 for:
 *   - missing/null/falsy entryTime (treat as "no entry recorded yet")
 *   - invalid entryTime (NaN timestamp)
 *   - entryTime within the 5-minute grace period
 *   - subscriber vehicles
 * Both must also clamp the final amount to MAX_STAY_COST_EGP.
 */

/**
 * Owner directive (2026-11-19): a single stay can never cost more than
 * 999 EGP. The receipt shows exactly this amount and the garage collects
 * it in cash, so any total above 999 is clamped to exactly 999 — for BOTH
 * hourly and overnight billing. This is a hard money ceiling on the TOTAL,
 * not a rate switch (the earlier day-cap that re-billed hourly cars at the
 * overnight rate was removed separately and stays removed).
 */
export const MAX_STAY_COST_EGP = 999;

export function calculateVehicleCost(
  vehicleData: { isSubscriber?: boolean; type?: string; entryTime: any },
  garageData: { hourlyRate?: number; overnightRate?: number },
  now: number = Date.now()
): number {
  if (vehicleData.isSubscriber) return 0;

  // Guard against falsy entryTime (null/undefined/0/"") — these would
  // otherwise construct epoch (new Date(null) === 1970-01-01) and produce
  // a huge diffMs. Mirrors the client's `if (vehicle.entryTime)` check.
  if (!vehicleData.entryTime) return 0;

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
    return Math.min(MAX_STAY_COST_EGP, Number((days * overnightRate).toFixed(2)));
  }

  const hourlyRate = Number(garageData.hourlyRate || 0);
  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  // Hourly billing is independent of overnight — no day-rate switch — but the
  // money TOTAL is clamped to MAX_STAY_COST_EGP like overnight (owner
  // directive 2026-11-19, supersedes the previous "no cap" directive here).
  const total = Math.min(MAX_STAY_COST_EGP, hours * hourlyRate);
  return Number(total.toFixed(2));
}
