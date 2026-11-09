import { describe, expect, it } from 'vitest';
import {
  ENTRY_ERROR_WINDOW_MS,
  isWithinEntryErrorWindow,
} from './graceWindow';

describe('ENTRY_ERROR_WINDOW_MS constant', () => {
  it('is exactly 300_000 milliseconds (5 minutes)', () => {
    expect(ENTRY_ERROR_WINDOW_MS).toBe(300_000);
    expect(ENTRY_ERROR_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});

describe('isWithinEntryErrorWindow — boundary semantics', () => {
  it('returns true for diffMs = 0 (just-entered vehicle)', () => {
    expect(isWithinEntryErrorWindow(0)).toBe(true);
  });

  it('returns true for diffMs = 299_999 (1 ms before window closes)', () => {
    expect(isWithinEntryErrorWindow(299_999)).toBe(true);
  });

  it('returns false for diffMs = 300_000 (window closed — strict <)', () => {
    // This is the F6 ruling: strict less-than. The previous L38 code
    // used <=, which incorrectly returned true at exactly 300_000.
    expect(isWithinEntryErrorWindow(300_000)).toBe(false);
  });

  it('returns false for diffMs well past the window', () => {
    expect(isWithinEntryErrorWindow(600_000)).toBe(false);
    expect(isWithinEntryErrorWindow(3_600_000)).toBe(false);
  });
});

describe('isWithinEntryErrorWindow — subscribers unaffected', () => {
  // The helper is a pure numeric comparison; it does not consult
  // vehicle.isSubscriber. The subscriber gate lives at the call site
  // (`!selectedVehicle.isSubscriber && isWithinEntryErrorWindow(diffMs)`),
  // so subscribers never reach this function in production. This test
  // pins that contract: the function must not change behavior based
  // on caller intent.

  it('returns the same value regardless of why it is called (pure)', () => {
    // Same diffMs called twice — must return the same result. This
    // matters because CheckOutModal uses the result in two distinct
    // gates (delete-allowed and cost-panel-hidden), and they MUST agree.
    const diff = 250_000;
    const deleteGateResult = isWithinEntryErrorWindow(diff);
    const costPanelGateResult = isWithinEntryErrorWindow(diff);
    expect(deleteGateResult).toBe(costPanelGateResult);
    expect(deleteGateResult).toBe(true);
  });

  it('returns false at exactly the boundary, so a subscriber (whose gate is `!isSubscriber && ...`) sees the cost panel render — consistent with non-subscribers at the same instant', () => {
    // At diffMs = 300_000, both gates return false:
    //  - non-subscriber: isInitialMinute=false (delete blocked),
    //    cost-panel condition `diffMs < 300000` is false → cost shows.
    //  - subscriber: the call site is `!isSubscriber && isWithinEntryErrorWindow(diff)`.
    //    Short-circuits to false → cost panel renders (subscribers always
    //    see the 'monthly subscriber' panel). Unaffected by the boundary.
    expect(isWithinEntryErrorWindow(300_000)).toBe(false);
  });
});
