import { describe, expect, it } from 'vitest';
import { runV2ReadContractSmoke } from '../api/v2ReadSmoke';

const client = {
  packageCatalog: async () => [],
  garageSummary: async () => ({ garageId: 'preview-garage', dateKey: '2026-09-20', activeVehicleCount: 0, entriesToday: 0, exitsToday: 0, grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0, projectionVersion: 1, asOf: '2026-09-20T10:00:00.000Z' }),
  pendingQueue: async () => ({ items: [], projectionVersion: 1 }),
  recentActivity: async () => ({ items: [], projectionVersion: 1 })
};

describe('v2 read contract smoke harness', () => {
  it('reports all four read contracts as passed', async () => {
    const result = await runV2ReadContractSmoke(client);
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('reports a bounded sanitized error without exposing response payloads', async () => {
    const failing = { ...client, pendingQueue: async () => { throw new Error('backend response contained secret-token-value'); } };
    const result = await runV2ReadContractSmoke(failing);
    const pending = result.checks.find((check) => check.feature === 'pendingQueue');
    expect(result.passed).toBe(false);
    expect(pending).toMatchObject({ passed: false, error: 'backend response contained secret=[redacted]' });
  });
});
