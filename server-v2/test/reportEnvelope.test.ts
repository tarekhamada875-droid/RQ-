import { describe, expect, it } from 'vitest';
import type { ProjectionReconciliation } from '../domain/projections.js';
import { createDashboardReport } from '../domain/reportEnvelope.js';

const summary = { garageId: 'garage-1', dateKey: '2026-09-20', activeVehicleCount: 2, entriesToday: 3, exitsToday: 1, grossRevenueMinor: 1000, refundTotalMinor: 100, netRevenueMinor: 900, projectionVersion: 1, asOf: '2026-09-20T09:00:00.000Z' };
const consistent: ProjectionReconciliation = { consistent: true, differences: { activeVehicleCount: 0, entriesToday: 0, exitsToday: 0, grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0 }, projectionLagMs: 60_000 };
const inconsistent: ProjectionReconciliation = { consistent: false, differences: { activeVehicleCount: 1, entriesToday: 0, exitsToday: 0, grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0 }, projectionLagMs: 120_000 };

describe('v2 dashboard report envelope', () => {
  it('exposes version, as-of, lag, and consistent status', () => {
    expect(createDashboardReport(summary, consistent, new Date('2026-09-20T10:00:00.000Z'))).toMatchObject({ status: 'consistent', projectionVersion: 1, asOf: summary.asOf, projectionLagMs: 60_000 });
  });

  it('exposes discrepancies and explicit repair-needed status', () => {
    const mismatch = createDashboardReport(summary, inconsistent, new Date('2026-09-20T10:00:00.000Z'));
    expect(mismatch).toMatchObject({ status: 'inconsistent', differences: { activeVehicleCount: 1 } });
    const repair = createDashboardReport(summary, consistent, new Date('2026-09-20T10:00:00.000Z'), 'REBUILD_REQUIRED');
    expect(repair).toMatchObject({ status: 'repair_needed', repairReason: 'REBUILD_REQUIRED' });
  });
});
