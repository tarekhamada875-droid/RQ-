import { DashboardReportSchema, type DashboardReport } from '../contracts/report.js';
import { GarageSummarySchema, type GarageSummary } from '../contracts/summary.js';
import type { ProjectionReconciliation } from './projections.js';

export function createDashboardReport(summary: GarageSummary, reconciliation: ProjectionReconciliation, now: Date, repairReason?: string): DashboardReport {
  const data = GarageSummarySchema.parse(summary);
  if (Number.isNaN(now.getTime())) throw new Error('INVALID_DATE');
  const status: DashboardReport['status'] = repairReason ? 'repair_needed' : reconciliation.consistent ? 'consistent' : 'inconsistent';
  return DashboardReportSchema.parse({ data, status, projectionVersion: data.projectionVersion, asOf: data.asOf, projectionLagMs: reconciliation.projectionLagMs, differences: reconciliation.differences, ...(repairReason ? { repairReason } : {}) });
}
