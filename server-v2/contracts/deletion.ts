import { z } from 'zod';

const CursorSchema = z.object({ version: z.literal(1), sortValue: z.string().min(1), id: z.string().min(1) }).strict();

export const DeletionJobSchema = z.object({
  id: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  phase: z.enum(['queued', 'deleting', 'repair_needed', 'completed']),
  cursor: CursorSchema.optional(),
  deletedCount: z.number().int().nonnegative(),
  lastError: z.string().min(1).max(500).optional(),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

export type DeletionJob = z.infer<typeof DeletionJobSchema>;
