import { DailyProjection } from './projections';

export interface ProjectionBucketRecord {
  activeVehicleCount?: number;
  entriesToday?: number;
  exitsToday?: number;
  grossRevenue?: number;
  refundTotal?: number;
  netRevenue?: number;
}

export interface DashboardSummary {
  activeVehicleCount: number;
  entriesToday: number;
  exitsToday: number;
  grossRevenue: number;
  refundTotal: number;
  netRevenue: number;
  projectionVersion: 1;
}

export interface DashboardReconciliation {
  summary: DashboardSummary;
  eventProjection: DailyProjection;
  differences: Record<string, number>;
  consistent: boolean;
}

const rounded = (value: number) => Number(value.toFixed(2));

export function aggregateProjectionBuckets(buckets: ProjectionBucketRecord[]): DashboardSummary {
  const totals = buckets.reduce((result, bucket) => ({
    activeVehicleCount: result.activeVehicleCount + Number(bucket.activeVehicleCount || 0),
    entriesToday: result.entriesToday + Number(bucket.entriesToday || 0),
    exitsToday: result.exitsToday + Number(bucket.exitsToday || 0),
    grossRevenue: result.grossRevenue + Number(bucket.grossRevenue || 0),
    refundTotal: result.refundTotal + Number(bucket.refundTotal || 0),
    netRevenue: result.netRevenue + Number(bucket.netRevenue || 0)
  }), { activeVehicleCount: 0, entriesToday: 0, exitsToday: 0, grossRevenue: 0, refundTotal: 0, netRevenue: 0 });
  return {
    activeVehicleCount: totals.activeVehicleCount,
    entriesToday: totals.entriesToday,
    exitsToday: totals.exitsToday,
    grossRevenue: rounded(totals.grossRevenue),
    refundTotal: rounded(totals.refundTotal),
    netRevenue: rounded(totals.netRevenue),
    projectionVersion: 1
  };
}

export function reconcileDashboardSummary(summary: DashboardSummary, eventProjection: DailyProjection): DashboardReconciliation {
  const differences = {
    entriesToday: summary.entriesToday - eventProjection.count,
    exitsToday: summary.exitsToday - eventProjection.exitsCount,
    grossRevenue: rounded(summary.grossRevenue - eventProjection.grossRevenue),
    refundTotal: rounded(summary.refundTotal - eventProjection.refundRevenue),
    netRevenue: rounded(summary.netRevenue - eventProjection.netRevenue)
  };
  return { summary, eventProjection, differences, consistent: Object.values(differences).every(value => value === 0) };
}
