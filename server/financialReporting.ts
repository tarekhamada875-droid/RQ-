export interface FinancialReportEvent {
  eventType?: string;
  occurredAt?: string | Date;
  aggregateId?: string;
  payload?: Record<string, unknown>;
}

export interface SettlementRecord {
  settlementId?: string;
  delegateId?: string;
  settledAt?: string | Date;
  previousCycleTotal?: number;
}

export interface FinancialReportOptions {
  start?: string | Date;
  end?: string | Date;
  delegateId?: string;
}

export interface FinancialReport {
  grossRechargeTotal: number;
  commissionTotal: number;
  refundTotal: number;
  companyNetRevenue: number;
  historicalSettledTotal: number;
  currentUnsettledByDelegate: Record<string, number>;
}

function asDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') return asDate((value as any).toDate());
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(value: string | Date | undefined, options: FinancialReportOptions): boolean {
  const date = asDate(value);
  if (!date) return false;
  const start = asDate(options.start);
  const end = asDate(options.end);
  return (!start || date >= start) && (!end || date < end);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

/** Derives financial totals from immutable events and settlement records without mutating state. */
export function calculateFinancialReport(
  events: FinancialReportEvent[],
  settlements: SettlementRecord[],
  options: FinancialReportOptions = {}
): FinancialReport {
  let grossRechargeTotal = 0;
  let commissionTotal = 0;
  let refundTotal = 0;
  let historicalSettledTotal = 0;
  const currentUnsettledByDelegate: Record<string, number> = {};
  const latestSettlementByDelegate: Record<string, Date> = {};

  for (const settlement of settlements) {
    if (!inRange(settlement.settledAt, options)) continue;
    const delegateId = settlement.delegateId || '';
    if (options.delegateId && delegateId !== options.delegateId) continue;
    historicalSettledTotal += Number(settlement.previousCycleTotal || 0);
    if (delegateId && currentUnsettledByDelegate[delegateId] === undefined) currentUnsettledByDelegate[delegateId] = 0;
    const settledAt = asDate(settlement.settledAt);
    if (delegateId && settledAt && (!latestSettlementByDelegate[delegateId] || settledAt > latestSettlementByDelegate[delegateId])) {
      latestSettlementByDelegate[delegateId] = settledAt;
    }
  }

  for (const event of events) {
    if (!inRange(event.occurredAt, options)) continue;
    const payload = event.payload || {};
    if (options.delegateId && String(payload.delegateId || '') !== options.delegateId) continue;
    if (event.eventType === 'recharge_approved') {
      grossRechargeTotal += Number(payload.amount || 0);
    }
    if (event.eventType === 'commission_earned') {
      commissionTotal += Number(payload.commissionAmount || 0);
    }
    if (event.eventType === 'vehicle_refunded') {
      refundTotal += Number(payload.refundAmount || 0);
    }
    if (event.eventType === 'recharge_approved' && event.aggregateId) {
      const delegateId = String(payload.delegateId || '');
      if (delegateId) {
        const occurredAt = asDate(event.occurredAt);
        const cutoff = latestSettlementByDelegate[delegateId];
        if (!cutoff || (occurredAt && occurredAt > cutoff)) {
          currentUnsettledByDelegate[delegateId] = (currentUnsettledByDelegate[delegateId] || 0) + Number(payload.amount || 0);
        }
      }
    }
  }

  return {
    grossRechargeTotal: round(grossRechargeTotal),
    commissionTotal: round(commissionTotal),
    refundTotal: round(refundTotal),
    companyNetRevenue: round(grossRechargeTotal - commissionTotal - refundTotal),
    historicalSettledTotal: round(historicalSettledTotal),
    currentUnsettledByDelegate: Object.fromEntries(Object.entries(currentUnsettledByDelegate).map(([id, amount]) => [id, round(amount)]))
  };
}
