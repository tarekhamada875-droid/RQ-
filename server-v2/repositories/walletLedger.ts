import type { WalletAccount } from '../contracts/entities.js';
import type { LedgerEvent } from '../contracts/financial.js';
import { applyWalletOperation, type WalletOperationInput, type WalletOperationResult } from '../domain/walletLedger.js';
import { WalletAccountSchema } from '../contracts/entities.js';

export interface WalletLedgerRepository {
  apply(input: WalletOperationInput): Promise<WalletOperationResult>;
  getAccount(): WalletAccount;
  listEvents(): ReadonlyArray<LedgerEvent>;
}

export class InMemoryWalletLedgerRepository implements WalletLedgerRepository {
  private account: WalletAccount;
  private readonly events: LedgerEvent[] = [];
  private readonly idempotency = new Map<string, { fingerprint: string; result: WalletOperationResult }>();
  private queue: Promise<void> = Promise.resolve();

  constructor(initialAccount: WalletAccount) {
    this.account = WalletAccountSchema.parse(initialAccount);
  }

  apply(input: WalletOperationInput): Promise<WalletOperationResult> {
    const operation = this.queue.then(() => {
      const stored = this.idempotency.get(input.idempotencyKey);
      if (stored) {
        if (stored.fingerprint !== input.operationFingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return stored.result;
      }
      const result = applyWalletOperation(this.account, { ...input, expectedVersion: this.account.version });
      this.account = result.account;
      this.events.push(result.event);
      this.idempotency.set(input.idempotencyKey, { fingerprint: input.operationFingerprint, result });
      return result;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  getAccount(): WalletAccount { return this.account; }
  listEvents(): ReadonlyArray<LedgerEvent> { return [...this.events]; }
}
