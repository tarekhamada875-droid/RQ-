// Single-bucket prepaid credit ledger.
//
// Previously the system kept three separate running balances per garage
// (paid / referral / trial). As of 2026-10-29 the owner approved collapsing
// them into one balance. The *kind* of every ledger entry is still recorded
// for audit (so you can always look back and see "this 100 came from trial,
// this 500 came from a paid grant, this 20 was a referral bonus, this -50
// was an admin correction"), but there is only one live balance number.

export type CreditEntryKind =
  | 'paid_grant'
  | 'referral_award'
  | 'trial_grant'
  | 'regular_entry_debit'
  | 'subscriber_renewal_debit'
  | 'correction_delta'
  | 'authorized_deletion_restore';

export type PrepaidCreditError =
  | 'INVALID_CREDIT_AMOUNT'
  | 'INVALID_CREDIT_BALANCE'
  | 'CREDIT_BALANCE_OVERFLOW'
  | 'INSUFFICIENT_CREDITS'
  | 'REFERRAL_AWARD_NOT_ELIGIBLE'
  | 'INVALID_LEDGER_ENTRY';

export type PrepaidCreditResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PrepaidCreditError };

export interface CreditLedgerEntry {
  readonly entryId: string;
  readonly garageId: string;
  readonly kind: CreditEntryKind;
  readonly amount: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
  readonly actorUid: string;
  readonly actorRole: string;
  readonly reason: string;
  readonly occurredAt: string;
  readonly idempotencyKey: string;
}

export interface CreditTransition {
  readonly balance: number;
  readonly entry: Omit<CreditLedgerEntry, 'entryId'>;
}

export interface CreditTransitionCommand {
  readonly balance: number;
  readonly garageId: string;
  readonly actorUid: string;
  readonly actorRole: string;
  readonly reason: string;
  readonly occurredAt: string;
  readonly idempotencyKey: string;
}

export interface CreditGrantCommand extends CreditTransitionCommand {
  readonly amount: number;
}

export interface ReferralAwardCommand extends CreditTransitionCommand {
  readonly amount?: number;
  readonly referrerGarageId: string;
  readonly referredGarageId: string;
  readonly paidGrantConfirmed: boolean;
  readonly firstPaidGrant: boolean;
}

export interface CreditDebitCommand extends CreditTransitionCommand {
  readonly amount: number;
}

export interface CreditCorrectionCommand extends CreditTransitionCommand {
  readonly amount: number;
}

export interface CreditRestoreCommand extends CreditTransitionCommand {
  readonly amount: number;
}

const MAX_CREDITS = Number.MAX_SAFE_INTEGER;
const REFERRAL_AWARD_AMOUNT = 20;

function isValidPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isValidNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isValidInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function validEnvelope(command: CreditTransitionCommand): boolean {
  return Boolean(
    command.garageId
      && command.actorUid
      && command.actorRole
      && command.reason
      && command.occurredAt
      && command.idempotencyKey,
  );
}

function transition(
  command: CreditTransitionCommand,
  kind: CreditEntryKind,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
): PrepaidCreditResult<CreditTransition> {
  if (!isValidNonNegativeInteger(command.balance) || !validEnvelope(command) || !isValidInteger(amount) || amount === 0) {
    return { ok: false, error: 'INVALID_LEDGER_ENTRY' };
  }
  return {
    ok: true,
    value: {
      balance: balanceAfter,
      entry: {
        garageId: command.garageId,
        kind,
        amount,
        balanceBefore,
        balanceAfter,
        actorUid: command.actorUid,
        actorRole: command.actorRole,
        reason: command.reason,
        occurredAt: command.occurredAt,
        idempotencyKey: command.idempotencyKey,
      },
    },
  };
}

