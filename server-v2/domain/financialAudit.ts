import crypto from 'node:crypto';
import { FinancialAuditEventSchema, type FinancialAuditEvent } from '../contracts/audit.js';

export function createFinancialAuditEvent(input: Readonly<{
  requestId: string;
  actorUid: string;
  accountId: string;
  operation: FinancialAuditEvent['operation'];
  resultCode: string;
  ledgerEventId?: string;
  occurredAt: Date;
}>): FinancialAuditEvent {
  if (Number.isNaN(input.occurredAt.getTime())) throw new Error('INVALID_DATE');
  const id = `audit_${crypto.createHash('sha256').update(`${input.requestId}:${input.accountId}:${input.operation}`).digest('hex').slice(0, 32)}`;
  return FinancialAuditEventSchema.parse({
    id, requestId: input.requestId, actorUid: input.actorUid, accountId: input.accountId,
    operation: input.operation, resultCode: input.resultCode, occurredAt: input.occurredAt.toISOString(),
    ...(input.ledgerEventId ? { ledgerEventId: input.ledgerEventId } : {})
  });
}
