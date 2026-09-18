export interface ProjectionEvent {
  eventId?: string;
  occurredAt?: string | Date;
  eventType?: string;
  payload?: Record<string, unknown>;
}

export interface DailyProjection {
  count: number;
  exitsCount: number;
  grossRevenue: number;
  refundRevenue: number;
  netRevenue: number;
  revenue: number;
}

function cairoDate(value: string | Date | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/** Rebuilds one day's projection from events without mutating or accumulating prior state. */
export function calculateDailyProjection(events: ProjectionEvent[], targetDate: string): DailyProjection {
  let count = 0;
  let exitsCount = 0;
  let grossRevenue = 0;
  let refundRevenue = 0;

  for (const event of events) {
    if (cairoDate(event.occurredAt) !== targetDate) continue;
    if (event.eventType === 'vehicle_entered') count += 1;
    if (event.eventType === 'vehicle_exited') {
      exitsCount += 1;
      grossRevenue += Number(event.payload?.cost || 0);
    }
    if (event.eventType === 'vehicle_refunded') {
      refundRevenue += Number(event.payload?.refundAmount || 0);
    }
  }

  const roundedGross = Number(grossRevenue.toFixed(2));
  const roundedRefund = Number(refundRevenue.toFixed(2));
  const netRevenue = Number((roundedGross - roundedRefund).toFixed(2));
  return {
    count,
    exitsCount,
    grossRevenue: roundedGross,
    refundRevenue: roundedRefund,
    netRevenue,
    revenue: netRevenue
  };
}
