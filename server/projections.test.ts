import { describe, expect, it } from 'vitest';
import { calculateDailyProjection } from './projections';

describe('daily projection rebuilds', () => {
  const events = [
    { eventId: 'entry-1', occurredAt: '2026-09-18T06:00:00.000Z', eventType: 'vehicle_entered', payload: {} },
    { eventId: 'exit-1', occurredAt: '2026-09-18T07:00:00.000Z', eventType: 'vehicle_exited', payload: { cost: 100 } },
    { eventId: 'refund-1', occurredAt: '2026-09-18T08:00:00.000Z', eventType: 'vehicle_refunded', payload: { refundAmount: 25 } },
    { eventId: 'next-day', occurredAt: '2026-09-19T06:00:00.000Z', eventType: 'vehicle_exited', payload: { cost: 999 } }
  ];

  it('only includes events from the requested Cairo calendar day', () => {
    expect(calculateDailyProjection(events, '2026-09-18')).toEqual({
      count: 1,
      exitsCount: 1,
      grossRevenue: 100,
      refundRevenue: 25,
      netRevenue: 75,
      revenue: 75
    });
  });

  it('is deterministic when the same event history is replayed', () => {
    const first = calculateDailyProjection(events, '2026-09-18');
    const second = calculateDailyProjection([...events, ...[]], '2026-09-18');
    expect(second).toEqual(first);
  });

  it('does not accumulate prior projection values', () => {
    const projection = calculateDailyProjection(events, '2026-09-18');
    expect(calculateDailyProjection(events, '2026-09-18').revenue).toBe(projection.revenue);
  });
});

it('does not count malformed event timestamps', () => {
  expect(calculateDailyProjection([
    { occurredAt: 'not-a-date', eventType: 'vehicle_exited', payload: { cost: 100 } }
  ], '2026-09-18')).toEqual({
    count: 0,
    exitsCount: 0,
    grossRevenue: 0,
    refundRevenue: 0,
    netRevenue: 0,
    revenue: 0
  });
});
