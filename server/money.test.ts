import { describe, expect, it } from 'vitest';
import { addMoney, addMoneyRounded, addSignedMoney, parseMoneyAmount, parseMoneyCents, parseSignedMoneyAmount } from './money';

describe('money amount validation', () => {
  it('normalizes valid numeric and legacy numeric-string amounts to cents', () => {
    expect(parseMoneyCents(0)).toBe(0);
    expect(parseMoneyCents(0.29)).toBe(29);
    expect(parseMoneyAmount(12.3)).toBe(12.3);
    expect(parseMoneyAmount('0012.30')).toBe(12.3);
  });

  it.each([
    -0.01,
    1.234,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_VALUE,
    undefined,
    null,
    true,
    '1.234',
    '-1.00',
    'NaN',
    'Infinity',
    ' 1.00',
    '1e2'
  ])('rejects invalid amount %s', (amount) => {
    expect(parseMoneyAmount(amount)).toBeNull();
  });

  it('adds currency in integer cents and ignores invalid or overflowing values', () => {
    expect(addMoney(addMoney(0, 0.1), 0.2)).toBe(0.3);
    expect(addMoney(10.25, -1)).toBe(10.25);
    expect(addMoney(10.25, Number.NaN)).toBe(10.25);
    expect(addMoney(10.25, 1.234)).toBe(10.25);
    expect(addMoney(Number.NaN, 1)).toBe(0);

    const largestSafeCentAmount = Number.MAX_SAFE_INTEGER / 100;
    expect(addMoney(largestSafeCentAmount, 0.01)).toBe(largestSafeCentAmount);
  });

  it('supports signed derived net amounts without accepting malformed precision', () => {
    expect(parseSignedMoneyAmount(-1.25)).toBe(-1.25);
    expect(parseSignedMoneyAmount('-0.05')).toBe(-0.05);
    expect(parseSignedMoneyAmount(1.234)).toBeNull();
    expect(addSignedMoney(-10, 3.25)).toBe(-6.75);
    expect(addSignedMoney(-10, Number.NaN)).toBe(-10);
    expect(addSignedMoney(1.25, 1.234)).toBe(1.25);
  });

  it('addMoneyRounded re-anchors legacy drifted counters to the cent instead of zeroing them', () => {
    // Years of raw float additions leave representation error that the strict
    // parser rejects (addMoney would zero the total). The rounded variant
    // re-anchors to the nearest cent on every write.
    const drifted = 0.1 + 0.2 + 1234.25; // legacy accumulated total
    expect(addMoneyRounded(drifted, 5)).toBe(1239.55);
    expect(addMoneyRounded(Number.NaN, 5)).toBe(5);
    expect(addMoneyRounded('12.30', 0.7)).toBe(13);
    expect(addMoneyRounded(100, Number.NaN)).toBe(100);
    expect(addMoneyRounded(undefined, 1.01)).toBe(1.01);
  });
});
