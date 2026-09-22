import { z } from 'zod';
import { ProjectionEventSchema, ProjectionStateSchema } from './projection.js';

export const ProjectionRebuildRequestSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  events: z.array(ProjectionEventSchema).max(10_000),
  idempotencyKey: z.string().min(8).max(160)
}).strict();

export const ProjectionRebuildInputSchema = ProjectionRebuildRequestSchema.extend({
  garageId: z.string().min(1).max(160),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true })
});

export const ProjectionRebuildResultSchema = z.object({
  projection: ProjectionStateSchema,
  sourceEventCount: z.number().int().nonnegative(),
  replayed: z.boolean()
}).strict();

export type ProjectionRebuildRequest = z.infer<typeof ProjectionRebuildRequestSchema>;
export type ProjectionRebuildInput = z.infer<typeof ProjectionRebuildInputSchema>;
export type ProjectionRebuildResult = z.infer<typeof ProjectionRebuildResultSchema>;
