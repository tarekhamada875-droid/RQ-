import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  ActivityRecordSchema,
  LegacyActivityLogSchema,
  LegacyPendingRequestSchema,
  PendingQueueItemSchema,
  type ActivityRecord,
  type PendingQueueItem,
  type ReadModelPage
} from '../contracts/readModels.js';
import { decodeCursor, encodeCursor } from '../domain/pagination.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';
import { listPendingQueue, listRecentActivity } from '../domain/readModels.js';

const MAX_PAGE_SIZE = 100;
const PROJECTION_VERSION = 1;

type ReadModelQuery = Readonly<{
  list(limit: number, cursor?: string, garageId?: string): Promise<ReadModelPage<PendingQueueItem | ActivityRecord>>;
  getCostSnapshot(): ReadCost;
}>;

export interface PendingQueueRepository {
  listPending(limit: number, cursor?: string): Promise<ReadModelPage<PendingQueueItem>>;
  getCostSnapshot(): ReadCost;
}

export interface ActivityRepository {
  listRecent(limit: number, cursor?: string, garageId?: string): Promise<ReadModelPage<ActivityRecord>>;
  getCostSnapshot(): ReadCost;
}

function validatePageSize(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new Error('PAGE_SIZE_OUT_OF_RANGE');
  return limit;
}

function toDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = Reflect.get(value, 'toDate');
    if (typeof toDate === 'function') {
      const date = toDate.call(value);
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    }
  }
  throw new Error('READ_MODEL_TIMESTAMP_INVALID');
}

function toIso(value: unknown): string {
  return toDate(value).toISOString();
}

function pendingKind(value: string | undefined): PendingQueueItem['kind'] {
  if (value === 'approval') return 'approval';
  if (value === 'repair') return 'repair';
  return 'recharge';
}

function mapPending(id: string, raw: unknown): PendingQueueItem {
  const value = LegacyPendingRequestSchema.parse(raw);
  return PendingQueueItemSchema.parse({
    id,
    garageId: value.garageId,
    kind: pendingKind(value.kind ?? value.requestType),
    priority: value.priority ?? 0,
    createdAt: toIso(value.createdAt),
    status: 'pending'
  });
}

function mapActivity(id: string, raw: unknown): ActivityRecord {
  const value = LegacyActivityLogSchema.parse(raw);
  const occurredAt = value.timestamp ?? value.occurredAt ?? value.createdAt;
  return ActivityRecordSchema.parse({
    id,
    garageId: value.garageId,
    type: value.actionType ?? value.type ?? 'unknown',
    occurredAt: toIso(occurredAt),
    resultCode: value.resultCode ?? value.status ?? 'OK',
    projectionVersion: PROJECTION_VERSION
  });
}

function cursorDate(cursor: string | undefined): { date?: Date; id?: string } {
  if (!cursor) return {};
  const decoded = decodeCursor(cursor);
  return { date: toDate(decoded.sortValue), id: decoded.id };
}

function nextCursor<T extends { id: string }>(items: ReadonlyArray<T>, sortValue: (item: T) => string, hasMore: boolean): string | undefined {
  const last = items.at(-1);
  return hasMore && last ? encodeCursor(sortValue(last), last.id) : undefined;
}

export class FirestorePendingQueueRepository implements PendingQueueRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async listPending(limit: number, cursor?: string): Promise<ReadModelPage<PendingQueueItem>> {
    const pageSize = validatePageSize(limit);
    const decoded = cursorDate(cursor);
    let query: Query = this.firestore.collection('recharge_requests')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');
    if (decoded.date && decoded.id) query = query.startAfter(decoded.date, decoded.id);
    const snapshot = await query.limit(pageSize + 1).get();
    this.costs.recordRead(snapshot.size);
    const items = snapshot.docs.slice(0, pageSize).map((document) => mapPending(document.id, document.data()));
    const cursorValue = nextCursor(items, (item) => item.createdAt, snapshot.size > pageSize);
    return {
      items,
      ...(cursorValue ? { nextCursor: cursorValue } : {}),
      projectionVersion: PROJECTION_VERSION,
      readCount: snapshot.size
    };
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}

export class FirestoreActivityRepository implements ActivityRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async listRecent(limit: number, cursor?: string, garageId?: string): Promise<ReadModelPage<ActivityRecord>> {
    const pageSize = validatePageSize(limit);
    const decoded = cursorDate(cursor);
    let query: Query = this.firestore.collection('activity_logs');
    if (garageId) query = query.where('garageId', '==', z.string().min(1).max(160).parse(garageId));
    query = query.orderBy('timestamp', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (decoded.date && decoded.id) query = query.startAfter(decoded.date, decoded.id);
    const snapshot = await query.limit(pageSize + 1).get();
    this.costs.recordRead(snapshot.size);
    const items = snapshot.docs.slice(0, pageSize).map((document) => mapActivity(document.id, document.data()));
    const cursorValue = nextCursor(items, (item) => item.occurredAt, snapshot.size > pageSize);
    return {
      items,
      ...(cursorValue ? { nextCursor: cursorValue } : {}),
      projectionVersion: PROJECTION_VERSION,
      readCount: snapshot.size
    };
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}

export class InMemoryPendingQueueRepository implements PendingQueueRepository {
  constructor(private readonly items: ReadonlyArray<PendingQueueItem>) {
    items.forEach((item) => PendingQueueItemSchema.parse(item));
  }

  async listPending(limit: number, cursor?: string): Promise<ReadModelPage<PendingQueueItem>> {
    return listPendingQueue(this.items, limit, cursor);
  }

  getCostSnapshot(): ReadCost { return { reads: 0, writes: 0, deletes: 0, transactionAttempts: 0 }; }
}

export class InMemoryActivityRepository implements ActivityRepository {
  constructor(private readonly items: ReadonlyArray<ActivityRecord>) {
    items.forEach((item) => ActivityRecordSchema.parse(item));
  }

  async listRecent(limit: number, cursor?: string, garageId?: string): Promise<ReadModelPage<ActivityRecord>> {
    const scoped = garageId ? this.items.filter((item) => item.garageId === garageId) : this.items;
    return listRecentActivity(scoped, limit, cursor);
  }

  getCostSnapshot(): ReadCost { return { reads: 0, writes: 0, deletes: 0, transactionAttempts: 0 }; }
}

export type { ReadModelQuery };
