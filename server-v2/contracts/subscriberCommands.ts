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

const SubscriberUpdateFieldsSchema = z.object({
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  ownerName: z.string().max(160).optional(),
  phone: z.string().max(64).optional(),
  notes: z.string().max(2000).optional()
}).strict();

const requireUpdateField = <T extends z.ZodTypeAny>(schema: T): T => schema.superRefine((value, context) => {
  const fields = value as { startAt?: unknown; endAt?: unknown; ownerName?: unknown; phone?: unknown; notes?: unknown };
  if (![fields.startAt, fields.endAt, fields.ownerName, fields.phone, fields.notes].some((field) => field !== undefined)) {
    context.addIssue({ code: 'custom', message: 'At least one subscriber field is required' });
  }
}) as T;

export const SubscriberUpdateInputSchema = requireUpdateField(SubscriberUpdateFieldsSchema.extend({
  garageId: z.string().min(1).max(160),
  subscriberId: z.string().min(1).max(160),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict());

export const SubscriberUpdateRequestSchema = requireUpdateField(SubscriberUpdateFieldsSchema.extend({
  idempotencyKey: z.string().min(8).max(128)
}).strict());

export const SubscriberUpdateResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  subscriber: SubscriberStateSchema
}).strict();

export const SubscriberSuspendInputSchema = z.object({
  garageId: z.string().min(1).max(160),
  subscriberId: z.string().min(1).max(160),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberSuspendRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberSuspendResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  subscriber: SubscriberStateSchema
}).strict();

export const SubscriberCancelInputSchema = z.object({
  garageId: z.string().min(1).max(160),
  subscriberId: z.string().min(1).max(160),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberCancelRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const SubscriberCancelResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  subscriber: SubscriberStateSchema
}).strict();

export type SubscriberCreateInput = z.infer<typeof SubscriberCreateInputSchema>;
export type SubscriberCreateRequest = z.infer<typeof SubscriberCreateRequestSchema>;
export type SubscriberCreateResult = z.infer<typeof SubscriberCreateResultSchema>;
export type SubscriberRenewInput = z.infer<typeof SubscriberRenewInputSchema>;
export type SubscriberRenewRequest = z.infer<typeof SubscriberRenewRequestSchema>;
export type SubscriberRenewResult = z.infer<typeof SubscriberRenewResultSchema>;
export type SubscriberUpdateInput = z.infer<typeof SubscriberUpdateInputSchema>;
export type SubscriberUpdateRequest = z.infer<typeof SubscriberUpdateRequestSchema>;
export type SubscriberUpdateResult = z.infer<typeof SubscriberUpdateResultSchema>;
export type SubscriberSuspendInput = z.infer<typeof SubscriberSuspendInputSchema>;
export type SubscriberSuspendRequest = z.infer<typeof SubscriberSuspendRequestSchema>;
export type SubscriberSuspendResult = z.infer<typeof SubscriberSuspendResultSchema>;
export type SubscriberCancelInput = z.infer<typeof SubscriberCancelInputSchema>;
export type SubscriberCancelRequest = z.infer<typeof SubscriberCancelRequestSchema>;
export type SubscriberCancelResult = z.infer<typeof SubscriberCancelResultSchema>;
