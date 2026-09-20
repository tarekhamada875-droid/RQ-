import { describe, expect, it } from 'vitest';
import { createCommissionEvent, createPurchaseEvent, createRechargeEvent, createRefundEvent } from '../domain/businessEvents.js';
import { RetryableTransactionError, runBoundedTransaction } from '../domain/transactionRunner.js';

const base = {
  aggregateId: 'garage-1', accountId: 'wallet-1', amountMinor: 1000,
  idempotencyKey: 'operation-0001', operationFingerprint: 'a'.repeat(64), actorUid: 'admin-1',
  occurredAt: new Date('2026-09-20T10:00:00.000Z')
};

describe('v2 financial business events', () => {
  it('constructs typed purchase, recharge, and commission events', () => {
    expect(createPurchaseEvent(base).eventType).toBe('purchase');
    expect(createRechargeEvent(base).eventType).toBe('recharge');
    expect(createCommissionEvent(base).eventType).toBe('commission');
  });

  it('requires a source event for refunds and preserves the source reference', () => {
    expect(() => createRefundEvent({ ...base, idempotencyKey: 'refund-0001', sourceEventId: '' })).toThrow('REFUND_SOURCE_REQUIRED');
    expect(createRefundEvent({ ...base, idempotencyKey: 'refund-0001', sourceEventId: 'purchase-event-1' })).toMatchObject({ eventType: 'refund', sourceEventId: 'purchase-event-1' });
  });

  it('creates deterministic event IDs for the same operation', () => {
    expect(createRechargeEvent(base).eventId).toBe(createRechargeEvent(base).eventId);
  });

  it('retries bounded transaction conflicts and returns the successful attempt', async () => {
    let attempts = 0;
    const result = await runBoundedTransaction(async () => {
      attempts += 1;
      if (attempts < 3) throw new RetryableTransactionError();
      return 'committed';
    }, 3);
    expect(result).toBe('committed');
    expect(attempts).toBe(3);
  });

  it('does not retry non-retryable errors or exceed the retry bound', async () => {
    let attempts = 0;
    await expect(runBoundedTransaction(async () => {
      attempts += 1;
      throw new RetryableTransactionError();
    }, 2)).rejects.toThrow('Transaction conflict');
    expect(attempts).toBe(3);
    await expect(runBoundedTransaction(async () => { throw new Error('validation'); })).rejects.toThrow('validation');
  });
});
