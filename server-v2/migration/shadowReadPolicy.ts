import type { ReadComparisonResult } from './compareReadResults.js';
import { decideRollbackPolicy, type RollbackDecision } from './rollbackPolicy.js';

export type ShadowReadDecision = Readonly<{
  mode: 'legacy' | 'v2' | 'blocked';
  reason: 'preview_disabled' | 'comparison_equal' | 'comparison_mismatch' | 'financial_mismatch' | 'authorization_mismatch' | 'rollback_blocked';
  comparison: ReadComparisonResult;
  rollback: RollbackDecision;
}>;

export function decideShadowRead(input: Readonly<{
  comparison: ReadComparisonResult;
  previewEnabled: boolean;
  previewAuthEnabled?: boolean;
  legacyFallbackAvailable?: boolean;
}>): ShadowReadDecision {
  const rollback = decideRollbackPolicy({
    previewEnabled: input.previewEnabled,
    ...(input.previewAuthEnabled === undefined ? {} : { previewAuthEnabled: input.previewAuthEnabled }),
    ...(input.legacyFallbackAvailable === undefined ? {} : { legacyFallbackAvailable: input.legacyFallbackAvailable })
  });
  if (!rollback.safe) return { mode: 'blocked', reason: 'rollback_blocked', comparison: input.comparison, rollback };
  if (rollback.flagOff) return { mode: 'legacy', reason: 'preview_disabled', comparison: input.comparison, rollback };
  if (input.comparison.financialMismatchHard) return { mode: 'legacy', reason: 'financial_mismatch', comparison: input.comparison, rollback };
  if (input.comparison.authorizationMismatchHard) return { mode: 'legacy', reason: 'authorization_mismatch', comparison: input.comparison, rollback };
  if (!input.comparison.equality) return { mode: 'legacy', reason: 'comparison_mismatch', comparison: input.comparison, rollback };
  return { mode: 'v2', reason: 'comparison_equal', comparison: input.comparison, rollback };
}
