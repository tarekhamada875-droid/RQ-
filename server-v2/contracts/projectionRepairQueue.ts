import { z } from 'zod';
import { ProjectionRepairTaskSchema } from './projectionWorker.js';

export const ProjectionRepairQueueStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const ProjectionRepairQueueTaskSchema = ProjectionRepairTaskSchema.extend({
  status: ProjectionRepairQueueStatusSchema,
  attempts: z.number().int().nonnegative().max(10),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  nextAttemptAt: z.string().datetime({ offset: true }).optional(),
  workerId: z.string().min(1).max(160).optional(),
  leaseUntil: z.string().datetime({ offset: true }).optional(),
  lastErrorCode: z.string().min(1).max(80).optional()
}).strict();

export const ProjectionRepairQueueEnqueueInputSchema = ProjectionRepairTaskSchema;
export const ProjectionRepairQueueClaimInputSchema = z.object({
  limit: z.number().int().min(1).max(25),
  workerId: z.string().min(1).max(160),
  now: z.string().datetime({ offset: true })
}).strict();
export const ProjectionRepairQueueTaskActionInputSchema = z.object({
  taskId: z.string().min(1).max(160),
  workerId: z.string().min(1).max(160),
  now: z.string().datetime({ offset: true }),
  errorCode: z.string().min(1).max(80).optional()
}).strict();

export type ProjectionRepairQueueTask = z.infer<typeof ProjectionRepairQueueTaskSchema>;
export type ProjectionRepairQueueEnqueueInput = z.infer<typeof ProjectionRepairQueueEnqueueInputSchema>;
export type ProjectionRepairQueueClaimInput = z.infer<typeof ProjectionRepairQueueClaimInputSchema>;
export type ProjectionRepairQueueTaskActionInput = z.infer<typeof ProjectionRepairQueueTaskActionInputSchema>;
