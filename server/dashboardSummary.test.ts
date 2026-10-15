import { describe, expect, it } from 'vitest';
import { aggregateProjectionBuckets, isFreshDashboardSummary, isValidDateKey, normalizeStoredDashboardMoney, reconcileDashboardSummary } from './dashboardSummary';

describe('dashboard summary projections', () => {
  it('aggregates sharded additive bucket records without reading history', () => {
    expect(aggregateProjectionBuckets([
      { activeVehicleCount: 2, entriesToday: 4, exitsToday: 2, grossRevenue: 100, refundTotal: 5, netRevenue: 95 },
      { activeVehicleCount: 1, entriesToday: 3, exitsToday: 1, grossRevenue: 40.5, refundTotal: 0, netRevenue: 40.5 }
    ])).toEqual({
      activeVehicleCount: 3,
      entriesToday: 7,
      exitsToday: 3,
      grossRevenue: 140.5,
      refundTotal: 5,
      netRevenue: 135.5,
      projectionVersion: 1
    });
  });

  it('reports exact differences against the immutable event projection', () => {
    const summary = aggregateProjectionBuckets([{ activeVehicleCount: 1, entriesToday: 2, exitsToday: 1, grossRevenue: 50, refundTotal: 5, netRevenue: 45 }]);
    const reconciliation = reconcileDashboardSummary(summary, {
      count: 2, exitsCount: 1, grossRevenue: 50, refundRevenue: 5, netRevenue: 45, revenue: 45
    });
    expect(reconciliation.consistent).toBe(true);
    expect(reconciliation.differences).toEqual({ entriesToday: 0, exitsToday: 0, grossRevenue: 0, refundTotal: 0, netRevenue: 0 });
  });

  it('skips malformed bucket money while retaining valid signed net revenue', () => {
    expect(aggregateProjectionBuckets([
      { grossRevenue: 50, refundTotal: 10, netRevenue: 40 },
      { grossRevenue: -3, refundTotal: Number.POSITIVE_INFINITY, netRevenue: Number.NaN },
      { grossRevenue: 1.234, refundTotal: -2, netRevenue: -1.5 }
    ])).toMatchObject({ grossRevenue: 50, refundTotal: 10, netRevenue: 38.5 });
  });

  it('normalizes valid cached money and rejects corrupt stored dashboard money', () => {
    expect(normalizeStoredDashboardMoney({ grossRevenue: '20.50', refundTotal: 2, netRevenue: -1.25 }))
      .toEqual({ grossRevenue: 20.5, refundTotal: 2, netRevenue: -1.25 });
    expect(normalizeStoredDashboardMoney({ grossRevenue: Number.POSITIVE_INFINITY, refundTotal: 0, netRevenue: 0 })).toBeNull();
    expect(normalizeStoredDashboardMoney({ grossRevenue: 10, refundTotal: -1, netRevenue: 11 })).toBeNull();
  });

  it('accepts only real calendar date keys', () => {
    expect(isValidDateKey('2026-09-18')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-9-18')).toBe(false);
  });

  it('rejects stale, future, or differently dated stored summaries', () => {
    const now = Date.parse('2026-09-18T12:00:00.000Z');
    expect(isFreshDashboardSummary({ dateId: '2026-09-18', rebuiltAt: '2026-09-18T11:58:00.000Z' }, '2026-09-18', now)).toBe(true);
    expect(isFreshDashboardSummary({ dateId: '2026-09-18', rebuiltAt: '2026-09-18T11:54:59.000Z' }, '2026-09-18', now)).toBe(false);
    expect(isFreshDashboardSummary({ dateId: '2026-09-17', rebuiltAt: '2026-09-18T11:59:00.000Z' }, '2026-09-18', now)).toBe(false);
    expect(isFreshDashboardSummary({ dateId: '2026-09-18', rebuiltAt: '2026-09-18T12:01:00.000Z' }, '2026-09-18', now)).toBe(false);
  });
});
