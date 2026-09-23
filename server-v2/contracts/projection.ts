import { z } from 'zod';
import { DateKeySchema } from './summary.js';

export const ProjectionEventSchema = z.object({
  id: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  dateKey: DateKeySchema,
  type: z.enum(['entry', 'exit', 'revenue', 'refund']),
  amountMinor: z.number().int().nonnegative().optional(),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export const ProjectionStateSchema = z.object({
  garageId: z.string().min(1).max(160),
  dateKey: DateKeySchema,
  activeVehicleCount: z.number().int().nonnegative(),
  entriesToday: z.number().int().nonnegative(),
  exitsToday: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  refundTotalMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int(),
  projectionVersion: z.number().int().positive(),
  asOf: z.string().datetime({ offset: true }),
  appliedEventIds: z.array(z.string().min(1).max(160)).max(10000)
}).strict();

export type ProjectionEvent = z.infer<typeof ProjectionEventSchema>;
export type ProjectionState = z.infer<typeof ProjectionStateSchema>;
