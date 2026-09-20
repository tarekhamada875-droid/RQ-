import { describe, expect, it, vi } from 'vitest';
import { createReadFeatureAdapter, createV2ReadClient, parseV2ReadFlags, V2ReadAdapterError, type ReadPage } from '../api/v2ReadAdapter';
import type { ActivityRecord, PendingQueueItem } from '../../server-v2/contracts/readModels';
import type { GarageSummary } from '../../server-v2/contracts/summary';
import type { Package } from '../../server-v2/contracts/entities';

const flags = { packageCatalog: true, garageSummary: false, pendingQueue: true, recentActivity: false } as const;
const pkg: Package = { id: 'pkg-1', name: 'Daily', durationDays: 1, vehicleLimit: 50, priceMinor: 1000, active: true };
const summary: GarageSummary = { garageId: 'garage-1', dateKey: '2026-09-20', activeVehicleCount: 1, entriesToday: 2, exitsToday: 1, grossRevenueMinor: 1000, refundTotalMinor: 0, netRevenueMinor: 1000, projectionVersion: 1, asOf: '2026-09-20T10:00:00.000Z' };
const pending: PendingQueueItem = { id: 'pending-1', garageId: 'garage-1', kind: 'approval', priority: 1, createdAt: '2026-09-20T10:00:00.000Z', status: 'pending' };
const activity: ActivityRecord = { id: 'activity-1', garageId: 'garage-1', type: 'entry', occurredAt: '2026-09-20T10:00:00.000Z', resultCode: 'OK', projectionVersion: 1 };

describe('Cloudflare v2 read adapter', () => {
  it('keeps all v2 flags disabled unless explicitly set to true', () => {
    expect(parseV2ReadFlags({})).toEqual({ packageCatalog: false, garageSummary: false, pendingQueue: false, recentActivity: false });
    expect(parseV2ReadFlags({ VITE_V2_READ_PACKAGE_CATALOG: 'TRUE', VITE_V2_READ_GARAGE_SUMMARY: 'false' })).toMatchObject({ packageCatalog: true, garageSummary: false });
  });

  it('validates typed package, summary, and bounded-page responses', async () => {
    const transport = vi.fn(async (endpoint: string): Promise<unknown> => endpoint.includes('/packages') ? { data: [pkg] } : endpoint.includes('/summary') ? { data: summary } : endpoint.includes('/pending') ? { data: { items: [pending], projectionVersion: 1 } } : { data: { items: [activity], projectionVersion: 1 } });
    const client = createV2ReadClient(transport);
    expect(await client.packageCatalog()).toEqual([pkg]);
    expect(await client.garageSummary('garage-1', '2026-09-20')).toEqual(summary);
    expect((await client.pendingQueue(10)).items).toEqual([pending]);
    expect((await client.recentActivity(10)).items).toEqual([activity]);
    expect(transport.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      '/api/v2/packages',
      '/api/v2/garages/garage-1/summary?date=2026-09-20',
      '/api/v2/pending?limit=10',
      '/api/v2/activity?limit=10'
    ]);
  });

  it('maps invalid v2 responses to a typed adapter error', async () => {
    const client = createV2ReadClient(async () => ({ data: [{ id: 'bad' }] }));
    await expect(client.packageCatalog()).rejects.toBeInstanceOf(V2ReadAdapterError);
  });

  it('routes each read feature independently, with legacy as the safe default', async () => {
    const legacy = { packageCatalog: vi.fn(async () => [pkg]), garageSummary: vi.fn(async () => summary), pendingQueue: vi.fn(async (): Promise<ReadPage<PendingQueueItem>> => ({ items: [], projectionVersion: 1 })), recentActivity: vi.fn(async (): Promise<ReadPage<ActivityRecord>> => ({ items: [], projectionVersion: 1 })) };
    const v2 = { packageCatalog: vi.fn(async () => [pkg]), garageSummary: vi.fn(async () => summary), pendingQueue: vi.fn(async (): Promise<ReadPage<PendingQueueItem>> => ({ items: [pending], projectionVersion: 1 })), recentActivity: vi.fn(async (): Promise<ReadPage<ActivityRecord>> => ({ items: [activity], projectionVersion: 1 })) };
    const adapter = createReadFeatureAdapter(flags, v2, legacy);
    expect(await adapter.packageCatalog()).toEqual([pkg]);
    expect((await adapter.pendingQueue(10)).items).toEqual([pending]);
    expect(await adapter.garageSummary('garage-1', '2026-09-20')).toEqual(summary);
    expect((await adapter.recentActivity(10)).items).toEqual([]);
    expect(v2.packageCatalog).toHaveBeenCalled();
    expect(legacy.garageSummary).toHaveBeenCalled();
  });
});
