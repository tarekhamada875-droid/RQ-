import { describe, expect, it } from 'vitest';
import { createRequestFingerprint } from './idempotency';

describe('request idempotency fingerprints', () => {
  it('is stable when object keys arrive in a different order', () => {
    expect(createRequestFingerprint({ amount: 100, packageId: 'monthly_30' }))
      .toBe(createRequestFingerprint({ packageId: 'monthly_30', amount: 100 }));
  });

  it('changes when a financial request value changes', () => {
    expect(createRequestFingerprint({ amount: 100 }))
      .not.toBe(createRequestFingerprint({ amount: 101 }));
  });

  it('preserves array order because order can be business-significant', () => {
    expect(createRequestFingerprint({ items: ['a', 'b'] }))
      .not.toBe(createRequestFingerprint({ items: ['b', 'a'] }));
  });
});
