import { describe, expect, it } from 'vitest';
import { getUnsettledDelegateCycleTotal } from './routes/delegates';

describe('delegate deletion financial guard', () => {
  it('returns the unsettled cycle total when it is positive', () => {
    expect(getUnsettledDelegateCycleTotal({ totalRechargedAmount: 1250 })).toBe(1250);
  });

  it('allows deletion when the cycle is settled or absent', () => {
    expect(getUnsettledDelegateCycleTotal({ totalRechargedAmount: 0 })).toBe(0);
    expect(getUnsettledDelegateCycleTotal({})).toBe(0);
    expect(getUnsettledDelegateCycleTotal({ totalRechargedAmount: 'not-a-number' })).toBe(0);
  });
});