function addCredits(
  command: CreditTransitionCommand,
  kind: 'paid_grant' | 'referral_award' | 'trial_grant',
  amount: number,
): PrepaidCreditResult<CreditTransition> {
  if (!isValidNonNegativeInteger(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (!isValidPositiveInteger(amount)) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  const before = command.balance;
  const after = before + amount;
  if (!Number.isSafeInteger(after) || after > MAX_CREDITS) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  return transition(command, kind, amount, before, after);
}

export function grantPaidCredits(command: CreditGrantCommand): PrepaidCreditResult<CreditTransition> {
  return addCredits(command, 'paid_grant', command.amount);
}

export function grantTrialCredits(command: CreditGrantCommand): PrepaidCreditResult<CreditTransition> {
  return addCredits(command, 'trial_grant', command.amount);
}

export function awardReferralCredits(command: ReferralAwardCommand): PrepaidCreditResult<CreditTransition> {
  if (
    !command.paidGrantConfirmed
      || !command.firstPaidGrant
      || !command.referrerGarageId
      || !command.referredGarageId
      || command.referrerGarageId === command.referredGarageId
  ) {
    return { ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' };
  }
  const amount = command.amount ?? REFERRAL_AWARD_AMOUNT;
  if (amount !== REFERRAL_AWARD_AMOUNT) return { ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' };
  return addCredits(command, 'referral_award', amount);
}

export function debitRegularEntry(command: CreditDebitCommand): PrepaidCreditResult<CreditTransition> {
  if (!isValidNonNegativeInteger(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (command.amount !== 1) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  if (command.balance < command.amount) return { ok: false, error: 'INSUFFICIENT_CREDITS' };
  return transition(command, 'regular_entry_debit', command.amount, command.balance, command.balance - command.amount);
}

export function debitSubscriberRenewal(command: CreditDebitCommand): PrepaidCreditResult<CreditTransition> {
  if (!isValidNonNegativeInteger(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (!isValidPositiveInteger(command.amount)) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  if (command.balance < command.amount) return { ok: false, error: 'INSUFFICIENT_CREDITS' };
  return transition(command, 'subscriber_renewal_debit', command.amount, command.balance, command.balance - command.amount);
}

// Admin correction: positive amount adds credits, negative amount removes credits.
// Removing more than the current balance is forbidden (balance cannot go negative).
export function applyCorrection(command: CreditCorrectionCommand): PrepaidCreditResult<CreditTransition> {
  if (!isValidNonNegativeInteger(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (!isValidInteger(command.amount) || command.amount === 0) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  const after = command.balance + command.amount;
  if (!Number.isSafeInteger(after)) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  if (after < 0) return { ok: false, error: 'INSUFFICIENT_CREDITS' };
  if (after > MAX_CREDITS) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  return transition(command, 'correction_delta', command.amount, command.balance, after);
}

// Authorized vehicle deletion refund: restores the credit consumed by the
// deleted vehicle's check-in. Always positive, always adds to the balance.
// Kept as its own kind for audit clarity (distinct from admin corrections).
export function restoreCredits(command: CreditRestoreCommand): PrepaidCreditResult<CreditTransition> {
  if (!isValidNonNegativeInteger(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (!isValidPositiveInteger(command.amount)) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  const after = command.balance + command.amount;
  if (!Number.isSafeInteger(after) || after > MAX_CREDITS) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  return transition(command, 'authorized_deletion_restore', command.amount, command.balance, after);
}

export function materializeCreditLedgerEntry(entry: Omit<CreditLedgerEntry, 'entryId'>): PrepaidCreditResult<CreditLedgerEntry> {
  if (
    !entry.garageId
      || !entry.actorUid
      || !entry.actorRole
      || !entry.reason
      || !entry.occurredAt
      || !entry.idempotencyKey
      || !isValidInteger(entry.amount)
      || entry.amount === 0
      || !isValidNonNegativeInteger(entry.balanceBefore)
      || !isValidNonNegativeInteger(entry.balanceAfter)
  ) {
    return { ok: false, error: 'INVALID_LEDGER_ENTRY' };
  }
  return {
    ok: true,
    value: {
      ...entry,
      entryId: `${entry.garageId}:${entry.kind}:${entry.idempotencyKey}:${encodeURIComponent(entry.occurredAt)}:${entry.balanceBefore}:${entry.balanceAfter}`,
    },
  };
}
