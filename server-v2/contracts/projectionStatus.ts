import { z } from 'zod';
import { DateKeySchema } from './summary.js';

export const ProjectionStatusRequestSchema = z.object({
  dateKey: DateKeySchema
}).strict();

export const ProjectionStatusSchema = z.object({
  garageId: z.string().min(1).max(160),
  dateKey: DateKeySchema,
  state: z.enum(['missing', 'healthy', 'stale']),
  projectionVersion: z.number().int().positive().optional(),
  asOf: z.string().datetime({ offset: true }).optional(),
  lagMs: z.number().int().nonnegative().optional()
}).strict();

export type ProjectionStatus = z.infer<typeof ProjectionStatusSchema>;
