import crypto from 'node:crypto';
import { LedgerEventSchema, type LedgerEvent } from '../contracts/financial.js';
import { WalletAccountSchema, type WalletAccount } from '../contracts/entities.js';
import { addMinorUnits, subtractMinorUnits } from './money.js';

export type WalletOperationInput = Readonly<{
  kind: 'credit' | 'debit';
  amountMinor: number;
  idempotencyKey: string;
  actorUid: string;
  operationFingerprint: string;
  now: Date;
  expectedVersion?: number;
}>;

export type WalletOperationResult = Readonly<{ account: WalletAccount; event: LedgerEvent }>;

function ledgerId(input: WalletOperationInput, accountId: string): string {
  return `ledger_${crypto.createHash('sha256').update(`${accountId}:${input.idempotencyKey}`).digest('hex').slice(0, 32)}`;
}

export function applyWalletOperation(account: WalletAccount, input: WalletOperationInput): WalletOperationResult {
  const current = WalletAccountSchema.parse(account);
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('INVALID_AMOUNT');
  if (!input.actorUid || !input.idempotencyKey || !/^[a-f0-9]{64}$/.test(input.operationFingerprint)) throw new Error('INVALID_OPERATION');
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) throw new Error('VERSION_CONFLICT');
  if (Number.isNaN(input.now.getTime())) throw new Error('INVALID_DATE');
  if (input.kind === 'debit' && input.amountMinor > current.balanceMinor) throw new Error('INSUFFICIENT_BALANCE');
  const balanceMinor = input.kind === 'credit'
    ? addMinorUnits(current.balanceMinor, input.amountMinor)
    : subtractMinorUnits(current.balanceMinor, input.amountMinor);
  const event = LedgerEventSchema.parse({
    id: ledgerId(input, current.id), accountId: current.id, kind: input.kind,
    amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey,
    operationFingerprint: input.operationFingerprint, actorUid: input.actorUid,
    occurredAt: input.now.toISOString()
  });
  const updatedAccount = WalletAccountSchema.parse({ ...current, balanceMinor, version: current.version + 1, updatedAt: input.now.toISOString() });
  return { account: updatedAccount, event };
}
