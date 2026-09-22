import { compareReadResults, type ReadComparisonResult, type ReadComparisonInput } from './compareReadResults.js';
import { decideShadowRead, type ShadowReadDecision } from './shadowReadPolicy.js';

type ReadFn = () => Promise<ReadonlyArray<unknown> | ReadComparisonInput['legacy']>;

export type ShadowComparisonOutcome = Readonly<{
  mode: 'legacy' | 'v2' | 'blocked';
  reason: ShadowReadDecision['reason'] | 'legacy_read_failed' | 'v2_read_failed';
  comparison?: ReadComparisonResult;
  error?: 'legacy_read_failed' | 'v2_read_failed';
}>;

export async function runShadowComparison(input: Readonly<{
  comparison: Omit<ReadComparisonInput, 'legacy' | 'v2'>;
  readLegacy: ReadFn;
  readV2: ReadFn;
  previewEnabled: boolean;
  previewAuthEnabled?: boolean;
  legacyFallbackAvailable?: boolean;
}>): Promise<ShadowComparisonOutcome> {
  const [legacyResult, v2Result] = await Promise.allSettled([input.readLegacy(), input.readV2()]);
  if (legacyResult.status === 'rejected') {
    return { mode: 'blocked', reason: 'legacy_read_failed', error: 'legacy_read_failed' };
  }
  if (v2Result.status === 'rejected') {
    return { mode: 'legacy', reason: 'v2_read_failed', error: 'v2_read_failed' };
  }

  const comparison = compareReadResults({
    ...input.comparison,
    legacy: legacyResult.value,
    v2: v2Result.value
  });
  const decision = decideShadowRead({
    comparison,
    previewEnabled: input.previewEnabled,
    ...(input.previewAuthEnabled === undefined ? {} : { previewAuthEnabled: input.previewAuthEnabled }),
    ...(input.legacyFallbackAvailable === undefined ? {} : { legacyFallbackAvailable: input.legacyFallbackAvailable })
  });
  return { mode: decision.mode, reason: decision.reason, comparison };
}
