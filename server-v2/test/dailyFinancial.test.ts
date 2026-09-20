import { describe, expect, it } from 'vitest';
import type { BusinessEvent } from '../contracts/businessEvents.js';
import { rebuildDailyFinancialSummary } from '../domain/dailyFinancial.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const fingerprint = 'a'.repeat(64);
function event(eventId: string, eventType: BusinessEvent['eventType'], amountMinor: number): BusinessEvent {
  return { eventId, eventType, aggregateId: 'aggregate-1', accountId: 'garage-1', amountMinor, idempotencyKey: `idempotency-${eventId}`, operationFingerprint: fingerprint, actorUid: 'admin-1', occurredAt: '2026-09-20T09:00:00.000Z' };
}

describe('v2 daily financial summaries', () => {
  it('rebuilds integer totals from a bounded authoritative event window', () => {
    const result = rebuildDailyFinancialSummary([event('purchase-1', 'purchase', 1000), event('recharge-1', 'recharge', 5000), event('commission-1', 'commission', 100), event('refund-1', 'refund', 150)], 'garage-1', '2026-09-20', now);
    expect(result.status).toBe('rebuilt');
    expect(result.summary).toMatchObject({ purchaseGrossMinor: 1000, rechargeMinor: 5000, commissionMinor: 100, refundMinor: 150, netRevenueMinor: 750, sourceEventCount: 4, projectionVersion: 1 });
  });

  it('filters events by garage and business date', () => {
    const otherGarage = { ...event('other', 'purchase', 500), accountId: 'garage-2' };
    const otherDate = { ...event('old', 'purchase', 500), occurredAt: '2026-09-19T09:00:00.000Z' };
    const result = rebuildDailyFinancialSummary([event('valid', 'purchase', 1000), otherGarage, otherDate], 'garage-1', '2026-09-20', now);
    expect(result.summary?.sourceEventCount).toBe(1);
    expect(result.summary?.purchaseGrossMinor).toBe(1000);
  });

  it('returns a repair-needed result for oversized or invalid source windows', () => {
    const oversized = Array.from({ length: 10_001 }, (_, index) => event(`event-${index}`, 'purchase', 1));
    expect(rebuildDailyFinancialSummary(oversized, 'garage-1', '2026-09-20', now)).toEqual({ status: 'repair_needed', reason: 'SOURCE_EVENT_WINDOW_EXCEEDED' });
    const invalid = { ...event('invalid', 'purchase', 1), amountMinor: 0 } as BusinessEvent;
    expect(rebuildDailyFinancialSummary([invalid], 'garage-1', '2026-09-20', now)).toEqual({ status: 'repair_needed', reason: 'INVALID_SOURCE_EVENT' });
  });
});
