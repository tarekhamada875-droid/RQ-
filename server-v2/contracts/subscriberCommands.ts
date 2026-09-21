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

export const SubscriberCreateRequestSchema = z.object({
  plate: z.string().min(2).max(64),
  plateRaw: z.string().min(2).max(64),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberCreateResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  subscriber: SubscriberStateSchema
}).strict();

export const SubscriberRenewInputSchema = z.object({
  garageId: z.string().min(1).max(160),
  subscriberId: z.string().min(1).max(160),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberRenewRequestSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberRenewResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  subscriber: SubscriberStateSchema
}).strict();

export type SubscriberCreateInput = z.infer<typeof SubscriberCreateInputSchema>;
export type SubscriberCreateRequest = z.infer<typeof SubscriberCreateRequestSchema>;
export type SubscriberCreateResult = z.infer<typeof SubscriberCreateResultSchema>;
export type SubscriberRenewInput = z.infer<typeof SubscriberRenewInputSchema>;
export type SubscriberRenewRequest = z.infer<typeof SubscriberRenewRequestSchema>;
export type SubscriberRenewResult = z.infer<typeof SubscriberRenewResultSchema>;
