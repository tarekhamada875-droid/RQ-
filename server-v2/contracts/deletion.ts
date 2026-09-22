import { z } from 'zod';

const GarageIdSchema = z.string().min(1).max(160);
const JobIdSchema = z.string().min(1).max(160);
const IdempotencyKeySchema = z.string().min(8).max(128);
const IsoDateSchema = z.string().datetime({ offset: true });
const CursorSchema = z.object({ version: z.literal(1), sortValue: z.string().min(1), id: z.string().min(1) }).strict();

export const DeletionJobSchema = z.object({
  id: JobIdSchema,
  garageId: GarageIdSchema,
  phase: z.enum(['queued', 'deleting', 'repair_needed', 'completed']),
  cursor: CursorSchema.optional(),
  deletedCount: z.number().int().nonnegative(),
  lastError: z.string().min(1).max(500).optional(),
  updatedAt: IsoDateSchema
}).strict();

export const DeletionStartRequestSchema = z.object({
  idempotencyKey: IdempotencyKeySchema
}).strict();

export const DeletionStartInputSchema = z.object({
  garageId: GarageIdSchema,
  actorUid: z.string().min(1).max(160),
  occurredAt: IsoDateSchema,
  idempotencyKey: IdempotencyKeySchema
}).strict();

export const DeletionAdvanceRequestSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  deletedCount: z.number().int().min(0).max(100),
  nextCursor: z.string().min(1).max(1000).optional(),
  repairNeeded: z.boolean().optional(),
  error: z.string().min(1).max(500).optional()
}).strict();

export const DeletionAdvanceInputSchema = DeletionAdvanceRequestSchema.extend({
  garageId: GarageIdSchema,
  jobId: JobIdSchema,
  actorUid: z.string().min(1).max(160),
  occurredAt: IsoDateSchema
}).strict();

export const DeletionResumeRequestSchema = z.object({
  idempotencyKey: IdempotencyKeySchema
}).strict();

export const DeletionResumeInputSchema = DeletionResumeRequestSchema.extend({
  garageId: GarageIdSchema,
  jobId: JobIdSchema,
  actorUid: z.string().min(1).max(160),
  occurredAt: IsoDateSchema
}).strict();

export const DeletionResultSchema = z.object({
  job: DeletionJobSchema
}).strict();

export type DeletionJob = z.infer<typeof DeletionJobSchema>;
export type DeletionStartRequest = z.infer<typeof DeletionStartRequestSchema>;
export type DeletionStartInput = z.infer<typeof DeletionStartInputSchema>;
export type DeletionAdvanceRequest = z.infer<typeof DeletionAdvanceRequestSchema>;
export type DeletionAdvanceInput = z.infer<typeof DeletionAdvanceInputSchema>;
export type DeletionResumeRequest = z.infer<typeof DeletionResumeRequestSchema>;
export type DeletionResumeInput = z.infer<typeof DeletionResumeInputSchema>;
export type DeletionResult = z.infer<typeof DeletionResultSchema>;
export const DeletionPageMetadataSchema = z.object({
  deletedCount: z.number().int().min(0).max(100),
  nextCursor: z.string().min(1).max(1000).optional()
}).strict();
export type DeletionPageMetadata = z.infer<typeof DeletionPageMetadataSchema>;
