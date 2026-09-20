import { ProjectionEventSchema, ProjectionStateSchema, type ProjectionEvent, type ProjectionState } from '../contracts/projection.js';

export type ProjectionReconciliation = Readonly<{
  consistent: boolean;
  differences: Readonly<{ activeVehicleCount: number; entriesToday: number; exitsToday: number; grossRevenueMinor: number; refundTotalMinor: number; netRevenueMinor: number }>;
  projectionLagMs: number;
}>;

export function applyProjectionEvent(state: ProjectionState, rawEvent: ProjectionEvent, now: Date): ProjectionState {
  const current = ProjectionStateSchema.parse(state);
  const event = ProjectionEventSchema.parse(rawEvent);
  if (current.garageId !== event.garageId || current.dateKey !== event.dateKey) throw new Error('PROJECTION_SCOPE_MISMATCH');
  if (Number.isNaN(now.getTime())) throw new Error('INVALID_DATE');
  if (current.appliedEventIds.includes(event.id)) return current;
  const amountMinor = event.amountMinor ?? 0;
  if ((event.type === 'revenue' || event.type === 'refund') && amountMinor <= 0) throw new Error('PROJECTION_AMOUNT_REQUIRED');
  let next = { ...current, appliedEventIds: [...current.appliedEventIds, event.id], asOf: current.asOf };
  if (event.type === 'entry') next = { ...next, activeVehicleCount: current.activeVehicleCount + 1, entriesToday: current.entriesToday + 1 };
  if (event.type === 'exit') {
    if (current.activeVehicleCount < 1) throw new Error('PROJECTION_ACTIVE_COUNT_NEGATIVE');
    next = { ...next, activeVehicleCount: current.activeVehicleCount - 1, exitsToday: current.exitsToday + 1 };
  }
  if (event.type === 'revenue') next = { ...next, grossRevenueMinor: current.grossRevenueMinor + amountMinor, netRevenueMinor: current.netRevenueMinor + amountMinor };
  if (event.type === 'refund') next = { ...next, refundTotalMinor: current.refundTotalMinor + amountMinor, netRevenueMinor: current.netRevenueMinor - amountMinor };
  const eventTime = Date.parse(event.occurredAt);
  const currentTime = Date.parse(current.asOf);
  return ProjectionStateSchema.parse({ ...next, asOf: new Date(Math.max(eventTime, currentTime)).toISOString() });
}

export function reconcileProjection(state: ProjectionState, authoritative: Readonly<{
  activeVehicleCount: number; entriesToday: number; exitsToday: number; grossRevenueMinor: number; refundTotalMinor: number; netRevenueMinor: number; asOf: Date;
}>, now: Date): ProjectionReconciliation {
  const current = ProjectionStateSchema.parse(state);
  if (Number.isNaN(authoritative.asOf.getTime()) || Number.isNaN(now.getTime())) throw new Error('INVALID_DATE');
  const differences = {
    activeVehicleCount: current.activeVehicleCount - authoritative.activeVehicleCount,
    entriesToday: current.entriesToday - authoritative.entriesToday,
    exitsToday: current.exitsToday - authoritative.exitsToday,
    grossRevenueMinor: current.grossRevenueMinor - authoritative.grossRevenueMinor,
    refundTotalMinor: current.refundTotalMinor - authoritative.refundTotalMinor,
    netRevenueMinor: current.netRevenueMinor - authoritative.netRevenueMinor
  };
  return { differences, consistent: Object.values(differences).every((value) => value === 0), projectionLagMs: Math.max(0, now.getTime() - Date.parse(current.asOf)) };
}
