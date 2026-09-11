import { describe, expect, it } from 'vitest';
import { isPinVerificationSuccessful } from '../../server/pinRotation';

describe('admin PIN rotation authorization', () => {
  it('rejects a structured verifier result when matches is false', () => {
    expect(isPinVerificationSuccessful({ matches: false, isLegacy: false })).toBe(false);
  });

  it('accepts only an explicitly successful structured verifier result', () => {
    expect(isPinVerificationSuccessful({ matches: true, isLegacy: false })).toBe(true);
    expect(isPinVerificationSuccessful({ matches: false, isLegacy: true })).toBe(false);
    expect(isPinVerificationSuccessful(undefined)).toBe(false);
  });
});
