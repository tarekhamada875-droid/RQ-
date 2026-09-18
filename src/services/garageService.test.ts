import { describe, expect, it } from 'vitest';
import { isFreshGarageDashboardSummary } from './garageService';

const todayInCairo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

describe('garage dashboard summary freshness', () => {
  it('accepts a current summary rebuilt within the freshness window', () => {
    const now = Date.now();
    expect(isFreshGarageDashboardSummary({ dateId: todayInCairo, rebuiltAt: new Date(now - 60_000).toISOString(), projectionVersion: 1, activeVehicleCount: 1, entriesToday: 2, exitsToday: 1, grossRevenue: 10, refundTotal: 0, netRevenue: 10 }, now)).toBe(true);
  });

  it('rejects missing, stale, future, and non-current-day summaries', () => {
    const now = Date.now();
    const base = { projectionVersion: 1, activeVehicleCount: 1, entriesToday: 2, exitsToday: 1, grossRevenue: 10, refundTotal: 0, netRevenue: 10 };
    expect(isFreshGarageDashboardSummary(undefined, now)).toBe(false);
    expect(isFreshGarageDashboardSummary({ ...base, dateId: todayInCairo, rebuiltAt: new Date(now - 6 * 60_000).toISOString() }, now)).toBe(false);
    expect(isFreshGarageDashboardSummary({ ...base, dateId: todayInCairo, rebuiltAt: new Date(now + 60_000).toISOString() }, now)).toBe(false);
    expect(isFreshGarageDashboardSummary({ ...base, dateId: '2000-01-01', rebuiltAt: new Date(now).toISOString() }, now)).toBe(false);
  });
});
