import { apiFetch } from './apiClient';
import { ActivityRecordSchema, type ActivityRecord } from '../../server-v2/contracts/readModels';
import { GarageSummarySchema, type GarageSummary } from '../../server-v2/contracts/summary';
import { PackageSchema, type Package } from '../../server-v2/contracts/entities';
import { PendingQueueItemSchema, type PendingQueueItem } from '../../server-v2/contracts/readModels';
import { V2_EXTERNAL_PREFIX } from '../../server-v2/http/prefix';

export type V2ReadFeature = 'packageCatalog' | 'garageSummary' | 'pendingQueue' | 'recentActivity';
export type V2ReadFlags = Readonly<Record<V2ReadFeature, boolean>>;
export type ReadPage<T> = Readonly<{ items: ReadonlyArray<T>; nextCursor?: string; projectionVersion: number }>;
export type V2ReadTransport = (endpoint: string) => Promise<unknown>;

export interface ReadFeatureClient {
  packageCatalog: () => Promise<ReadonlyArray<Package>>;
  garageSummary: (garageId: string, dateKey: string) => Promise<GarageSummary>;
  pendingQueue: (limit: number, cursor?: string) => Promise<ReadPage<PendingQueueItem>>;
  recentActivity: (limit: number, cursor?: string) => Promise<ReadPage<ActivityRecord>>;
}

export class V2ReadAdapterError extends Error {
  readonly code = 'V2_READ_RESPONSE_INVALID';
  constructor(readonly endpoint: string, cause: unknown) { super(`Invalid v2 read response for ${endpoint}`, { cause }); }
}

function parse<T>(endpoint: string, input: unknown, parser: (value: unknown) => T): T {
  try { return parser(input); } catch (error) { throw new V2ReadAdapterError(endpoint, error); }
}

function pageData(value: unknown): { items: ReadonlyArray<unknown>; nextCursor?: unknown; projectionVersion: unknown } {
  const envelope = value !== null && typeof value === 'object' ? value as { data?: unknown } : {};
  const candidate = envelope.data ?? value;
  if (candidate === null || typeof candidate !== 'object') throw new Error('EXPECTED_PAGE');
  const record = candidate as { items?: unknown; nextCursor?: unknown; projectionVersion?: unknown };
  if (!Array.isArray(record.items) || typeof record.projectionVersion !== 'number') throw new Error('EXPECTED_PAGE');
  return { items: record.items, ...(record.nextCursor !== undefined ? { nextCursor: record.nextCursor } : {}), projectionVersion: record.projectionVersion };
}

export function createV2ReadClient(transport: V2ReadTransport): ReadFeatureClient {
  return {
    async packageCatalog(): Promise<ReadonlyArray<Package>> {
      const endpoint = `${V2_EXTERNAL_PREFIX}/packages`;
      return parse(endpoint, await transport(endpoint), (value) => {
        const envelope = value !== null && typeof value === 'object' ? value as { data?: unknown } : {};
        const data = envelope.data ?? value;
        if (!Array.isArray(data)) throw new Error('EXPECTED_ARRAY');
        return data.map((item) => PackageSchema.parse(item));
      });
    },
    async garageSummary(garageId: string, dateKey: string): Promise<GarageSummary> {
      const endpoint = `${V2_EXTERNAL_PREFIX}/garages/${encodeURIComponent(garageId)}/summary?date=${encodeURIComponent(dateKey)}`;
      return parse(endpoint, await transport(endpoint), (value) => {
        const envelope = value !== null && typeof value === 'object' ? value as { data?: unknown } : {};
        return GarageSummarySchema.parse(envelope.data ?? value);
      });
    },
    async pendingQueue(limit: number, cursor?: string): Promise<ReadPage<PendingQueueItem>> {
      const endpoint = `${V2_EXTERNAL_PREFIX}/pending?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      return parse(endpoint, await transport(endpoint), (value) => { const data = pageData(value); return { items: data.items.map((item) => PendingQueueItemSchema.parse(item)), ...(typeof data.nextCursor === 'string' ? { nextCursor: data.nextCursor } : {}), projectionVersion: data.projectionVersion as number }; });
    },
    async recentActivity(limit: number, cursor?: string): Promise<ReadPage<ActivityRecord>> {
      const endpoint = `${V2_EXTERNAL_PREFIX}/activity?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      return parse(endpoint, await transport(endpoint), (value) => { const data = pageData(value); return { items: data.items.map((item) => ActivityRecordSchema.parse(item)), ...(typeof data.nextCursor === 'string' ? { nextCursor: data.nextCursor } : {}), projectionVersion: data.projectionVersion as number }; });
    }
  };
}

export function createAuthenticatedV2ReadClient(): ReadFeatureClient {
  return createV2ReadClient((endpoint) => apiFetch<unknown>(endpoint));
}

export function parseV2ReadFlags(env: Readonly<Record<string, string | undefined>>): V2ReadFlags {
  const enabled = (key: string): boolean => env[key]?.trim().toLowerCase() === 'true';
  return { packageCatalog: enabled('VITE_V2_READ_PACKAGE_CATALOG'), garageSummary: enabled('VITE_V2_READ_GARAGE_SUMMARY'), pendingQueue: enabled('VITE_V2_READ_PENDING_QUEUE'), recentActivity: enabled('VITE_V2_READ_RECENT_ACTIVITY') };
}

export function getV2ReadFlags(): V2ReadFlags {
  return parseV2ReadFlags(import.meta.env);
}

export function createReadFeatureAdapter(flags: V2ReadFlags, v2: ReadFeatureClient, legacy: ReadFeatureClient): ReadFeatureClient {
  return {
    packageCatalog: () => flags.packageCatalog ? v2.packageCatalog() : legacy.packageCatalog(),
    garageSummary: (garageId, dateKey) => flags.garageSummary ? v2.garageSummary(garageId, dateKey) : legacy.garageSummary(garageId, dateKey),
    pendingQueue: (limit, cursor) => flags.pendingQueue ? v2.pendingQueue(limit, cursor) : legacy.pendingQueue(limit, cursor),
    recentActivity: (limit, cursor) => flags.recentActivity ? v2.recentActivity(limit, cursor) : legacy.recentActivity(limit, cursor)
  };
}
