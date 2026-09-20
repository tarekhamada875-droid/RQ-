import { z } from 'zod';

export const FinancialAuditEventSchema = z.object({
  id: z.string().min(1).max(160),
  requestId: z.string().uuid(),
  actorUid: z.string().min(1).max(160),
  accountId: z.string().min(1).max(160),
  operation: z.enum(['wallet.credit', 'wallet.debit', 'wallet.refund', 'wallet.reconcile']),
  resultCode: z.string().min(1).max(120),
  ledgerEventId: z.string().min(1).max(160).optional(),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export type FinancialAuditEvent = z.infer<typeof FinancialAuditEventSchema>;
