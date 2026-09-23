import { describe, expect, it, vi } from 'vitest';
import { createConsoleShadowComparisonTelemetrySink, InMemoryShadowComparisonTelemetry } from '../migration/shadowComparisonTelemetry.js';
import type { ShadowComparisonOutcome } from '../migration/shadowComparisonCoordinator.js';

const outcome = (value: unknown): ShadowComparisonOutcome => value as ShadowComparisonOutcome;

describe('shadow comparison telemetry', () => {
  it('records only bounded aggregate counters and costs', () => {
    const telemetry = new InMemoryShadowComparisonTelemetry();
    telemetry.record({ outcome: outcome({ mode: 'v2', reason: 'comparison_equal' }), latencyMs: 12.6, firestoreReads: 4.4 });
    telemetry.record({ outcome: outcome({ mode: 'legacy', reason: 'comparison_mismatch' }), latencyMs: -4, firestoreReads: 2 });
    telemetry.record({ outcome: outcome({ mode: 'legacy', reason: 'financial_mismatch' }), latencyMs: 20, firestoreReads: 3 });
    telemetry.record({ outcome: outcome({ mode: 'legacy', reason: 'authorization_mismatch' }), latencyMs: 8, firestoreReads: 2 });
    telemetry.record({ outcome: outcome({ mode: 'legacy', reason: 'v2_read_failed', error: 'v2_read_failed' }), latencyMs: 5, firestoreReads: 1 });
    telemetry.record({ outcome: outcome({ mode: 'blocked', reason: 'legacy_read_failed', error: 'legacy_read_failed' }), latencyMs: 7, firestoreReads: 0 });
    expect(telemetry.snapshot()).toEqual({
      comparisonsAttempted: 6,
      equalComparisons: 1,
      ordinaryMismatches: 1,
      financialMismatches: 1,
      authorizationMismatches: 1,
      v2ReadFailures: 1,
      legacyFallbacks: 4,
      blockedComparisons: 1,
      totalLatencyMs: 53,
      maxLatencyMs: 20,
      firestoreReads: 12
    });
  });

  it('returns defensive snapshots that cannot mutate internal counters', () => {
    const telemetry = new InMemoryShadowComparisonTelemetry();
    const snapshot = telemetry.snapshot() as { comparisonsAttempted: number };
    snapshot.comparisonsAttempted = 999;
    expect(telemetry.snapshot().comparisonsAttempted).toBe(0);
  });

  it('emits aggregate console records without outcome payloads or error text', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const telemetry = createConsoleShadowComparisonTelemetrySink();
      telemetry.record({
        outcome: outcome({ mode: 'blocked', reason: 'legacy_read_failed', error: 'legacy_read_failed', payload: 'customer-secret' }),
        latencyMs: 3,
        firestoreReads: 1
      });
      expect(info).toHaveBeenCalledOnce();
      expect(info.mock.calls[0]?.[0]).not.toContain('customer-secret');
      expect(info.mock.calls[0]?.[0]).not.toContain('legacy_read_failed');
      expect(info.mock.calls[0]?.[0]).toContain('blockedComparisons');
    } finally {
      info.mockRestore();
    }
  });
});
