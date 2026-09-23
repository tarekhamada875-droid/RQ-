import { afterEach, describe, expect, it } from 'vitest';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import { PackageSchema } from '../contracts/entities.js';
import { DateKeySchema } from '../contracts/summary.js';
import { businessDateKey, idempotencyFingerprint } from '../domain/operations.js';
import { addMinorUnits, formatMinorUnits, parseMinorUnits } from '../domain/money.js';
import { decodeCursor, encodeCursor } from '../domain/pagination.js';
import { InMemoryPackageCatalogRepository } from '../repositories/packageCatalog.js';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const packageData = PackageSchema.parse({
  id: 'weekly', name: 'Weekly', durationDays: 7, vehicleLimit: 100, priceMinor: 12500, active: true
});

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe('v2 foundation', () => {
  it('rejects production configuration without a Firebase project', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow('FIREBASE_PROJECT_ID');
  });

  it('keeps the Railway v2 preview gates closed by default', () => {
    const environment = parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-preview-test' });
    expect(environment.V2_PREVIEW_ENABLED).toBe(false);
    expect(environment.V2_PREVIEW_AUTH_ENABLED).toBe(false);
  });

  it('uses integer money and deterministic operational primitives', () => {
    expect(parseMinorUnits('125.00')).toBe(12500);
    expect(formatMinorUnits(addMinorUnits(100, 25))).toBe('1.25');
    expect(businessDateKey(new Date('2026-09-20T00:30:00.000Z'), 'Africa/Cairo')).toBe('2026-09-20');
    expect(idempotencyFingerprint('catalog', { b: 2, a: 1 })).toBe(idempotencyFingerprint('catalog', { a: 1, b: 2 }));
    expect(decodeCursor(encodeCursor('2026-09-20T00:00:00.000Z', 'weekly')).id).toBe('weekly');
  });

  it('accepts real date keys and rejects impossible calendar dates', () => {
    expect(DateKeySchema.safeParse('2026-02-28').success).toBe(true);
    expect(DateKeySchema.safeParse('2026-02-29').success).toBe(false);
    expect(DateKeySchema.safeParse('2026-99-99').success).toBe(false);
  });

  it('counts one bounded read for the package catalog', async () => {
    const repository = new InMemoryPackageCatalogRepository([packageData]);
    await expect(repository.listActive(25)).resolves.toEqual([packageData]);
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 1, writes: 0, deletes: 0 });
  });

  it('serves health and non-production package catalog responses', async () => {
    const app = createV2App({
      environment: parseEnvironment({ NODE_ENV: 'test', V2_PORT: '8081' }),
      packageCatalog: new InMemoryPackageCatalogRepository([packageData])
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/v2/health`);
    expect(health.status).toBe(200);
    expect((await health.json()) as { success: boolean }).toMatchObject({ success: true });

    const catalog = await fetch(`${baseUrl}/v2/packages?limit=1`);
    expect(catalog.status).toBe(200);
    expect((await catalog.json()) as { data: { items: unknown[] } }).toMatchObject({ data: { items: [packageData] } });
  });
});
