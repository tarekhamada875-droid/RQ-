import { afterEach, describe, expect, it } from 'vitest';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import { GarageSummarySchema } from '../contracts/summary.js';
import { createTypedConverter } from '../repositories/firestore.js';
import { InMemoryGarageSummaryRepository } from '../repositories/garageSummary.js';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const summary = GarageSummarySchema.parse({
  garageId: 'garage-1', dateKey: '2026-09-20', activeVehicleCount: 3,
  entriesToday: 5, exitsToday: 2, grossRevenueMinor: 12000,
  refundTotalMinor: 500, netRevenueMinor: 11500, projectionVersion: 1,
  asOf: '2026-09-20T10:00:00.000Z'
});

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe('typed repository boundaries', () => {
  it('rejects malformed documents and round-trips valid documents', () => {
    const converter = createTypedConverter(GarageSummarySchema);
    const validSnapshot = { id: 'summary-1', exists: true, data: () => summary };
    expect(converter.fromSnapshot(validSnapshot)).toEqual(summary);
    expect(converter.toDocument(summary)).toEqual(summary);
    expect(() => converter.fromSnapshot({ id: 'bad', exists: true, data: () => ({}) })).toThrow();
    expect(() => converter.fromSnapshot({ id: 'missing', exists: false, data: () => summary })).toThrow('DOCUMENT_NOT_FOUND');
  });

  it('performs one bounded read for one garage and date', async () => {
    const repository = new InMemoryGarageSummaryRepository([summary]);
    await expect(repository.getSummary('garage-1', '2026-09-20')).resolves.toEqual(summary);
    await expect(repository.getSummary('garage-1', '2026-09-21')).resolves.toBeNull();
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 2, writes: 0, deletes: 0 });
  });

  it('serves the read-only summary endpoint only in non-production', async () => {
    const app = createV2App({
      environment: parseEnvironment({ NODE_ENV: 'test', V2_PORT: '8081' }),
      garageSummary: new InMemoryGarageSummaryRepository([summary])
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/summary?date=2026-09-20`);
    expect(response.status).toBe(200);
    expect((await response.json()) as { data: unknown }).toMatchObject({ data: summary });
  });
});
