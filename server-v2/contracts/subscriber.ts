import { z } from 'zod';

export const SubscriberStateSchema = z.object({
  id: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  plate: z.string().min(2).max(32),
  status: z.enum(['active', 'suspended', 'cancelled']),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

export const SubscriberOperationSchema = z.object({
  operationId: z.string().min(1).max(160),
  operation: z.enum(['create', 'renew', 'update', 'suspend', 'cancel']),
  subscriberId: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  allowedUpdates: z.array(z.enum(['status', 'startAt', 'endAt', 'updatedAt', 'ownerName', 'phone', 'notes']))
}).strict();

export type SubscriberState = z.infer<typeof SubscriberStateSchema>;
export type SubscriberOperation = z.infer<typeof SubscriberOperationSchema>;
