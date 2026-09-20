import { z } from 'zod';

export const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GarageSummarySchema = z.object({
  garageId: z.string().min(1).max(160),
  dateKey: DateKeySchema,
  activeVehicleCount: z.number().int().nonnegative(),
  entriesToday: z.number().int().nonnegative(),
  exitsToday: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  refundTotalMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int(),
  projectionVersion: z.number().int().positive(),
  asOf: z.string().datetime({ offset: true })
}).strict();

export type GarageSummary = z.infer<typeof GarageSummarySchema>;
