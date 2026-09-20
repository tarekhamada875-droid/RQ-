import { z } from 'zod';

export const BusinessEventTypeSchema = z.enum(['purchase', 'recharge', 'commission', 'refund']);

export const BusinessEventSchema = z.object({
  eventId: z.string().min(1).max(160),
  eventType: BusinessEventTypeSchema,
  aggregateId: z.string().min(1).max(160),
  accountId: z.string().min(1).max(160),
  amountMinor: z.number().int().positive(),
  sourceEventId: z.string().min(1).max(160).optional(),
  idempotencyKey: z.string().min(8).max(128),
  operationFingerprint: z.string().length(64),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export type BusinessEventType = z.infer<typeof BusinessEventTypeSchema>;
export type BusinessEvent = z.infer<typeof BusinessEventSchema>;
