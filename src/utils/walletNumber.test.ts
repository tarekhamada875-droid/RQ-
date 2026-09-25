import { describe, expect, it } from 'vitest';
import { getWalletNumberUpdate } from './walletNumber';

describe('wallet number synchronization', () => {
  it('normalizes a real wallet number', () => {
    expect(getWalletNumberUpdate('  01012345678  ')).toBe('01012345678');
  });

  it('rejects empty and missing fallback values', () => {
    expect(getWalletNumberUpdate('')).toBeNull();
    expect(getWalletNumberUpdate('   ')).toBeNull();
    expect(getWalletNumberUpdate(undefined)).toBeNull();
    expect(getWalletNumberUpdate(null)).toBeNull();
  });
});

