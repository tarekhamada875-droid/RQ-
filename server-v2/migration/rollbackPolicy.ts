export type RollbackPolicyInput = Readonly<{
  previewEnabled: boolean;
  previewAuthEnabled?: boolean;
  legacyFallbackAvailable?: boolean;
  deleteRequested?: boolean;
  financialWriteRequested?: boolean;
  dualFinancialWriteRequested?: boolean;
}>;

export type RollbackDecision = Readonly<{
  safe: boolean;
  mode: 'legacy' | 'v2' | 'blocked';
  flagOff: boolean;
  useLegacyFallback: boolean;
  deletesAllowed: false;
  dualFinancialWritesAllowed: false;
  violations: ReadonlyArray<'delete-not-permitted' | 'dual-financial-write-not-permitted' | 'legacy-fallback-unavailable'>;
}>;

/**
 * Decide rollback behavior without changing flags, traffic, data, or external state.
 * A disabled or unauthenticated preview always fails closed to the legacy read path.
 */
export function decideRollbackPolicy(input: RollbackPolicyInput): RollbackDecision {
  const flagOff = !input.previewEnabled || input.previewAuthEnabled === false;
  const violations: Array<'delete-not-permitted' | 'dual-financial-write-not-permitted' | 'legacy-fallback-unavailable'> = [];
  if (input.deleteRequested === true) violations.push('delete-not-permitted');
  if (input.dualFinancialWriteRequested === true) {
    violations.push('dual-financial-write-not-permitted');
  }
  const useLegacyFallback = flagOff;
  if (input.legacyFallbackAvailable === false) violations.push('legacy-fallback-unavailable');
  const blocked = violations.length > 0;
  return {
    safe: !blocked,
    mode: blocked ? 'blocked' : useLegacyFallback ? 'legacy' : 'v2',
    flagOff,
    useLegacyFallback,
    deletesAllowed: false,
    dualFinancialWritesAllowed: false,
    violations
  };
}

export function isRollbackSafe(input: RollbackPolicyInput): boolean {
  return decideRollbackPolicy(input).safe;
}

export function rollbackToLegacy(input: Omit<RollbackPolicyInput, 'previewEnabled'> = {}): RollbackDecision {
  return decideRollbackPolicy({ ...input, previewEnabled: false });
}
