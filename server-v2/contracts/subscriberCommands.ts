import { z } from 'zod';
import { SubscriberStateSchema } from './subscriber.js';

export const SubscriberCreateInputSchema = z.object({
  garageId: z.string().min(1).max(160),
  plate: z.string().min(2).max(64),
  plateRaw: z.string().min(2).max(64),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberCreateResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  subscriber: SubscriberStateSchema
}).strict();

export type SubscriberCreateInput = z.infer<typeof SubscriberCreateInputSchema>;
export type SubscriberCreateResult = z.infer<typeof SubscriberCreateResultSchema>;
