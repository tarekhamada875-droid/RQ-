import { describe, expect, it } from 'vitest';
import { createFinancialAuditEvent } from '../domain/financialAudit.js';
import { InMemoryWalletLedgerRepository } from '../repositories/walletLedger.js';
import { WalletAccountSchema } from '../contracts/entities.js';

const account = WalletAccountSchema.parse({ id: 'wallet-1', ownerId: 'garage-1', balanceMinor: 10000, version: 0, updatedAt: '2026-09-20T10:00:00.000Z' });
const base = { kind: 'debit' as const, amountMinor: 7500, actorUid: 'admin-1', operationFingerprint: 'a'.repeat(64), now: new Date('2026-09-20T10:00:00.000Z') };

describe('v2 wallet repository and financial audit', () => {
  it('serializes competing debits so the balance cannot go negative', async () => {
    const repository = new InMemoryWalletLedgerRepository(account);
    const results = await Promise.allSettled([
      repository.apply({ ...base, idempotencyKey: 'debit-concurrent-1' }),
      repository.apply({ ...base, idempotencyKey: 'debit-concurrent-2' })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(repository.getAccount()).toMatchObject({ balanceMinor: 2500, version: 1 });
    expect(repository.listEvents()).toHaveLength(1);
  });

  it('replays the same wallet operation without applying it twice', async () => {
    const repository = new InMemoryWalletLedgerRepository(account);
    const input = { ...base, idempotencyKey: 'debit-replay-1' };
    const first = await repository.apply(input);
    await expect(repository.apply(input)).resolves.toEqual(first);
    expect(repository.getAccount()).toMatchObject({ balanceMinor: 2500, version: 1 });
    expect(repository.listEvents()).toHaveLength(1);
    await expect(repository.apply({ ...input, amountMinor: 1000, operationFingerprint: 'b'.repeat(64) })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
  });

  it('records a safe audit event for both success and failure outcomes', () => {
    const success = createFinancialAuditEvent({ requestId: '2f1d4d2d-3b15-4a01-9d45-8ee1d8cf0c16', actorUid: 'admin-1', accountId: 'wallet-1', operation: 'wallet.debit', resultCode: 'OK', ledgerEventId: 'ledger-1', occurredAt: new Date('2026-09-20T10:00:00.000Z') });
    const failure = createFinancialAuditEvent({ requestId: 'b2d6c5ef-b34c-4f26-a8de-5b6672b486a2', actorUid: 'admin-1', accountId: 'wallet-1', operation: 'wallet.debit', resultCode: 'INSUFFICIENT_BALANCE', occurredAt: new Date('2026-09-20T10:00:00.000Z') });
    expect(success).toMatchObject({ resultCode: 'OK', ledgerEventId: 'ledger-1' });
    expect(failure).toMatchObject({ resultCode: 'INSUFFICIENT_BALANCE' });
    expect(JSON.stringify(success)).not.toContain('amountMinor');
  });
});
