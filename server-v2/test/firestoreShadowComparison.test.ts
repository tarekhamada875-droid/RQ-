import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createShadowComparisonProvider, shadowComparisonInternals } from '../migration/firestoreShadowComparison.js';
import type { GarageSummary } from '../contracts/summary.js';
import type { Package } from '../contracts/entities.js';

const packageValue: Package = {
  id: 'monthly', name: 'Monthly', durationDays: 30, vehicleLimit: 40, priceMinor: 25000, active: true
};
const summaryValue: GarageSummary = {
  garageId: 'garage-1', dateKey: '2026-09-22', activeVehicleCount: 2, entriesToday: 5, exitsToday: 3,
  grossRevenueMinor: 12000, refundTotalMinor: 500, netRevenueMinor: 11500, projectionVersion: 1,
  asOf: '2026-09-22T12:00:00.000Z'
};

function provider(overrides: Partial<Parameters<typeof createShadowComparisonProvider>[0]['dependencies']> = {}) {
  const environment = parseEnvironment({ NODE_ENV: 'test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' });
  return createShadowComparisonProvider({
    dependencies: {
      readLegacyPackages: async () => [packageValue],
      readV2Packages: async () => [packageValue],
      readLegacySummary: async () => summaryValue,
      readV2Summary: async () => summaryValue,
      ...overrides
    },
    previewEnabled: environment.V2_PREVIEW_ENABLED,
    previewAuthEnabled: environment.V2_PREVIEW_AUTH_ENABLED,
    legacyFallbackAvailable: true
  });
}

describe('Firestore shadow comparison provider', () => {
  it('maps legacy package fields into the strict v2 contract', () => {
    expect(shadowComparisonInternals.legacyPackageToCanonical('monthly', {
      name: 'Monthly', vehiclesCount: 30, price: 250, dailyCapacity: 40, isActive: true
    })).toEqual(packageValue);
  });

  it('returns v2 for equal package reads', async () => {
    const result = await provider()({ endpoint: 'packages', requestId: 'req-packages' });
    expect(result.mode).toBe('v2');
    expect(result.reason).toBe('comparison_equal');
    expect(result.comparison?.equality).toBe(true);
  });

  it('keeps the legacy path on a package mismatch', async () => {
    const result = await provider({ readV2Packages: async () => [{ ...packageValue, priceMinor: 26000 }] })({ endpoint: 'packages', requestId: 'req-mismatch' });
    expect(result.mode).toBe('legacy');
    expect(result.reason).toBe('financial_mismatch');
    expect(result.comparison?.financialMismatchHard).toBe(true);
    expect(result.comparison?.mismatches[0]?.legacy).toBe('[REDACTED]');
    expect(result.comparison?.mismatches[0]?.v2).toBe('[REDACTED]');
  });

  it('compares a date-scoped garage summary', async () => {
    const result = await provider()({ endpoint: 'garage_summary', garageId: 'garage-1', date: '2026-09-22', requestId: 'req-summary' });
    expect(result.mode).toBe('v2');
    expect(result.comparison).toMatchObject({ endpoint: '/api/v2/garages/:garageId/summary', garageScope: 'garage-1', equality: true });
  });

  it('falls back to legacy when the v2 read fails', async () => {
    const result = await provider({ readV2Packages: async () => { throw new Error('v2 unavailable'); } })({ endpoint: 'packages', requestId: 'req-fallback' });
    expect(result.mode).toBe('legacy');
    expect(result.reason).toBe('v2_read_failed');
    expect(result.error).toBe('v2_read_failed');
  });

  it('blocks when the legacy read fails', async () => {
    const result = await provider({ readLegacySummary: async () => { throw new Error('legacy unavailable'); } })({ endpoint: 'garage_summary', garageId: 'garage-1', date: '2026-09-22', requestId: 'req-blocked' });
    expect(result.mode).toBe('blocked');
    expect(result.reason).toBe('legacy_read_failed');
    expect(result.error).toBe('legacy_read_failed');
  });
});
