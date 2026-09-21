import { VehiclePricingInputSchema, VehiclePricingResultSchema, type VehiclePricingInput, type VehiclePricingResult } from '../contracts/vehiclePricing.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const GRACE_PERIOD_MS = 5 * MINUTE_MS;

export function calculateVehiclePrice(input: VehiclePricingInput): VehiclePricingResult {
  const value = VehiclePricingInputSchema.parse(input);
  const entryAt = new Date(value.entryAt);
  const now = new Date(value.now);
  const elapsed = now.getTime() - entryAt.getTime();
  if (value.isSubscriber) return VehiclePricingResultSchema.parse({ amount: 0, currency: 'EGP', graceApplied: false });
  if (elapsed < GRACE_PERIOD_MS) return VehiclePricingResultSchema.parse({ amount: 0, currency: 'EGP', graceApplied: true });

  if (value.type === 'overnight') {
    const days = Math.max(1, Math.ceil(elapsed / DAY_MS));
    return VehiclePricingResultSchema.parse({ amount: Number((days * value.overnightRate).toFixed(2)), currency: 'EGP', graceApplied: false });
  }

  const hours = Math.max(1, Math.ceil(elapsed / HOUR_MS));
  let total = hours * value.hourlyRate;
  if (value.overnightRate > 0 && elapsed >= DAY_MS) {
    const fullDays = Math.floor(elapsed / DAY_MS);
    const remainingHours = Math.ceil((elapsed % DAY_MS) / HOUR_MS);
    const blended = (fullDays * value.overnightRate) + Math.min(value.overnightRate, remainingHours * value.hourlyRate);
    total = Math.min(total, blended);
  }
  return VehiclePricingResultSchema.parse({ amount: Number(total.toFixed(2)), currency: 'EGP', graceApplied: false });
}
