import type { Firestore } from 'firebase-admin/firestore';
import { ProjectionEventSchema, ProjectionStateSchema, type ProjectionEvent, type ProjectionState } from '../contracts/projection.js';
import { applyProjectionEvent } from '../domain/projections.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

export interface ProjectionRepository {
  get(garageId: string, dateKey: string): Promise<ProjectionState | null>;
  applyEvent(event: ProjectionEvent, now: Date): Promise<ProjectionState>;
  rebuild(garageId: string, dateKey: string, events: ReadonlyArray<ProjectionEvent>, now: Date): Promise<ProjectionState>;
}

function projectionPath(garageId: string, dateKey: string): string {
  if (!garageId || garageId.length > 160) throw new Error('Garage ID is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Invalid projection date');
  return `garages/${garageId}/daily_stats/${dateKey}`;
}

function initialState(event: ProjectionEvent): ProjectionState {
  return ProjectionStateSchema.parse({
    garageId: event.garageId,
    dateKey: event.dateKey,
    activeVehicleCount: 0,
    entriesToday: 0,
    exitsToday: 0,
    grossRevenueMinor: 0,
    refundTotalMinor: 0,
    netRevenueMinor: 0,
    projectionVersion: 1,
    asOf: event.occurredAt,
    appliedEventIds: []
  });
}

const MAX_REBUILD_EVENTS = 10_000;

function emptyState(garageId: string, dateKey: string, now: Date): ProjectionState {
  return ProjectionStateSchema.parse({
    garageId, dateKey, activeVehicleCount: 0, entriesToday: 0, exitsToday: 0,
    grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0,
    projectionVersion: 1, asOf: now.toISOString(), appliedEventIds: []
  });
}

export class FirestoreProjectionRepository implements ProjectionRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async get(garageId: string, dateKey: string): Promise<ProjectionState | null> {
    const snapshot = await this.firestore.doc(projectionPath(garageId, dateKey)).get();
    this.costs.recordRead(snapshot.exists ? 1 : 0);
    return snapshot.exists ? ProjectionStateSchema.parse(snapshot.data()) : null;
  }

  async applyEvent(rawEvent: ProjectionEvent, now: Date): Promise<ProjectionState> {
    const event = ProjectionEventSchema.parse(rawEvent);
    const ref = this.firestore.doc(projectionPath(event.garageId, event.dateKey));
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      this.costs.recordRead(snapshot.exists ? 1 : 0);
      const current = snapshot.exists ? ProjectionStateSchema.parse(snapshot.data()) : initialState(event);
      const next = applyProjectionEvent(current, event, now);
      if (!snapshot.exists || next !== current) {
        transaction.set(ref, next);
        this.costs.recordWrite();
      }
      return next;
    });
  }

  async rebuild(garageId: string, dateKey: string, rawEvents: ReadonlyArray<ProjectionEvent>, now: Date): Promise<ProjectionState> {
    projectionPath(garageId, dateKey);
    if (Number.isNaN(now.getTime())) throw new Error('INVALID_DATE');
    if (rawEvents.length > MAX_REBUILD_EVENTS) throw new Error('PROJECTION_REBUILD_WINDOW_EXCEEDED');
    const events = rawEvents.map((rawEvent) => ProjectionEventSchema.parse(rawEvent));
    if (events.some((event) => event.garageId !== garageId || event.dateKey !== dateKey)) throw new Error('PROJECTION_SCOPE_MISMATCH');
    const ordered = [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    let rebuilt = emptyState(garageId, dateKey, now);
    for (const event of ordered) rebuilt = applyProjectionEvent(rebuilt, event, now);
    const ref = this.firestore.doc(projectionPath(garageId, dateKey));
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      this.costs.recordRead(snapshot.exists ? 1 : 0);
      transaction.set(ref, rebuilt);
      this.costs.recordWrite();
      return rebuilt;
    });
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
