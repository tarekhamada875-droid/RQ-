import { z } from 'zod';
import { GarageSummarySchema } from './summary.js';

export const DashboardReportSchema = z.object({
  data: GarageSummarySchema,
  status: z.enum(['consistent', 'inconsistent', 'repair_needed']),
  projectionVersion: z.number().int().positive(),
  asOf: z.string().datetime({ offset: true }),
  projectionLagMs: z.number().int().nonnegative(),
  differences: z.record(z.string(), z.number()),
  repairReason: z.string().min(1).max(200).optional()
}).strict();

export type DashboardReport = z.infer<typeof DashboardReportSchema>;
