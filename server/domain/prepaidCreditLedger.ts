export type CreditBucket = 'paid' | 'referral' | 'trial';
export type CreditEntryKind =
  | 'paid_grant'
  | 'referral_award'
  | 'trial_grant'
  | 'regular_entry_debit'
  | 'subscriber_renewal_debit'
  | 'correction_restore';

export type PrepaidCreditError =
  | 'INVALID_CREDIT_AMOUNT'
  | 'INVALID_CREDIT_BALANCE'
  | 'CREDIT_BALANCE_OVERFLOW'
  | 'INSUFFICIENT_PAID_CREDITS'
  | 'INSUFFICIENT_ELIGIBLE_CREDITS'
  | 'REFERRAL_CREDITS_NOT_ALLOWED'
  | 'REFERRAL_AWARD_NOT_ELIGIBLE'
  | 'INVALID_LEDGER_ENTRY';

export type PrepaidCreditResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PrepaidCreditError };

export interface CreditBalance {
  readonly paid: number;
  readonly referral: number;
  readonly trial: number;
}

export interface CreditLedgerEntry {
  readonly entryId: string;
  readonly garageId: string;
  readonly kind: CreditEntryKind;
  readonly bucket: CreditBucket;
  readonly amount: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
  /** Total paid + referral + trial balance after this transition. */
  readonly totalBalanceAfter?: number;
  readonly actorUid: string;
  readonly actorRole: string;
  readonly reason: string;
  readonly reference: string;
  readonly occurredAt: string;
  readonly idempotencyKey: string;
}

export interface CreditTransition {
  readonly balance: CreditBalance;
  readonly entry: Omit<CreditLedgerEntry, 'entryId'>;
}

