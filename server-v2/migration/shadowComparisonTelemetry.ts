import type { ShadowComparisonOutcome } from './shadowComparisonCoordinator.js';

export type ShadowComparisonTelemetrySnapshot = Readonly<{
  comparisonsAttempted: number;
  equalComparisons: number;
  ordinaryMismatches: number;
  financialMismatches: number;
  authorizationMismatches: number;
  v2ReadFailures: number;
  legacyFallbacks: number;
  blockedComparisons: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  firestoreReads: number;
}>;

export type ShadowComparisonTelemetryEvent = Readonly<{
  outcome: ShadowComparisonOutcome;
  latencyMs: number;
  firestoreReads: number;
}>;

export type ShadowComparisonTelemetry = Readonly<{
  record(event: ShadowComparisonTelemetryEvent): void;
  snapshot(): ShadowComparisonTelemetrySnapshot;
}>;

const EMPTY_SNAPSHOT: ShadowComparisonTelemetrySnapshot = {
  comparisonsAttempted: 0,
  equalComparisons: 0,
  ordinaryMismatches: 0,
  financialMismatches: 0,
  authorizationMismatches: 0,
  v2ReadFailures: 0,
  legacyFallbacks: 0,
  blockedComparisons: 0,
  totalLatencyMs: 0,
  maxLatencyMs: 0,
  firestoreReads: 0
};

export class InMemoryShadowComparisonTelemetry implements ShadowComparisonTelemetry {
  private counts: ShadowComparisonTelemetrySnapshot = EMPTY_SNAPSHOT;

  record(event: ShadowComparisonTelemetryEvent): void {
    const latencyMs = Number.isFinite(event.latencyMs) ? Math.max(0, Math.round(event.latencyMs)) : 0;
    const firestoreReads = Number.isFinite(event.firestoreReads) ? Math.max(0, Math.round(event.firestoreReads)) : 0;
    const { outcome } = event;
    this.counts = {
      comparisonsAttempted: this.counts.comparisonsAttempted + 1,
      equalComparisons: this.counts.equalComparisons + (outcome.reason === 'comparison_equal' ? 1 : 0),
      ordinaryMismatches: this.counts.ordinaryMismatches + (outcome.reason === 'comparison_mismatch' ? 1 : 0),
      financialMismatches: this.counts.financialMismatches + (outcome.reason === 'financial_mismatch' ? 1 : 0),
      authorizationMismatches: this.counts.authorizationMismatches + (outcome.reason === 'authorization_mismatch' ? 1 : 0),
      v2ReadFailures: this.counts.v2ReadFailures + (outcome.reason === 'v2_read_failed' ? 1 : 0),
      legacyFallbacks: this.counts.legacyFallbacks + (outcome.mode === 'legacy' ? 1 : 0),
      blockedComparisons: this.counts.blockedComparisons + (outcome.mode === 'blocked' ? 1 : 0),
      totalLatencyMs: this.counts.totalLatencyMs + latencyMs,
      maxLatencyMs: Math.max(this.counts.maxLatencyMs, latencyMs),
      firestoreReads: this.counts.firestoreReads + firestoreReads
    };
  }

  snapshot(): ShadowComparisonTelemetrySnapshot {
    return { ...this.counts };
  }
}

export function createConsoleShadowComparisonTelemetrySink(component = 'rq-v2-shadow'): ShadowComparisonTelemetry {
  const telemetry = new InMemoryShadowComparisonTelemetry();
  return {
    record(event) {
      telemetry.record(event);
      console.info(JSON.stringify({ component, ...telemetry.snapshot() }));
    },
    snapshot: () => telemetry.snapshot()
  };
}
