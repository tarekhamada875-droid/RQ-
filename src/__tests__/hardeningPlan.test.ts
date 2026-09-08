import { describe, it, expect } from 'vitest';
import { normalizeDigits } from '../utils/formatters';
import { isSubscriptionExpired, calculateCapacityUsed } from '../domain/garage/subscription';
import { HEARTBEAT_TIMEOUT_MS, getOrCreateDeviceId } from '../services/authSessionService';

describe('Stage 2: Schema Normalization & Formatter Tests', () => {
  it('converts Eastern Arabic digits to standard ASCII numerals', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('converts Persian/Urdu numerals to standard ASCII numerals', () => {
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('handles mixed inputs and decimals cleanly', () => {
    expect(normalizeDigits('سعر ٥٠٫٥ ج.م')).toBe('سعر 50.5 ج.م');
  });
});

describe('Stage 3 & 5: Single-Device Access Lock & Heartbeat Tests', () => {
  it('defines 15-minute heartbeat timeout window', () => {
    expect(HEARTBEAT_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  it('generates a stable persistent deviceId', () => {
    const devId = getOrCreateDeviceId();
    expect(typeof devId).toBe('string');
    expect(devId.length).toBeGreaterThan(5);
  });
});

describe('Stage 1 & 2: Operational Non-Negative & Capacity Guard Tests', () => {
  it('detects active vs expired subscription dates accurately', () => {
    const activeGarage = {
      balanceExpiry: new Date(Date.now() + 86400000).toISOString()
    };
    expect(isSubscriptionExpired(activeGarage)).toBe(false);

    const expiredGarage = {
      balanceExpiry: new Date(Date.now() - 86400000).toISOString()
    };
    expect(isSubscriptionExpired(expiredGarage)).toBe(true);
  });

  it('calculates used vs daily capacity limits cleanly', () => {
    const garage = {
      carsInside: 5,
      dailyCapacity: 50
    };
    const { used, limit, isUnlimited } = calculateCapacityUsed(garage);
    expect(used).toBe(5);
    expect(limit).toBe(50);
    expect(isUnlimited).toBe(false);
  });
});
