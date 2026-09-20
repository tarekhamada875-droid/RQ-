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
  private queue: Promise<void> = Promise.resolve();

  constructor(initialAccount: WalletAccount) {
    this.account = WalletAccountSchema.parse(initialAccount);
  }

  apply(input: WalletOperationInput): Promise<WalletOperationResult> {
    const operation = this.queue.then(() => {
      const result = applyWalletOperation(this.account, { ...input, expectedVersion: this.account.version });
      this.account = result.account;
      this.events.push(result.event);
      return result;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  getAccount(): WalletAccount { return this.account; }
  listEvents(): ReadonlyArray<LedgerEvent> { return [...this.events]; }
}
