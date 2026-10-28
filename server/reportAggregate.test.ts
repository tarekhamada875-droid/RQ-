import { describe, expect, it } from 'vitest';
import { applyCheckoutReportDelta, emptyDailyReportAggregate } from './reportAggregate';

describe('daily report aggregate', () => {
  it('accumulates type, revenue, and staff metrics without activity-log reads', () => {
    let aggregate = emptyDailyReportAggregate();
    aggregate = applyCheckoutReportDelta(aggregate, { type: 'hourly', amount: 35, staffName: 'Ali' });
    aggregate = applyCheckoutReportDelta(aggregate, { type: 'overnight', amount: 50, staffName: 'Ali' });
    aggregate = applyCheckoutReportDelta(aggregate, { type: 'overnight', amount: 20, staffName: 'مدير الجراج' });

    expect(aggregate).toEqual({
      totalExited: 3,
      hourlyExited: 1,
      overnightExited: 2,
      grossRevenue: 105,
      staffPerformance: {
        Ali: { name: 'Ali', count: 2, revenue: 85 },
        'مدير الجراج': { name: 'مدير الجراج', count: 1, revenue: 20 }
      }
    });
  });

  it('ignores malformed existing totals and defaults missing staff/type safely', () => {
    const aggregate = applyCheckoutReportDelta({
      totalExited: 'bad' as any,
      hourlyExited: -10,
      overnightExited: Number.NaN,
      grossRevenue: Number.POSITIVE_INFINITY,
      staffPerformance: { broken: null as any }
    }, { amount: '12.50' });

    expect(aggregate).toEqual({
      totalExited: 1,
      hourlyExited: 1,
      overnightExited: 0,
      grossRevenue: 12.5,
      staffPerformance: {
        'مدير الجراج': { name: 'مدير الجراج', count: 1, revenue: 12.5 }
      }
    });
  });
});
