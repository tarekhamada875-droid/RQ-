import { describe, expect, it } from 'vitest';
import { applyCheckoutReportDelta, emptyDailyReportAggregate } from './reportAggregate';

class SyntheticDailyReportTransaction {
  private aggregate = emptyDailyReportAggregate();
  private readonly completedOperations = new Set<string>();
  private queue = Promise.resolve();

  async checkOut(operationId: string, delta: { type: string; amount: number; staffName: string }) {
    const run = this.queue.then(async () => {
      if (this.completedOperations.has(operationId)) return { duplicate: true };
      await new Promise((resolve) => setImmediate(resolve));
      this.aggregate = applyCheckoutReportDelta(this.aggregate, delta);
      this.completedOperations.add(operationId);
      return { duplicate: false };
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  snapshot() {
    return this.aggregate;
  }
}

describe('synthetic checkout/report aggregate integration', () => {
  it('preserves all aggregate increments under concurrent check-outs', async () => {
    const transaction = new SyntheticDailyReportTransaction();
    const operations = Array.from({ length: 100 }, (_, index) => ({
      operationId: `checkout-${index}`,
      delta: {
        type: index % 4 === 0 ? 'overnight' : 'hourly',
        amount: index + 1,
        staffName: index % 2 === 0 ? 'Ali' : 'Mona'
      }
    }));

    const results = await Promise.all(operations.map((operation) => transaction.checkOut(operation.operationId, operation.delta)));
    const aggregate = transaction.snapshot();

    expect(results.every((result) => result.duplicate === false)).toBe(true);
    expect(aggregate.totalExited).toBe(100);
    expect(aggregate.hourlyExited).toBe(75);
    expect(aggregate.overnightExited).toBe(25);
    expect(aggregate.grossRevenue).toBe(5050);
    expect(aggregate.staffPerformance.Ali).toEqual({ name: 'Ali', count: 50, revenue: 2500 });
    expect(aggregate.staffPerformance.Mona).toEqual({ name: 'Mona', count: 50, revenue: 2550 });
  });

  it('does not double-count an idempotent retry', async () => {
    const transaction = new SyntheticDailyReportTransaction();
    const delta = { type: 'hourly', amount: 35, staffName: 'Ali' };

    const results = await Promise.all([
      transaction.checkOut('same-checkout', delta),
      transaction.checkOut('same-checkout', delta),
      transaction.checkOut('same-checkout', delta)
    ]);

    expect(results.filter((result) => result.duplicate === false)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate === true)).toHaveLength(2);
    expect(transaction.snapshot()).toMatchObject({
      totalExited: 1,
      hourlyExited: 1,
      overnightExited: 0,
      grossRevenue: 35,
      staffPerformance: { Ali: { name: 'Ali', count: 1, revenue: 35 } }
    });
  });
});
