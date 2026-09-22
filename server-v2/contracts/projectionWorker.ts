import { z } from 'zod';
import { ProjectionEventSchema, ProjectionStateSchema, type ProjectionEvent } from './projection.js';

export const ProjectionRepairTaskSchema = z.object({
  taskId: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).max(160),
  events: z.array(ProjectionEventSchema).max(10_000)
}).strict();

export const ProjectionRepairWorkerBatchSchema = z.object({
  tasks: z.array(ProjectionRepairTaskSchema).max(25),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export const ProjectionRepairTaskResultSchema = z.object({
  taskId: z.string().min(1).max(160),
  state: z.enum(['rebuilt', 'replayed', 'failed']),
  sourceEventCount: z.number().int().nonnegative().optional(),
  projection: ProjectionStateSchema.optional(),
  errorCode: z.string().min(1).max(80).optional()
}).strict();

export const ProjectionRepairWorkerBatchResultSchema = z.object({
  attempted: z.number().int().nonnegative(),
  rebuilt: z.number().int().nonnegative(),
  replayed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  results: z.array(ProjectionRepairTaskResultSchema).max(25)
}).strict();

export type ProjectionRepairTask = z.infer<typeof ProjectionRepairTaskSchema>;
export type ProjectionRepairWorkerBatch = z.infer<typeof ProjectionRepairWorkerBatchSchema>;
export type ProjectionRepairTaskResult = z.infer<typeof ProjectionRepairTaskResultSchema>;
export type ProjectionRepairWorkerBatchResult = z.infer<typeof ProjectionRepairWorkerBatchResultSchema>;
export type ProjectionRepairEvent = ProjectionRepairTask['events'][number];
export type ProjectionRepairEventInput = ProjectionEvent;
