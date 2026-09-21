import { z } from 'zod';

export const VehiclePricingInputSchema = z.object({
  isSubscriber: z.boolean(),
  type: z.enum(['hourly', 'overnight']).default('hourly'),
  entryAt: z.string().datetime({ offset: true }),
  hourlyRate: z.number().nonnegative(),
  overnightRate: z.number().nonnegative(),
  now: z.string().datetime({ offset: true })
}).strict();

export const VehiclePricingResultSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.literal('EGP'),
  graceApplied: z.boolean()
}).strict();

export type VehiclePricingInput = z.infer<typeof VehiclePricingInputSchema>;
export type VehiclePricingResult = z.infer<typeof VehiclePricingResultSchema>;
