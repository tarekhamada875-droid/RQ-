export interface PinVerificationResult {
  matches: boolean;
  isLegacy: boolean;
}

/** Only an explicit successful verifier result may authorize PIN rotation. */
export function isPinVerificationSuccessful(result: PinVerificationResult | null | undefined): boolean {
  return result?.matches === true;
}
