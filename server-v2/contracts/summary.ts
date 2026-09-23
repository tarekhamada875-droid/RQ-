import { z } from 'zod';

export const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [yearText, monthText, dayText] = value.split('-');
  if (!yearText || !monthText || !dayText) return false;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Date key must be a real calendar date');

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