export interface CreditTransitionCommand {
  readonly balance: CreditBalance;
  readonly garageId: string;
  readonly actorUid: string;
  readonly actorRole: string;
  readonly reason: string;
  readonly reference: string;
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

export interface CreditRestoreCommand extends CreditTransitionCommand {
  readonly amount: number;
  readonly bucket: CreditBucket;
}

const MAX_CREDITS = Number.MAX_SAFE_INTEGER;
const REFERRAL_AWARD_AMOUNT = 20;

function isValidPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isValidNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validBalance(balance: CreditBalance): boolean {
  return isValidNonNegativeInteger(balance.paid)
    && isValidNonNegativeInteger(balance.referral)
    && isValidNonNegativeInteger(balance.trial);
}

function validEnvelope(command: CreditTransitionCommand): boolean {
  return Boolean(
    command.garageId
      && command.actorUid
      && command.actorRole
      && command.reason
      && command.reference
      && command.occurredAt
      && command.idempotencyKey
  );
}

function transition(
  command: CreditTransitionCommand,
  kind: CreditEntryKind,
  bucket: CreditBucket,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  balance: CreditBalance,
): PrepaidCreditResult<CreditTransition> {
  if (!validBalance(command.balance) || !validEnvelope(command) || !isValidPositiveInteger(amount)) {
    return { ok: false, error: 'INVALID_LEDGER_ENTRY' };
  }
  return {
    ok: true,
    value: {
      balance,
      entry: {
        garageId: command.garageId,
        kind,
        bucket,
        amount,
        balanceBefore,
        balanceAfter,
        totalBalanceAfter: balance.paid + balance.referral + balance.trial,
        actorUid: command.actorUid,
        actorRole: command.actorRole,
        reason: command.reason,
        reference: command.reference,
        occurredAt: command.occurredAt,
        idempotencyKey: command.idempotencyKey,
      },
    },
  };
}

function addCredits(
  command: CreditTransitionCommand,
  kind: 'paid_grant' | 'referral_award' | 'trial_grant',
  bucket: CreditBucket,
  amount: number,
): PrepaidCreditResult<CreditTransition> {
  if (!validBalance(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (!isValidPositiveInteger(amount)) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  const before = command.balance[bucket];
  const after = before + amount;
  if (!Number.isSafeInteger(after) || after > MAX_CREDITS) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  const balance = { ...command.balance, [bucket]: after };
  const totalAfter = balance.paid + balance.referral + balance.trial;
  if (!Number.isSafeInteger(totalAfter)) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  return transition(command, kind, bucket, amount, before, after, balance);
}

export function grantPaidCredits(command: CreditGrantCommand): PrepaidCreditResult<CreditTransition> {
  return addCredits(command, 'paid_grant', 'paid', command.amount);
}

export function grantTrialCredits(command: CreditGrantCommand): PrepaidCreditResult<CreditTransition> {
  return addCredits(command, 'trial_grant', 'trial', command.amount);
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
  return addCredits(command, 'referral_award', 'referral', amount);
}

export function debitRegularEntry(command: CreditDebitCommand): PrepaidCreditResult<CreditTransition> {
  if (!validBalance(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (command.amount !== 1) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  const eligible = command.balance.paid + command.balance.referral + command.balance.trial;
  if (!Number.isSafeInteger(eligible) || eligible < command.amount) {
    return { ok: false, error: 'INSUFFICIENT_ELIGIBLE_CREDITS' };
  }

  // Paid, referral, and converted Trial credits are eligible for regular
  // entries. Keep the source auditable with a stable allocation for retries.
  const paidDebit = Math.min(command.amount, command.balance.paid);
  const referralDebit = Math.min(command.amount - paidDebit, command.balance.referral);
  const trialDebit = command.amount - paidDebit - referralDebit;
  return transition(
    command,
    'regular_entry_debit',
    paidDebit > 0 ? 'paid' : referralDebit > 0 ? 'referral' : 'trial',
    command.amount,
    eligible,
    eligible - command.amount,
    { paid: command.balance.paid - paidDebit, referral: command.balance.referral - referralDebit, trial: command.balance.trial - trialDebit },
  );
}

export function debitSubscriberRenewal(command: CreditDebitCommand): PrepaidCreditResult<CreditTransition> {
  if (!validBalance(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (!isValidPositiveInteger(command.amount)) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  if (command.balance.paid < command.amount) return { ok: false, error: 'INSUFFICIENT_PAID_CREDITS' };
  const balance = {
    paid: command.balance.paid - command.amount,
    referral: command.balance.referral,
    trial: command.balance.trial,
  };
  const totalAfter = balance.paid + balance.referral + balance.trial;
  if (!Number.isSafeInteger(totalAfter)) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  return transition(
    command,
    'subscriber_renewal_debit',
    'paid',
    command.amount,
    command.balance.paid,
    balance.paid,
    balance,
  );
}

export function restoreCredits(command: CreditRestoreCommand): PrepaidCreditResult<CreditTransition> {
  if (!validBalance(command.balance)) return { ok: false, error: 'INVALID_CREDIT_BALANCE' };
  if (!isValidPositiveInteger(command.amount)) return { ok: false, error: 'INVALID_CREDIT_AMOUNT' };
  const before = command.balance[command.bucket];
  const after = before + command.amount;
  if (!Number.isSafeInteger(after) || after > MAX_CREDITS) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  const balance = { ...command.balance, [command.bucket]: after };
  const totalAfter = balance.paid + balance.referral + balance.trial;
  if (!Number.isSafeInteger(totalAfter)) return { ok: false, error: 'CREDIT_BALANCE_OVERFLOW' };
  return transition(command, 'correction_restore', command.bucket, command.amount, before, after, balance);
}

export function materializeCreditLedgerEntry(entry: Omit<CreditLedgerEntry, 'entryId'>): PrepaidCreditResult<CreditLedgerEntry> {
  if (
    !entry.garageId
      || !entry.actorUid
      || !entry.actorRole
      || !entry.reason
      || !entry.reference
      || !entry.occurredAt
      || !entry.idempotencyKey
      || !isValidPositiveInteger(entry.amount)
      || !isValidNonNegativeInteger(entry.balanceBefore)
      || !isValidNonNegativeInteger(entry.balanceAfter)
      || entry.balanceAfter < 0
  ) {
    return { ok: false, error: 'INVALID_LEDGER_ENTRY' };
  }
  return {
    ok: true,
    value: {
      ...entry,
      entryId: `${entry.garageId}:${entry.kind}:${entry.idempotencyKey}:${encodeURIComponent(entry.reference)}:${encodeURIComponent(entry.occurredAt)}:${entry.balanceBefore}:${entry.balanceAfter}`,
    },
  };
}
