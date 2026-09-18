import { afterEach, describe, expect, it } from 'vitest';
import { getSummaryTelemetrySnapshot, recordSummaryRead, resetSummaryTelemetry } from './summaryTelemetry';

afterEach(() => resetSummaryTelemetry());

describe('summary telemetry', () => {
  it('records source counts and bounded timing aggregates without request identity', () => {
    recordSummaryRead('live_projection_buckets', 12.345, true);
    recordSummaryRead('stored_rebuild', 7, true);
    recordSummaryRead('not_ready', 3, false);
    expect(getSummaryTelemetrySnapshot()).toEqual({
      requests: 3,
      successes: 2,
      failures: 1,
      liveProjectionReads: 1,
      storedFallbackReads: 1,
      notReadyReads: 1,
      averageDurationMs: 7.45,
      maxDurationMs: 12.35
    });
    expect(JSON.stringify(getSummaryTelemetrySnapshot())).not.toMatch(/garage|user|plate|uid/i);
  });

  it('normalizes invalid durations to zero', () => {
    recordSummaryRead('error', Number.NaN, false);
    expect(getSummaryTelemetrySnapshot().averageDurationMs).toBe(0);
    expect(getSummaryTelemetrySnapshot().maxDurationMs).toBe(0);
  });
});
