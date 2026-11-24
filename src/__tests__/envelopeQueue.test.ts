import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envelopeQueue, type OfflineEnvelope } from '../services/envelopeQueue';

/**
 * OFFLINE STEP 2: unit tests for the envelope drawer store.
 * The drawer is a plain localStorage-backed module (no React, no Firestore
 * observers) — the whole surface is exercised directly here.
 */

const GARAGE_ID = 'garage_drawer_unit';

function baseEnvelope(overrides: Partial<OfflineEnvelope> = {}): Omit<OfflineEnvelope, 'attempts' | 'status'> {
  return {
    id: `vehicle_checkin_${Math.random().toString(36).slice(2)}`,
    garageId: GARAGE_ID,
    kind: 'checkin',
    plateNumber: 'س ن ا 1234',
    plateRaw: 'سنا1234',
    vehicleType: 'hourly',
    entryTimeIso: '2026-11-24T10:00:00.000Z',
    staffName: 'مدير الجراج',
    staffId: null,
    isSubscriber: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('envelopeQueue (offline drawer store)', () => {
  beforeEach(() => {
    localStorage.removeItem('app_offline_envelopes');
  });

  afterEach(() => {
    localStorage.removeItem('app_offline_envelopes');
  });

  it('enqueues FIFO and persists to localStorage across reads', () => {
    const first = envelopeQueue.enqueue(baseEnvelope());
    const second = envelopeQueue.enqueue(baseEnvelope({ kind: 'checkout', plateRaw: 'سنا999' }));

    const list = envelopeQueue.list(GARAGE_ID);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(first.id);
    expect(list[1].id).toBe(second.id);
    expect(list[1].status).toBe('pending');
    // Persisted — a fresh read from storage sees the same content.
    expect(JSON.parse(localStorage.getItem('app_offline_envelopes') || '[]')).toHaveLength(2);
  });

  it('refuses a duplicate idempotency key (data-integrity backstop)', () => {
    const envelope = baseEnvelope({ id: 'vehicle_checkin_fixed_key' });
    envelopeQueue.enqueue(envelope);
    envelopeQueue.enqueue(envelope);
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(1);
  });

  it('filters by garage and counts pending vs rejected', () => {
    envelopeQueue.enqueue(baseEnvelope());
    envelopeQueue.enqueue(baseEnvelope({ garageId: 'garage_other' }));
    const checkout = envelopeQueue.enqueue(baseEnvelope({ kind: 'checkout', plateRaw: 'سنا777' }));

    expect(envelopeQueue.list('garage_other')).toHaveLength(1);
    expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(2);

    envelopeQueue.markFailed(checkout.id, 'INSUFFICIENT_PAID_CREDITS', true);
    expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(1);
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(1);
    const rejected = envelopeQueue.list(GARAGE_ID).find((item) => item.id === checkout.id);
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.lastError).toBe('INSUFFICIENT_PAID_CREDITS');
    expect(rejected?.attempts).toBe(1);
  });

  it('markFailed keeps pending status for network-shaped failures (retryable)', () => {
    const envelope = envelopeQueue.enqueue(baseEnvelope());
    envelopeQueue.markFailed(envelope.id, 'تعذر الاتصال بالخادم', false);
    const stored = envelopeQueue.list(GARAGE_ID)[0];
    expect(stored.status).toBe('pending');
    expect(stored.attempts).toBe(1);
  });

  it('remove drops the envelope after a confirmed flush', () => {
    const envelope = envelopeQueue.enqueue(baseEnvelope());
    envelopeQueue.remove(envelope.id);
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
  });

  it('mirror lookups: pending check-in answers, pending checkout suppresses', () => {
    const checkin = envelopeQueue.enqueue(baseEnvelope());
    expect(envelopeQueue.findPendingCheckIn(GARAGE_ID, 'سنا1234')?.id).toBe(checkin.id);
    expect(envelopeQueue.findPendingCheckIn(GARAGE_ID, 'سنا0000')).toBeNull();

    // A rejected check-in must NOT answer the mirror (the bank refused it).
    envelopeQueue.markFailed(checkin.id, 'INSUFFICIENT_PAID_CREDITS', true);
    expect(envelopeQueue.findPendingCheckIn(GARAGE_ID, 'سنا1234')).toBeNull();

    const checkout = envelopeQueue.enqueue(baseEnvelope({ kind: 'checkout', plateRaw: 'سنا555' }));
    expect(envelopeQueue.hasPendingCheckout(GARAGE_ID, 'سنا555')).toBe(true);
    envelopeQueue.remove(checkout.id);
    expect(envelopeQueue.hasPendingCheckout(GARAGE_ID, 'سنا555')).toBe(false);
  });

  it('tolerates corrupted storage by starting empty', () => {
    localStorage.setItem('app_offline_envelopes', '{not valid json');
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
  });

  it('notifies external-store subscribers on mutations', () => {
    let notifications = 0;
    const unsubscribe = envelopeQueue.subscribe(() => { notifications += 1; });
    const envelope = envelopeQueue.enqueue(baseEnvelope());
    const afterEnqueue = notifications;
    expect(afterEnqueue).toBeGreaterThan(0);
    envelopeQueue.remove(envelope.id);
    expect(notifications).toBeGreaterThan(afterEnqueue);
    unsubscribe();
    const before = notifications;
    envelopeQueue.enqueue(baseEnvelope());
    expect(notifications).toBe(before); // unsubscribed → silence
  });
});
