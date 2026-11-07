import { describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore } from '../src/__tests__/mockFirestore';
import { FieldValue } from './firebaseAdmin';
import {
  maintainedGarageSummaryRef,
  writeMaintainedGarageDelta,
  isUsableMaintainedSummary,
  MAINTAINED_SUMMARY_VERSION,
} from './workerMaintenance';

// Audit A1 (Phase 3, 2026-11-06): regression test for the FieldValue import
// seam. Before the fix, workerMaintenance.ts imported FieldValue from
// './firebaseWorkerAdmin' which in dev/tests returned the sentinel
// {__op:'increment', value:n}. MockFirestore persisted it as a literal map,
// so isUsableMaintainedSummary got NaN and the O(1) maintained-summary
// fast path silently never worked in dev. A test even papered over it by
// unwrapping __op manually.
//
// Now: FieldValue comes from './firebaseAdmin' (re-exported from the real
// firebase-admin SDK), and MockFirestore's applyFieldTransforms recognizes
// the SDK's NumericIncrementTransform and applies it as a numeric increment.
// The full writeMaintainedSummaryDelta → isUsableMaintainedSummary cycle
// works end-to-end in dev/tests.

describe('FieldValue import seam + MockFirestore increment application (audit A1)', () => {
  let mockDb: MockFirestore;

  beforeEach(() => {
    mockDb = new MockFirestore();
  });

  it('FieldValue.increment(n) from firebaseAdmin is the real SDK transform (not a sentinel)', () => {
    const v = FieldValue.increment(5);
    // The real SDK's NumericIncrementTransform has an `operand` property.
    // (The sentinel from firebaseWorkerAdmin would have {__op:'increment',
    // value:5}.)
    expect(v).toBeInstanceOf(Object);
    expect((v as any).operand).toBe(5);
    expect((v as any).__op).toBeUndefined();
  });

  it('writeMaintainedGarageDelta writes a usable summary (schemaVersion + finite numbers)', async () => {
    const garageId = 'garage-test';
    const summaryPath = `garages/${garageId}/maintained_summary/current`;

    // Pre-seed the summary doc with a schemaVersion + initial values, so
    // the merge has something to increment against.
    await mockDb.doc(summaryPath).set({
      schemaVersion: MAINTAINED_SUMMARY_VERSION,
      carsInside: 5,
      activeSubscribersCount: 3,
      totalSubscribersCount: 10,
    });

    // Apply a delta via a transaction (mirrors how the route handlers do it).
    await mockDb.runTransaction(async (t: any) => {
      writeMaintainedGarageDelta(t, garageId, { carsInside: 2, activeSubscribersCount: 1, totalSubscribersCount: 1 });
    });

    const stored = mockDb.records.get(summaryPath);
    // The increment transforms should have been applied — not stored as
    // literal maps. Pre-A1 fix, `stored.carsInside` would have been
    // {__op:'increment', value:2} (the sentinel) or NumericIncrementTransform
    // (the SDK shape), and isUsableMaintainedSummary would have returned
    // false (NaN check fails).
    expect(stored.carsInside).toBe(7);     // 5 + 2
    expect(stored.activeSubscribersCount).toBe(4);   // 3 + 1
    expect(stored.totalSubscribersCount).toBe(11);   // 10 + 1
    expect(stored.schemaVersion).toBe(MAINTAINED_SUMMARY_VERSION);

    // The fast-path check should now succeed.
    expect(isUsableMaintainedSummary(stored, ['carsInside', 'activeSubscribersCount', 'totalSubscribersCount'])).toBe(true);
  });

  it('isUsableMaintainedSummary returns false when a required field is NaN (regression guard)', () => {
    // Simulate the pre-A1 broken state: a field stored as a non-number
    // (the sentinel object that MockFirestore used to persist).
    const brokenSummary = {
      schemaVersion: MAINTAINED_SUMMARY_VERSION,
      carsInside: { __op: 'increment', value: 5 },  // not a number
      activeSubscribersCount: 3,
    };
    expect(isUsableMaintainedSummary(brokenSummary, ['carsInside', 'activeSubscribersCount'])).toBe(false);
  });

  it('maintainedGarageSummaryRef returns the correct doc path', () => {
    const ref = maintainedGarageSummaryRef('garage-xyz');
    // The function returns a MockDocumentReference (from adminDb.doc(...))
    // whose .path property is the full Firestore path.
    expect((ref as any).path).toBe('garages/garage-xyz/maintained_summary/current');
  });
});
