import type { Firestore } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ProjectionEventSchema, ProjectionStateSchema, type ProjectionEvent, type ProjectionState } from '../contracts/projection.js';
import { ProjectionRebuildInputSchema, ProjectionRebuildResultSchema, type ProjectionRebuildInput, type ProjectionRebuildResult } from '../contracts/projectionRepair.js';
import { applyProjectionEvent } from '../domain/projections.js';
import { idempotencyFingerprint } from '../domain/operations.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

export interface ProjectionRepository {
  get(garageId: string, dateKey: string): Promise<ProjectionState | null>;
  applyEvent(event: ProjectionEvent, now: Date): Promise<ProjectionState>;
  rebuild(input: ProjectionRebuildInput): Promise<ProjectionRebuildResult>;
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

const StoredResultSchema = z.object({
  fingerprint: z.string().length(64),
  responseJson: z.string().max(30000),
  createdAt: z.unknown()
}).strict();

function operationKey(actorUid: string, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`projection.rebuild:${actorUid}:${idempotencyKey}`).digest('hex');
}

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

  async rebuild(rawInput: ProjectionRebuildInput): Promise<ProjectionRebuildResult> {
    const input = ProjectionRebuildInputSchema.parse(rawInput);
    const { garageId, dateKey, events: rawEvents } = input;
    projectionPath(garageId, dateKey);
    const now = new Date(input.occurredAt);
    if (rawEvents.length > MAX_REBUILD_EVENTS) throw new Error('PROJECTION_REBUILD_WINDOW_EXCEEDED');
    const events = rawEvents.map((rawEvent) => ProjectionEventSchema.parse(rawEvent));
    if (events.some((event) => event.garageId !== garageId || event.dateKey !== dateKey)) throw new Error('PROJECTION_SCOPE_MISMATCH');
    const ordered = [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    let rebuilt = emptyState(garageId, dateKey, now);
    for (const event of ordered) rebuilt = applyProjectionEvent(rebuilt, event, now);
    const ref = this.firestore.doc(projectionPath(garageId, dateKey));
    const fingerprint = idempotencyFingerprint('projection.rebuild', { garageId, dateKey, actorUid: input.actorUid, idempotencyKey: input.idempotencyKey, events });
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(input.actorUid, input.idempotencyKey));
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        const replay = ProjectionRebuildResultSchema.parse(JSON.parse(stored.responseJson));
        return ProjectionRebuildResultSchema.parse({ ...replay, replayed: true });
      }
      const snapshot = await transaction.get(ref);
      this.costs.recordRead(snapshot.exists ? 1 : 0);
      transaction.set(ref, rebuilt);
      const result = ProjectionRebuildResultSchema.parse({ projection: rebuilt, sourceEventCount: events.length, replayed: false });
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId, aggregateType: 'projection', aggregateId: `${garageId}:${dateKey}`,
        eventType: 'projection_rebuilt', actorUid: input.actorUid, occurredAt: now,
        idempotencyKey: input.idempotencyKey, payload: { sourceEventCount: events.length, projectionVersion: rebuilt.projectionVersion }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: now });
      this.costs.recordWrite(3);
      return result;
    });
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
