import { describe, expect, it } from 'vitest';
import { WalletAccountSchema } from '../contracts/entities.js';
import { LedgerEventSchema } from '../contracts/financial.js';
import { decideIdempotency, createIdempotencyRecord } from '../domain/financialIdempotency.js';
import { reconcileWallet } from '../domain/reconciliation.js';
import { applyWalletOperation } from '../domain/walletLedger.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const fingerprint = 'a'.repeat(64);
const account = WalletAccountSchema.parse({ id: 'wallet-1', ownerId: 'garage-1', balanceMinor: 10000, version: 3, updatedAt: '2026-09-20T09:00:00.000Z' });

function operation(kind: 'credit' | 'debit', amountMinor: number, idempotencyKey: string) {
  return { kind, amountMinor, idempotencyKey, actorUid: 'admin-1', operationFingerprint: fingerprint, now, expectedVersion: 3 };
}

describe('v2 financial core', () => {
  it('applies a debit as a new immutable ledger event and increments version', () => {
    const result = applyWalletOperation(account, operation('debit', 2500, 'debit-0001'));
    expect(result.account).toMatchObject({ balanceMinor: 7500, version: 4 });
    expect(result.event).toMatchObject({ kind: 'debit', amountMinor: 2500, accountId: 'wallet-1', idempotencyKey: 'debit-0001' });
  });

  it('rejects insufficient balance and optimistic-version conflicts', () => {
    expect(() => applyWalletOperation(account, operation('debit', 10001, 'debit-0002'))).toThrow('INSUFFICIENT_BALANCE');
    expect(() => applyWalletOperation(account, { ...operation('credit', 1, 'credit-0001'), expectedVersion: 2 })).toThrow('VERSION_CONFLICT');
  });

  it('supports credit operations without mutating the original account', () => {
    const result = applyWalletOperation(account, operation('credit', 500, 'credit-0001'));
    expect(result.account.balanceMinor).toBe(10500);
    expect(account.balanceMinor).toBe(10000);
  });

  it('distinguishes a replay from a conflicting idempotency fingerprint', () => {
    const record = createIdempotencyRecord({ key: 'debit-0001', operation: 'wallet.debit', fingerprint, response: { ok: true }, createdAt: now });
    expect(decideIdempotency(null, 'debit-0001', 'wallet.debit', fingerprint)).toEqual({ kind: 'new' });
    expect(decideIdempotency(record, 'debit-0001', 'wallet.debit', fingerprint)).toMatchObject({ kind: 'replay', record });
    expect(decideIdempotency(record, 'debit-0001', 'wallet.debit', 'b'.repeat(64))).toEqual({ kind: 'conflict' });
  });

  it('reconciles ledger effects against the reported wallet balance', () => {
    const events = [
      LedgerEventSchema.parse({ id: 'event-1', accountId: 'wallet-1', kind: 'credit', amountMinor: 5000, idempotencyKey: 'credit-0001', operationFingerprint: fingerprint, actorUid: 'admin-1', occurredAt: '2026-09-20T09:00:00.000Z' }),
      LedgerEventSchema.parse({ id: 'event-2', accountId: 'wallet-1', kind: 'debit', amountMinor: 2000, idempotencyKey: 'debit-0001', operationFingerprint: 'b'.repeat(64), actorUid: 'admin-1', occurredAt: '2026-09-20T09:30:00.000Z' })
    ];
    expect(reconcileWallet({ openingBalanceMinor: 10000, events, reportedBalanceMinor: 13000 })).toMatchObject({ expectedBalanceMinor: 13000, discrepancyMinor: 0, consistent: true, eventCount: 2 });
    expect(reconcileWallet({ openingBalanceMinor: 10000, events, reportedBalanceMinor: 12900 })).toMatchObject({ expectedBalanceMinor: 13000, discrepancyMinor: -100, consistent: false });
  });
});
