import { describe, expect, it } from 'vitest';
import { reconcileGarageState } from './garageReconciliation';

describe('garage state reconciliation reducer', () => {
  it('derives matching garage, daily-stat, and event-ledger totals without mutation', () => {
    const input = {
      today: '2026-09-24',
      insideVehicleCount: 2,
      garage: { carsInside: 2, lastTransactionDate: '2026-09-24', todayCount: 1, todayRevenue: 75 },
      dailyStats: { count: 1, revenue: 75, exitsCount: 1 },
      events: [
        { occurredAt: '2026-09-24T08:00:00.000Z', eventType: 'vehicle_entered' },
        { occurredAt: '2026-09-24T09:00:00.000Z', eventType: 'vehicle_exited', payload: { cost: 100 } },
        { occurredAt: '2026-09-24T10:00:00.000Z', eventType: 'vehicle_refunded', payload: { refundAmount: 25 } },
        { eventType: 'vehicle_entered' }
      ]
    } as const;

    const before = structuredClone(input);
    const result = reconcileGarageState(input);

    expect(result).toEqual({
      expected: { carsInside: 2, todayCount: 1, todayRevenue: 75 },
      actual: { carsInside: 2, todayCount: 1, todayRevenue: 75 },
      eventLedgerSummary: {
        totalRecordedEvents: 4,
        todayEnters: 1,
        todayExits: 1,
        todayRefunds: 1,
        eventGrossRevenue: 100,
        eventRefundRevenue: 25,
        eventDerivedRevenue: 75
      },
      differences: { carsInside: 0, todayCount: 0, todayRevenue: 0 },
      eventLedgerDifferences: { todayCount: 0, todayExits: 0, todayRevenue: 0 },
      operationalStateConsistent: true,
      dailyStatsConsistent: true,
      eventLedgerConsistent: true,
      overallConsistent: true,
      isConsistent: true
    });
    expect(input).toEqual(before);
  });

  it('ignores daily counters on the garage document when the last transaction was on another day', () => {
    const result = reconcileGarageState({
      today: '2026-09-24',
      insideVehicleCount: 0,
      garage: { carsInside: 0, lastTransactionDate: '2026-09-23', todayCount: 12, todayRevenue: 450 },
      dailyStats: { count: 0, revenue: 0, exitsCount: 0 },
      events: []
    });

    expect(result.actual).toEqual({ carsInside: 0, todayCount: 0, todayRevenue: 0 });
    expect(result.overallConsistent).toBe(true);
  });

  it('reports differences between operational state, daily stats, and event totals', () => {
    const result = reconcileGarageState({
      today: '2026-09-24',
      insideVehicleCount: 3,
      garage: { carsInside: 2, lastTransactionDate: '2026-09-24', todayCount: 2, todayRevenue: 80 },
      dailyStats: { count: 3, revenue: 100, exitsCount: 2 },
      events: [
        { occurredAt: '2026-09-24T08:00:00.000Z', eventType: 'vehicle_entered' },
        { occurredAt: '2026-09-24T09:00:00.000Z', eventType: 'vehicle_exited', payload: { cost: 80 } }
      ]
    });

    expect(result.differences).toEqual({ carsInside: 1, todayCount: 1, todayRevenue: 20 });
    expect(result.eventLedgerDifferences).toEqual({ todayCount: 2, todayExits: 1, todayRevenue: 20 });
    expect(result.operationalStateConsistent).toBe(false);
    expect(result.dailyStatsConsistent).toBe(false);
    expect(result.eventLedgerConsistent).toBe(false);
    expect(result.overallConsistent).toBe(false);
    expect(result.isConsistent).toBe(false);
  });
});
