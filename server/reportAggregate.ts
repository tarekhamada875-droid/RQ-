import { addMoney, parseMoneyAmount } from './money';

export interface ReportStaffAggregate {
  name: string;
  count: number;
  revenue: number;
}

export interface DailyReportAggregate {
  totalExited: number;
  hourlyExited: number;
  overnightExited: number;
  grossRevenue: number;
  staffPerformance: Record<string, ReportStaffAggregate>;
}

export interface CheckoutReportDelta {
  type?: unknown;
  amount?: unknown;
  staffName?: unknown;
}

const DEFAULT_MANAGER = 'مدير الجراج';

function finiteCount(value: unknown): number {
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : 0;
}

function normalizeStaffPerformance(value: unknown): Record<string, ReportStaffAggregate> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, ReportStaffAggregate> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : key;
    if (!name) continue;
    result[key] = {
      name,
      count: finiteCount(record.count),
      revenue: parseMoneyAmount(record.revenue) ?? 0
    };
  }
  return result;
}

export function emptyDailyReportAggregate(): DailyReportAggregate {
  return {
    totalExited: 0,
    hourlyExited: 0,
    overnightExited: 0,
    grossRevenue: 0,
    staffPerformance: {}
  };
}

export function applyCheckoutReportDelta(
  current: Partial<DailyReportAggregate> | null | undefined,
  delta: CheckoutReportDelta
): DailyReportAggregate {
  const type = delta.type === 'overnight' ? 'overnight' : 'hourly';
  const amount = parseMoneyAmount(delta.amount) ?? 0;
  const staffName = typeof delta.staffName === 'string' && delta.staffName.trim()
    ? delta.staffName.trim()
    : DEFAULT_MANAGER;
  const currentStaff = normalizeStaffPerformance(current?.staffPerformance);
  const staff = currentStaff[staffName] || { name: staffName, count: 0, revenue: 0 };

  return {
    totalExited: finiteCount(current?.totalExited) + 1,
    hourlyExited: finiteCount(current?.hourlyExited) + (type === 'hourly' ? 1 : 0),
    overnightExited: finiteCount(current?.overnightExited) + (type === 'overnight' ? 1 : 0),
    grossRevenue: addMoney(parseMoneyAmount(current?.grossRevenue) ?? 0, amount),
    staffPerformance: {
      ...currentStaff,
      [staffName]: {
        name: staff.name,
        count: staff.count + 1,
        revenue: addMoney(staff.revenue, amount)
      }
    }
  };
}
