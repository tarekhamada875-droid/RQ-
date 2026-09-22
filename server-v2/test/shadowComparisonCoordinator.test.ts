import { describe, expect, it, vi } from 'vitest';
import { runShadowComparison } from '../migration/shadowComparisonCoordinator.js';

const input = {
  comparison: { endpoint: '/api/v2/packages', requestId: 'req-1', dataVersion: 1 },
  previewEnabled: true,
  previewAuthEnabled: true,
  legacyFallbackAvailable: true
};

const read = (value: ReadonlyArray<unknown>) => async () => value;

describe('shadow comparison coordinator', () => {
  it('runs both reads and permits v2 only on equality', async () => {
    const legacy = vi.fn(read([{ id: 'a', name: 'A' }]));
    const v2 = vi.fn(read([{ id: 'a', name: 'A' }]));
    const result = await runShadowComparison({ ...input, readLegacy: legacy, readV2: v2 });
    expect(result).toMatchObject({ mode: 'v2', reason: 'comparison_equal', comparison: { equality: true } });
    expect(legacy).toHaveBeenCalledOnce();
    expect(v2).toHaveBeenCalledOnce();
  });

  it('keeps legacy for normalized mismatches and hard mismatches', async () => {
    const result = await runShadowComparison({ ...input, readLegacy: read([{ id: 'a', amount: 1 }]), readV2: read([{ id: 'a', amount: 2 }]) });
    expect(result).toMatchObject({ mode: 'legacy', reason: 'financial_mismatch', comparison: { financialMismatchHard: true } });
  });

  it('falls back to legacy if v2 fails and blocks if legacy fails', async () => {
    const v2Failure = await runShadowComparison({ ...input, readLegacy: read([{ id: 'a' }]), readV2: async () => { throw new Error('v2 unavailable'); } });
    expect(v2Failure).toMatchObject({ mode: 'legacy', reason: 'v2_read_failed', error: 'v2_read_failed' });
    const legacyFailure = await runShadowComparison({ ...input, readLegacy: async () => { throw new Error('legacy unavailable'); }, readV2: read([{ id: 'a' }]) });
    expect(legacyFailure).toMatchObject({ mode: 'blocked', reason: 'legacy_read_failed', error: 'legacy_read_failed' });
  });

  it('fails closed when preview is disabled', async () => {
    const result = await runShadowComparison({ ...input, previewEnabled: false, readLegacy: read([{ id: 'a' }]), readV2: read([{ id: 'a' }]) });
    expect(result).toMatchObject({ mode: 'legacy', reason: 'preview_disabled' });
  });
});
