/**
 * Pure functions and types for the garage reports view.
 *
 * Extracted from GarageReportsView.tsx (Stage 2 of the structural refactor)
 * so the math can be tested in isolation without importing React.
 *
 * Nothing in this file depends on React. All functions are pure — same
 * inputs always produce the same output, no side effects.
 */

import type { ActivityLog, Garage, Vehicle, Staff } from '../../../types';

export type GarageReportRecord = Partial<Vehicle> & Partial<ActivityLog> & { id: string };

export interface GarageReportStats {
  totalExited: number;
  hourlyExited: number;
  overnightExited: number;
  actualCalculatedTodayRevenue: number;
  staffPerformance: Array<{ name: string; count: number; revenue: number }>;
}

// Activity-log fallback cap (mirrors vehicleService.TODAY_ACTIVITY_LOG_LIMIT).
// Exported so tests can pin the warning threshold without hardcoding 200 twice.
export const REPORTS_ACTIVITY_LOG_LIMIT = 200;

export type ReportsNoticeState = 'fresh_summary' | 'live_may_be_truncated' | 'live_ok';

/**
 * Decide which notice to show at the top of the reports page.
 *
 * - 'fresh_summary'           — authoritative server summary is available.
 * - 'live_may_be_truncated'   — fallback activity log is in use AND we are at
 *                               risk of having hit the 200-record cap. This is
 *                               the only state that warrants alarming the user.
 * - 'live_ok'                 — fallback activity log is in use but we have
 *                               all of today's records (fewer than the cap).
 *                               Crying "might be incomplete" here is dishonest,
 *                               especially on a quiet morning with 0 exits.
 */
export function pickReportsNoticeState(
  freshSummaryAvailable: boolean,
  totalExited: number,
  activityLogLimit: number = REPORTS_ACTIVITY_LOG_LIMIT,
): ReportsNoticeState {
  if (freshSummaryAvailable) return 'fresh_summary';
  if (totalExited >= activityLogLimit) return 'live_may_be_truncated';
  return 'live_ok';
}

export function buildGarageReportStats(
  records: GarageReportRecord[],
  staffList: Staff[],
  localGarage: Garage | null | undefined,
): GarageReportStats {
  let hourlyExited = 0;
  let overnightExited = 0;
  let actualCalculatedTodayRevenue = 0;

  const staffPerformance: Record<string, { count: number; revenue: number }> = {
    'مدير الجراج': { count: 0, revenue: 0 }
  };
  const knownStaffNames = new Set<string>();
  for (const staff of staffList || []) {
    const name = staff?.name?.trim();
    if (name) {
      staffPerformance[name] = { count: 0, revenue: 0 };
      knownStaffNames.add(name);
    }
  }

  // todayTransactions is an activity-log feed, not a vehicle feed. Only a
  // checkout represents a departure; check-ins and recharge logs must not be counted.
  const checkoutRecords = (records || []).filter((record) => record?.actionType === 'check_out');
  for (const record of checkoutRecords) {
    if (record.type === 'hourly') hourlyExited++;
    else if (record.type === 'overnight') overnightExited++;

    // Checkout activity logs persist the charge as `amount`; `totalCost` is only
    // present on the historical vehicle document.
    const fee = typeof record.amount === 'number'
      ? record.amount
      : (typeof record.totalCost === 'number' ? record.totalCost : 0);
    actualCalculatedTodayRevenue += fee;

    const rawName = (record.staffName || '').trim();
    const isGarageManager = !rawName || record.staffName === 'مدير الجراج' ||
      rawName === localGarage?.name || rawName === (localGarage as any)?.ownerName ||
      !knownStaffNames.has(rawName);
    const handler = isGarageManager ? 'مدير الجراج' : rawName;
    if (!staffPerformance[handler]) staffPerformance[handler] = { count: 0, revenue: 0 };
    staffPerformance[handler].count++;
    staffPerformance[handler].revenue += fee;
  }

  return {
    totalExited: checkoutRecords.length,
    hourlyExited,
    overnightExited,
    actualCalculatedTodayRevenue,
    staffPerformance: Object.entries(staffPerformance)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
  };
}
