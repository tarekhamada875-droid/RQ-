import { describe, expect, it } from 'vitest';
import { buildGarageReportStats } from './GarageReportsView';

describe('buildGarageReportStats', () => {
  it('counts only checkout logs and uses the persisted amount', () => {
    const stats = buildGarageReportStats([
      { id: 'entry-1', actionType: 'check_in', staffName: 'Ali', amount: 0 },
      { id: 'exit-1', actionType: 'check_out', type: 'hourly', staffName: 'Ali', amount: 35 },
      { id: 'recharge-1', actionType: 'recharge', staffName: 'Ali', amount: 500 },
      { id: 'exit-2', actionType: 'check_out', type: 'overnight', staffName: 'Manager', amount: 50 },
    ], [], { id: 'garage-1', name: 'Manager' } as any);

    expect(stats.totalExited).toBe(2);
    expect(stats.hourlyExited).toBe(1);
    expect(stats.overnightExited).toBe(1);
    expect(stats.actualCalculatedTodayRevenue).toBe(85);
    expect(stats.staffPerformance).toEqual([
      { name: 'مدير الجراج', count: 2, revenue: 85 },
    ]);
  });

  it('keeps historical totalCost as a compatibility fallback', () => {
    const stats = buildGarageReportStats([
      { id: 'exit-1', actionType: 'check_out', type: 'hourly', totalCost: 25 },
    ], [], undefined);

    expect(stats.actualCalculatedTodayRevenue).toBe(25);
  });

  // Regression guard for the "2900 revenue next to 0 exits" bug: when the
  // activity log has no checkouts for today, the fallback revenue must be 0,
  // never the stale `garage.todayRevenue` counter that carries yesterday's
  // money (and is also bumped by subscriber renewals).
  it('reports zero revenue when there are no checkout logs, even if a stale garage counter is present', () => {
    const stats = buildGarageReportStats(
      [{ id: 'entry-1', actionType: 'check_in', staffName: 'Ali', amount: 0 }],
      [],
      { id: 'garage-1', name: 'Manager', todayRevenue: 2900, lastTransactionDate: '2026-11-01' } as any
    );

    expect(stats.totalExited).toBe(0);
    expect(stats.actualCalculatedTodayRevenue).toBe(0);
  });
});
