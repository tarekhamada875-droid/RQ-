import { describe, expect, it } from 'vitest';
import { decideManualCredit } from './domain/manualCredit';

describe('manual credit decision', () => {
  it('calculates a safe balance transition', () => {
    expect(decideManualCredit({ amount: 1000, previousBalance: 250 })).toEqual({
      ok: true,
      value: { amount: 1000, previousBalance: 250, newBalance: 1250 },
    });
  });

  it('rejects invalid or unsafe amounts', () => {
    expect(decideManualCredit({ amount: 0, previousBalance: 0 })).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
    expect(decideManualCredit({ amount: 1.5, previousBalance: 0 })).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
    expect(decideManualCredit({ amount: 1, previousBalance: -1 })).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
  });

  it('rejects balance overflow', () => {
    expect(decideManualCredit({ amount: 2, previousBalance: Number.MAX_SAFE_INTEGER - 1 })).toEqual({ ok: false, error: 'BALANCE_OVERFLOW' });
  });
});
