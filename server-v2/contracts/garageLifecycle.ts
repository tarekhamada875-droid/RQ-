import { z } from 'zod';

export const GarageLifecycleStateSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  isLocked: z.boolean(),
  isSuspended: z.boolean(),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

export const GarageLifecycleOperationSchema = z.object({
  operationId: z.string().min(1).max(160),
  operation: z.enum(['lock', 'unlock', 'suspend', 'unsuspend']),
  garageId: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  allowedUpdates: z.array(z.enum(['isLocked', 'isSuspended', 'updatedAt']))
}).strict();

export type GarageLifecycleState = z.infer<typeof GarageLifecycleStateSchema>;
export type GarageLifecycleOperation = z.infer<typeof GarageLifecycleOperationSchema>;
