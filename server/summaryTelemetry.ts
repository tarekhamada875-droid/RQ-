export type SummaryReadSource = 'live_projection_buckets' | 'stored_rebuild' | 'not_ready' | 'error';

interface SummaryTelemetryState {
  requests: number;
  successes: number;
  failures: number;
  liveProjectionReads: number;
  storedFallbackReads: number;
  notReadyReads: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

const state: SummaryTelemetryState = {
  requests: 0,
  successes: 0,
  failures: 0,
  liveProjectionReads: 0,
  storedFallbackReads: 0,
  notReadyReads: 0,
  totalDurationMs: 0,
  maxDurationMs: 0
};

export function recordSummaryRead(source: SummaryReadSource, durationMs: number, success: boolean): void {
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  state.requests += 1;
  state.successes += success ? 1 : 0;
  state.failures += success ? 0 : 1;
  state.totalDurationMs += duration;
  state.maxDurationMs = Math.max(state.maxDurationMs, duration);
  if (source === 'live_projection_buckets') state.liveProjectionReads += 1;
  if (source === 'stored_rebuild') state.storedFallbackReads += 1;
  if (source === 'not_ready') state.notReadyReads += 1;

  // No garage IDs, user IDs, plates, or payloads are logged. Sample only aggregate counters.
  if (state.requests % 100 === 0) {
    console.info('[SummaryTelemetry]', getSummaryTelemetrySnapshot());
  }
}

export function getSummaryTelemetrySnapshot() {
  return {
    requests: state.requests,
    successes: state.successes,
    failures: state.failures,
    liveProjectionReads: state.liveProjectionReads,
    storedFallbackReads: state.storedFallbackReads,
    notReadyReads: state.notReadyReads,
    averageDurationMs: state.requests ? Number((state.totalDurationMs / state.requests).toFixed(2)) : 0,
    maxDurationMs: Number(state.maxDurationMs.toFixed(2))
  };
}

export function resetSummaryTelemetry(): void {
  Object.assign(state, { requests: 0, successes: 0, failures: 0, liveProjectionReads: 0, storedFallbackReads: 0, notReadyReads: 0, totalDurationMs: 0, maxDurationMs: 0 });
}
