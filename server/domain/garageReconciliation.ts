export type ReconciliationEvent = Readonly<{
  occurredAt?: unknown;
  eventType?: unknown;
  payload?: Readonly<Record<string, unknown>> | null;
}>;

export type ReconciliationGarageState = Readonly<{
  carsInside?: unknown;
  lastTransactionDate?: unknown;
  todayCount?: unknown;
  todayRevenue?: unknown;
}>;

export type ReconciliationDailyStats = Readonly<{
  count?: unknown;
  revenue?: unknown;
  exitsCount?: unknown;
}>;

export type GarageReconciliationResult = Readonly<{
  expected: Readonly<{ carsInside: number; todayCount: number; todayRevenue: number }>;
  actual: Readonly<{ carsInside: number; todayCount: number; todayRevenue: number }>;
  eventLedgerSummary: Readonly<{
    totalRecordedEvents: number;
    todayEnters: number;
    todayExits: number;
    todayRefunds: number;
    eventGrossRevenue: number;
    eventRefundRevenue: number;
    eventDerivedRevenue: number;
  }>;
  differences: Readonly<Record<'carsInside' | 'todayCount' | 'todayRevenue', number>>;
  eventLedgerDifferences: Readonly<Record<'todayCount' | 'todayExits' | 'todayRevenue', number>>;
  operationalStateConsistent: boolean;
  dailyStatsConsistent: boolean;
  eventLedgerConsistent: boolean;
  overallConsistent: boolean;
  isConsistent: boolean;
}>;

function asNumber(value: unknown): number {
  return Number(value || 0);
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

/** Reconciles current garage state, daily stats, and immutable vehicle events without I/O. */
export function reconcileGarageState(input: Readonly<{
  today: string;
  insideVehicleCount: number;
  garage: ReconciliationGarageState;
  dailyStats: ReconciliationDailyStats;
  events: readonly ReconciliationEvent[];
}>): GarageReconciliationResult {
  let eventDerivedRevenue = 0;
  let eventGrossRevenue = 0;
  let eventRefundRevenue = 0;
  let todayEnters = 0;
  let todayExits = 0;
  let todayRefunds = 0;

  for (const event of input.events) {
    if (!event.occurredAt) continue;
    if (event.eventType === 'vehicle_entered') todayEnters += 1;
    if (event.eventType === 'vehicle_exited') {
      todayExits += 1;
      const cost = asNumber(event.payload?.cost);
      eventGrossRevenue += cost;
      eventDerivedRevenue += cost;
    }
    if (event.eventType === 'vehicle_refunded') {
      todayRefunds += 1;
      const refund = asNumber(event.payload?.refundAmount);
      eventRefundRevenue += refund;
      eventDerivedRevenue -= refund;
    }
  }

  const expected = {
    carsInside: input.insideVehicleCount,
    todayCount: asNumber(input.dailyStats.count),
    todayRevenue: asNumber(input.dailyStats.revenue)
  };
  const isTodayGarageState = input.garage.lastTransactionDate === input.today;
  const actual = {
    carsInside: asNumber(input.garage.carsInside),
    todayCount: isTodayGarageState ? asNumber(input.garage.todayCount) : 0,
    todayRevenue: isTodayGarageState ? asNumber(input.garage.todayRevenue) : 0
  };
  const eventLedgerSummary = {
    totalRecordedEvents: input.events.length,
    todayEnters,
    todayExits,
    todayRefunds,
    eventGrossRevenue: roundCurrency(eventGrossRevenue),
    eventRefundRevenue: roundCurrency(eventRefundRevenue),
    eventDerivedRevenue: roundCurrency(eventDerivedRevenue)
  };
  const differences = {
    carsInside: expected.carsInside - actual.carsInside,
    todayCount: expected.todayCount - actual.todayCount,
    todayRevenue: expected.todayRevenue - actual.todayRevenue
  };
  const eventLedgerDifferences = {
    todayCount: expected.todayCount - todayEnters,
    todayExits: asNumber(input.dailyStats.exitsCount) - todayExits,
    todayRevenue: expected.todayRevenue - roundCurrency(eventDerivedRevenue)
  };
  const operationalStateConsistent = differences.carsInside === 0;
  const dailyStatsConsistent = differences.todayCount === 0 && differences.todayRevenue === 0;
  const eventLedgerConsistent = Object.values(eventLedgerDifferences).every(value => value === 0);
  const overallConsistent = operationalStateConsistent && dailyStatsConsistent && eventLedgerConsistent;

  return {
    expected,
    actual,
    eventLedgerSummary,
    differences,
    eventLedgerDifferences,
    operationalStateConsistent,
    dailyStatsConsistent,
    eventLedgerConsistent,
    overallConsistent,
    isConsistent: overallConsistent
  };
}
