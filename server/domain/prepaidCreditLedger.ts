// Single-bucket prepaid credit ledger.
//
// Previously the system kept three separate running balances per garage
// (paid / referral / trial). As of 2026-10-29 the owner approved collapsing
// them into one balance. The *kind* of every ledger entry is still recorded
// for audit (so you can always look back and see "this 50 came from trial,
// this 500 came from a paid grant, this 10 was a referral bonus, this -50
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
const REFERRAL_AWARD_AMOUNT = 10;

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

// ── Paid-credit-grant payload validation ──────────────────────────────────
//
// Audit ref: Phase 3 / A2 (consolidated audit, 2026-11-06).
//
// A paid-credit-grant event/ledger entry has two amount fields:
//   - amount:           the EGP the customer paid
//   - creditAmount:     the credits granted (= round(amount × creditRate))
//
// When creditRate = 1 (the default), the two are equal. When creditRate ≠ 1
// (e.g. 0.5, 0.8, 2, 10 — the admin-configurable presets), they legitimately
// differ.
//
// Three consumers previously each rolled their own validation that included
// an `amount === creditAmount` equality check:
//   1. server/events.ts:140-154 — validateEventParams (event-shape check)
//   2. server/financialReporting.ts:161-162 — cashCollectedTotal aggregation
//   3. server/financialRoutes.ts:342 — delegate paid-grant history
//
// (1) was correctly relaxed when creditRate was introduced (commit 9ac062a),
// but (2) and (3) were never updated. The result: when an admin picked any
// non-1 preset (0.5/0.8/2/10), every prepaid-credit-grant event was
// silently dropped from:
//   - the financial report's cashCollectedTotal (under-counted revenue)
//   - the delegate's all-time/monthly/current-cycle paid-grant totals
//   - the delegate's recent-grants list
//
// This shared rule validates only shape (positive safe integers + non-empty
// creditLedgerEntryId). It does NOT check the rate relationship — that's
// the credit-grant route's job (it computes creditAmount = round(amount ×
// creditRate) authoritatively). All three consumers now use this rule.

export interface CreditGrantPaymentPayload {
  amount: number;            // EGP the customer paid
  creditAmount: number;      // credits granted
  creditLedgerEntryId: string;
}

export type CreditGrantPayloadError = 'INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD';

export type CreditGrantPayloadResult =
  | { readonly ok: true; readonly value: CreditGrantPaymentPayload }
  | { readonly ok: false; readonly error: CreditGrantPayloadError };

/**
 * Validates the shape of a paid-credit-grant payload. Returns ok with the
 * normalized payload, or err with INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD.
 *
 * Accepts both `amount` and `creditAmount` as positive safe integers
 * (they may legitimately differ when creditRate ≠ 1) and a non-empty
 * `creditLedgerEntryId` string.
 *
 * Use this everywhere you need to answer "is this a well-formed
 * paid-grant payload?" — events.ts (validation), financialReporting.ts
 * (filter), financialRoutes.ts (filter).
 */
export function creditGrantPayloadRule(payload: unknown): CreditGrantPayloadResult {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD' };
  const p = payload as Partial<CreditGrantPaymentPayload>;
  if (
    typeof p.amount !== 'number' || !Number.isSafeInteger(p.amount) || Number(p.amount) < 1
    || typeof p.creditAmount !== 'number' || !Number.isSafeInteger(p.creditAmount) || Number(p.creditAmount) < 1
    || typeof p.creditLedgerEntryId !== 'string' || !p.creditLedgerEntryId
  ) {
    return { ok: false, error: 'INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD' };
  }
  return {
    ok: true,
    value: {
      amount: p.amount,
      creditAmount: p.creditAmount,
      creditLedgerEntryId: p.creditLedgerEntryId,
    },
  };
}
