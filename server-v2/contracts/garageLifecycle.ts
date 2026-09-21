import { z } from 'zod';

const GarageIdSchema = z.string().min(1).max(160);
const IdempotencyKeySchema = z.string().min(8).max(128);
const IsoDateSchema = z.string().datetime({ offset: true });

export const GarageLifecycleStateSchema = z.object({
  id: GarageIdSchema,
  name: z.string().min(1).max(160),
  isLocked: z.boolean(),
  isSuspended: z.boolean(),
  updatedAt: IsoDateSchema
}).strict();

export const GarageLifecycleOperationSchema = z.object({
  operationId: z.string().min(1).max(160),
  operation: z.enum(['lock', 'unlock', 'suspend', 'unsuspend']),
  garageId: GarageIdSchema,
  occurredAt: IsoDateSchema,
  allowedUpdates: z.array(z.enum(['isLocked', 'isSuspended', 'updatedAt']))
}).strict();

export const GarageLifecycleRequestSchema = z.object({
  idempotencyKey: IdempotencyKeySchema
}).strict();

export const GarageLifecycleInputSchema = z.object({
  operation: z.enum(['lock', 'unlock', 'suspend', 'unsuspend']),
  garageId: GarageIdSchema,
  actorUid: z.string().min(1).max(160),
  occurredAt: IsoDateSchema,
  idempotencyKey: IdempotencyKeySchema
}).strict();

export const GarageLifecycleResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  garage: GarageLifecycleStateSchema
}).strict();

export type GarageLifecycleState = z.infer<typeof GarageLifecycleStateSchema>;
export type GarageLifecycleOperation = z.infer<typeof GarageLifecycleOperationSchema>;
export type GarageLifecycleRequest = z.infer<typeof GarageLifecycleRequestSchema>;
export type GarageLifecycleInput = z.infer<typeof GarageLifecycleInputSchema>;
export type GarageLifecycleCommandInput = Omit<GarageLifecycleInput, 'operation'>;
export type GarageLifecycleResult = z.infer<typeof GarageLifecycleResultSchema>;
