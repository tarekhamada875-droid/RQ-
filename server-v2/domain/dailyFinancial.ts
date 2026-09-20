import { BusinessEventSchema, type BusinessEvent } from '../contracts/businessEvents.js';
import { DailyFinancialRebuildSchema, DailyFinancialSummarySchema, type DailyFinancialRebuild, type DailyFinancialSummary } from '../contracts/dailyFinancial.js';
import { businessDateKey } from './operations.js';

const MAX_SOURCE_EVENTS = 10_000;

export function rebuildDailyFinancialSummary(rawEvents: ReadonlyArray<BusinessEvent>, garageId: string, dateKey: string, now: Date): DailyFinancialRebuild {
  if (!garageId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || Number.isNaN(now.getTime())) throw new Error('INVALID_REBUILD_INPUT');
  if (rawEvents.length > MAX_SOURCE_EVENTS) return DailyFinancialRebuildSchema.parse({ status: 'repair_needed', reason: 'SOURCE_EVENT_WINDOW_EXCEEDED' });
  try {
    const events = rawEvents.map((event) => BusinessEventSchema.parse(event)).filter((event) => event.accountId === garageId && businessDateKey(new Date(event.occurredAt)) === dateKey);
    const totals = events.reduce((result, event) => ({
      purchaseGrossMinor: result.purchaseGrossMinor + (event.eventType === 'purchase' ? event.amountMinor : 0),
      rechargeMinor: result.rechargeMinor + (event.eventType === 'recharge' ? event.amountMinor : 0),
      commissionMinor: result.commissionMinor + (event.eventType === 'commission' ? event.amountMinor : 0),
      refundMinor: result.refundMinor + (event.eventType === 'refund' ? event.amountMinor : 0)
    }), { purchaseGrossMinor: 0, rechargeMinor: 0, commissionMinor: 0, refundMinor: 0 });
    const summary = DailyFinancialSummarySchema.parse({ garageId, dateKey, ...totals, netRevenueMinor: totals.purchaseGrossMinor - totals.refundMinor - totals.commissionMinor, projectionVersion: 1, asOf: now.toISOString(), sourceEventCount: events.length });
    return DailyFinancialRebuildSchema.parse({ status: 'rebuilt', summary });
  } catch {
    return DailyFinancialRebuildSchema.parse({ status: 'repair_needed', reason: 'INVALID_SOURCE_EVENT' });
  }
}

export type { DailyFinancialSummary };
