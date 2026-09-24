export type ManualCreditError = 'INVALID_AMOUNT' | 'BALANCE_OVERFLOW';

export type ManualCreditResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ManualCreditError };

export interface ManualCreditCommand {
  readonly amount: number;
  readonly previousBalance: number;
}

export interface ManualCreditDecision {
  readonly amount: number;
  readonly previousBalance: number;
  readonly newBalance: number;
}

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

export function decideManualCredit(command: ManualCreditCommand): ManualCreditResult<ManualCreditDecision> {
  if (!Number.isSafeInteger(command.amount) || command.amount <= 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  if (!Number.isFinite(command.previousBalance) || command.previousBalance < 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  const newBalance = command.previousBalance + command.amount;
  if (!Number.isSafeInteger(newBalance) || newBalance > MAX_BALANCE) {
    return { ok: false, error: 'BALANCE_OVERFLOW' };
  }
  return {
    ok: true,
    value: {
      amount: command.amount,
      previousBalance: command.previousBalance,
      newBalance,
    },
  };
}
