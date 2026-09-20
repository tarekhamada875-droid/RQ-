import { z } from 'zod';

export const LedgerEventSchema = z.object({
  id: z.string().min(1).max(160),
  accountId: z.string().min(1).max(160),
  kind: z.enum(['credit', 'debit', 'refund', 'correction', 'commission']),
  amountMinor: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
  operationFingerprint: z.string().length(64),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export const IdempotencyRecordSchema = z.object({
  key: z.string().min(8).max(128),
  operation: z.string().min(1).max(160),
  fingerprint: z.string().length(64),
  status: z.enum(['completed']),
  responseJson: z.string().max(10000),
  createdAt: z.string().datetime({ offset: true })
}).strict();

export type LedgerEvent = z.infer<typeof LedgerEventSchema>;
export type IdempotencyRecord = z.infer<typeof IdempotencyRecordSchema>;
