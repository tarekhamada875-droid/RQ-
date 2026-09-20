import { z } from 'zod';

export const DailyFinancialSummarySchema = z.object({
  garageId: z.string().min(1).max(160),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchaseGrossMinor: z.number().int().nonnegative(),
  rechargeMinor: z.number().int().nonnegative(),
  commissionMinor: z.number().int().nonnegative(),
  refundMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int(),
  projectionVersion: z.number().int().positive(),
  asOf: z.string().datetime({ offset: true }),
  sourceEventCount: z.number().int().nonnegative()
}).strict();

export const DailyFinancialRebuildSchema = z.object({
  status: z.enum(['rebuilt', 'repair_needed']),
  summary: DailyFinancialSummarySchema.optional(),
  reason: z.string().min(1).max(200).optional()
}).strict();

export type DailyFinancialSummary = z.infer<typeof DailyFinancialSummarySchema>;
export type DailyFinancialRebuild = z.infer<typeof DailyFinancialRebuildSchema>;
