import { describe, expect, it } from 'vitest';
import { InMemoryShadowComparisonTelemetry } from '../migration/shadowComparisonTelemetry.js';
import type { ShadowComparisonOutcome } from '../migration/shadowComparisonCoordinator.js';

const outcome = (value: unknown): ShadowComparisonOutcome => value as ShadowComparisonOutcome;

describe('shadow comparison telemetry', () => {
  it('records only bounded aggregate counters and costs', () => {
    const telemetry = new InMemoryShadowComparisonTelemetry();
    telemetry.record({ outcome: outcome({ mode: 'v2', reason: 'comparison_equal' }), latencyMs: 12.6, firestoreReads: 4.4 });
    telemetry.record({ outcome: outcome({ mode: 'legacy', reason: 'comparison_mismatch' }), latencyMs: -4, firestoreReads: 2 });
    telemetry.record({ outcome: outcome({ mode: 'legacy', reason: 'financial_mismatch' }), latencyMs: 20, firestoreReads: 3 });
    telemetry.record({ outcome: outcome({ mode: 'legacy', reason: 'v2_read_failed', error: 'v2_read_failed' }), latencyMs: 5, firestoreReads: 1 });
    telemetry.record({ outcome: outcome({ mode: 'blocked', reason: 'legacy_read_failed', error: 'legacy_read_failed' }), latencyMs: 7, firestoreReads: 0 });
    expect(telemetry.snapshot()).toEqual({
      comparisonsAttempted: 5,
      equalComparisons: 1,
      ordinaryMismatches: 1,
      financialMismatches: 1,
      authorizationMismatches: 0,
      v2ReadFailures: 1,
      legacyFallbacks: 3,
      blockedComparisons: 1,
      totalLatencyMs: 45,
      maxLatencyMs: 20,
      firestoreReads: 10
    });
  });

  it('returns defensive snapshots that cannot mutate internal counters', () => {
    const telemetry = new InMemoryShadowComparisonTelemetry();
    const snapshot = telemetry.snapshot() as { comparisonsAttempted: number };
    snapshot.comparisonsAttempted = 999;
    expect(telemetry.snapshot().comparisonsAttempted).toBe(0);
  });
});
