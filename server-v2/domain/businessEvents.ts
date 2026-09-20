import crypto from 'node:crypto';
import { BusinessEventSchema, type BusinessEvent, type BusinessEventType } from '../contracts/businessEvents.js';

export type BusinessEventInput = Readonly<{
  eventType: BusinessEventType;
  aggregateId: string;
  accountId: string;
  amountMinor: number;
  sourceEventId?: string;
  idempotencyKey: string;
  operationFingerprint: string;
  actorUid: string;
  occurredAt: Date;
}>;

export function createBusinessEvent(input: BusinessEventInput): BusinessEvent {
  if (Number.isNaN(input.occurredAt.getTime())) throw new Error('INVALID_DATE');
  if (input.eventType === 'refund' && !input.sourceEventId) throw new Error('REFUND_SOURCE_REQUIRED');
  const eventId = `financial_${crypto.createHash('sha256').update(`${input.accountId}:${input.idempotencyKey}:${input.eventType}`).digest('hex').slice(0, 32)}`;
  const document = {
    eventId, eventType: input.eventType, aggregateId: input.aggregateId, accountId: input.accountId,
    amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey,
    operationFingerprint: input.operationFingerprint, actorUid: input.actorUid,
    occurredAt: input.occurredAt.toISOString(),
    ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {})
  };
  return BusinessEventSchema.parse(document);
}

export const createPurchaseEvent = (input: Omit<BusinessEventInput, 'eventType'>): BusinessEvent => createBusinessEvent({ ...input, eventType: 'purchase' });
export const createRechargeEvent = (input: Omit<BusinessEventInput, 'eventType'>): BusinessEvent => createBusinessEvent({ ...input, eventType: 'recharge' });
export const createCommissionEvent = (input: Omit<BusinessEventInput, 'eventType'>): BusinessEvent => createBusinessEvent({ ...input, eventType: 'commission' });
export const createRefundEvent = (input: Omit<BusinessEventInput, 'eventType'> & { sourceEventId: string }): BusinessEvent => createBusinessEvent({ ...input, eventType: 'refund' });
