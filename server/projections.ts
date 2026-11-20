import { addMoney } from './money';

export interface ProjectionEvent {
  eventId?: string;
  occurredAt?: unknown;
  eventType?: string;
  payload?: Record<string, unknown>;
}

export interface DailyProjection {
  count: number;
  exitsCount: number;
  grossRevenue: number;
  refundRevenue: number;
  /** Audit (2026-11-21): subscriber renewal income (creditAmount on subscriber_renewed events). */
  renewalRevenue: number;
  netRevenue: number;
  revenue: number;
}

function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try {
      const date = value.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Returns the Africa/Cairo calendar date for a supported timestamp value. */
export function getCairoDateKey(value: unknown): string {
  const date = toValidDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

const CAIRO_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const CAIRO_BOUNDARY_SEARCH_RADIUS_MS = 36 * 60 * 60 * 1000;

function cairoDayStart(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('INVALID_DATE');
  const nominalUtc = new Date(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(nominalUtc.getTime()) || nominalUtc.toISOString().slice(0, 10) !== dateKey) {
    throw new Error('INVALID_DATE');
  }

  // Find the first instant whose Cairo-local calendar key is dateKey. This
  // respects seasonal offset changes and dates whose local midnight is skipped.
  let low = nominalUtc.getTime() - CAIRO_BOUNDARY_SEARCH_RADIUS_MS;
  let high = nominalUtc.getTime() + CAIRO_BOUNDARY_SEARCH_RADIUS_MS;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (getCairoDateKey(new Date(middle)) >= dateKey) high = middle;
    else low = middle + 1;
  }

  const boundary = new Date(low);
  if (getCairoDateKey(boundary) !== dateKey) throw new Error('INVALID_DATE');
  return boundary;
}

/** Returns the actual Africa/Cairo interval for a local YYYY-MM-DD business day. */
export function getCairoDayBounds(dateKey: string): { start: Date; end: Date } {
  const nominalUtc = new Date(`${dateKey}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isFinite(nominalUtc.getTime()) || nominalUtc.toISOString().slice(0, 10) !== dateKey) {
    throw new Error('INVALID_DATE');
  }
  const nextDateKey = new Date(nominalUtc.getTime() + CAIRO_DAY_MILLISECONDS).toISOString().slice(0, 10);
  return { start: cairoDayStart(dateKey), end: cairoDayStart(nextDateKey) };
}

/** Rebuilds one day's projection from events without mutating or accumulating prior state. */
export function calculateDailyProjection(events: readonly ProjectionEvent[], targetDate: string): DailyProjection {
  let count = 0;
  let exitsCount = 0;
  let grossRevenue = 0;
  let refundRevenue = 0;
  // Audit fix (2026-11-21): subscriber renewals are garage income too — the
  // subscriber pays their monthly fee in credits. Without counting them here,
  // rebuild-projections would overwrite daily_stats.revenue with a
  // renewal-free number while the garage doc and the maintained daily
  // summary include renewals — the copies disagree again after every rebuild.
  let renewalRevenue = 0;

  for (const event of events) {
    if (getCairoDateKey(event.occurredAt) !== targetDate) continue;
    if (event.eventType === 'vehicle_entered') count += 1;
    if (event.eventType === 'vehicle_exited') {
      exitsCount += 1;
      grossRevenue = addMoney(grossRevenue, event.payload?.cost);
    }
    if (event.eventType === 'vehicle_refunded') {
      refundRevenue = addMoney(refundRevenue, event.payload?.refundAmount);
    }
    if (event.eventType === 'subscriber_renewed') {
      renewalRevenue = addMoney(renewalRevenue, event.payload?.creditAmount ?? event.payload?.cost);
    }
  }

  const roundedGross = Number(grossRevenue.toFixed(2));
  const roundedRefund = Number(refundRevenue.toFixed(2));
  const roundedRenewal = Number(renewalRevenue.toFixed(2));
  const netRevenue = Number((roundedGross - roundedRefund + roundedRenewal).toFixed(2));
  return {
    count,
    exitsCount,
    grossRevenue: roundedGross,
    refundRevenue: roundedRefund,
    renewalRevenue: roundedRenewal,
    netRevenue,
    revenue: netRevenue
  };
}
