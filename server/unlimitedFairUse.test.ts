import { describe, expect, it } from 'vitest';
import { evaluateFairUseCheckIn, manualAdminExtendFairUse } from './unlimitedFairUse';

describe('unlimited fair-use updates', () => {
  it('omits lastExtendedAt when a check-in does not auto-extend', () => {
    const result = evaluateFairUseCheckIn({
      isActive: true,
      tierType: 'daily',
      cycleCarsCount: 0,
      currentAllowance: 200,
      maxAllowance: 400,
      stepAmount: 200,
      threshold: 20,
      extensionsCount: 0,
    }, 1, 'daily');

    expect(result.allowed).toBe(true);
    expect(result.autoExtended).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.updatedFairUse, 'lastExtendedAt')).toBe(false);
  });

  it('preserves a real lastExtendedAt value when no new extension occurs', () => {
    const lastExtendedAt = new Date('2026-09-01T00:00:00.000Z');
    const result = evaluateFairUseCheckIn({
      isActive: true,
      tierType: 'daily',
      cycleCarsCount: 0,
      currentAllowance: 200,
      maxAllowance: 400,
      stepAmount: 200,
      threshold: 20,
      extensionsCount: 0,
      lastExtendedAt,
    }, 1, 'daily');

    expect(result.updatedFairUse.lastExtendedAt).toBe(lastExtendedAt);
  });

  it('creates a concrete timestamp for manual extensions', () => {
    const updated = manualAdminExtendFairUse({
      isActive: true,
      tierType: 'daily',
      cycleCarsCount: 0,
      currentAllowance: 200,
      maxAllowance: 400,
      stepAmount: 200,
      threshold: 20,
      extensionsCount: 0,
    });

    expect(updated.lastExtendedAt).toBeInstanceOf(Date);
  });
});
