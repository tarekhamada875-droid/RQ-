import { ActivityRecordSchema, PendingQueueItemSchema, type ActivityRecord, type PendingQueueItem } from '../contracts/readModels.js';
import { decodeCursor, encodeCursor } from './pagination.js';

const MAX_PAGE_SIZE = 100;
type Page<T> = Readonly<{ items: ReadonlyArray<T>; nextCursor?: string; readCount: number; projectionVersion: number }>;

function pageSize(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new Error('PAGE_SIZE_OUT_OF_RANGE');
  return limit;
}

export function listPendingQueue(rawItems: ReadonlyArray<PendingQueueItem>, limit: number, cursor?: string): Page<PendingQueueItem> {
  const size = pageSize(limit);
  const items = rawItems.map((item) => PendingQueueItemSchema.parse(item)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  const filtered = decoded ? items.filter((item) => item.createdAt > decoded.sortValue || (item.createdAt === decoded.sortValue && item.id > decoded.id)) : items;
  const selected = filtered.slice(0, size);
  const last = selected.at(-1);
  const next = filtered.length > size && last ? encodeCursor(last.createdAt, last.id) : undefined;
  return { items: selected, ...(next ? { nextCursor: next } : {}), readCount: selected.length, projectionVersion: 1 };
}

export function listRecentActivity(rawItems: ReadonlyArray<ActivityRecord>, limit: number, cursor?: string): Page<ActivityRecord> {
  const size = pageSize(limit);
  const items = rawItems.map((item) => ActivityRecordSchema.parse(item)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  const filtered = decoded ? items.filter((item) => item.occurredAt < decoded.sortValue || (item.occurredAt === decoded.sortValue && item.id < decoded.id)) : items;
  const selected = filtered.slice(0, size);
  const last = selected.at(-1);
  const next = filtered.length > size && last ? encodeCursor(last.occurredAt, last.id) : undefined;
  return { items: selected, ...(next ? { nextCursor: next } : {}), readCount: selected.length, projectionVersion: 1 };
}
