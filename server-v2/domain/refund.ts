import { z } from 'zod';
import type { FinancialEvent } from '../contracts/entities.js';

export const RefundEffectSchema = z.object({
  reversalKind: z.enum(['credit', 'debit']),
  amountMinor: z.number().int().positive(),
  sourceEventId: z.string().min(1),
  commissionReversalMinor: z.number().int().nonnegative()
}).strict();

export type RefundEffect = z.infer<typeof RefundEffectSchema>;

export function calculateRefundEffect(event: FinancialEvent, commissionMinor = 0): RefundEffect {
  if (!Number.isInteger(commissionMinor) || commissionMinor < 0) throw new Error('Invalid commission amount');
  const reversalKind = event.kind === 'credit' ? 'debit' : 'credit';
  return RefundEffectSchema.parse({ reversalKind, amountMinor: event.amountMinor, sourceEventId: event.id, commissionReversalMinor: commissionMinor });
}
