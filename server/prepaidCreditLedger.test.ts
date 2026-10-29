import { describe, expect, it } from 'vitest';
import {
  applyCorrection,
  awardReferralCredits,
  debitRegularEntry,
  debitSubscriberRenewal,
  grantPaidCredits,
  grantTrialCredits,
  materializeCreditLedgerEntry,
  restoreCredits,
} from './domain/prepaidCreditLedger';

const base = {
  garageId: 'garage-1',
  actorUid: 'admin-1',
  actorRole: 'admin',
  reason: 'approved offline payment',
  occurredAt: '2026-10-17T09:00:00.000Z',
  idempotencyKey: 'operation-1',
};

describe('prepaid credit ledger (single bucket)', () => {
  it('grants only positive integer paid credits to the single balance', () => {
    expect(grantPaidCredits({ ...base, balance: 5, amount: 10 })).toMatchObject({
      ok: true,
      value: {
        balance: 15,
        entry: { kind: 'paid_grant', amount: 10, balanceBefore: 5, balanceAfter: 15 },
      },
    });
    expect(grantPaidCredits({ ...base, balance: 0, amount: 1.5 })).toEqual({ ok: false, error: 'INVALID_CREDIT_AMOUNT' });
    expect(grantPaidCredits({ ...base, balance: Number.MAX_SAFE_INTEGER, amount: 1 })).toEqual({ ok: false, error: 'CREDIT_BALANCE_OVERFLOW' });
  });

  it('awards exactly 20 referral credits only after the first paid grant', () => {
    expect(awardReferralCredits({
      ...base,
      balance: 0,
      referrerGarageId: 'referrer-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: true,
      firstPaidGrant: true,
    })).toMatchObject({ ok: true, value: { balance: 20, entry: { kind: 'referral_award', amount: 20 } } });

    expect(awardReferralCredits({
      ...base,
      balance: 0,
      referrerGarageId: 'referrer-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: false,
      firstPaidGrant: true,
    })).toEqual({ ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' });
    expect(awardReferralCredits({
      ...base,
      balance: 0,
      referrerGarageId: 'garage-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: true,
      firstPaidGrant: true,
    })).toEqual({ ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' });
  });

  it('debits one regular entry from the single balance', () => {
    expect(debitRegularEntry({ ...base, balance: 2, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: 1, entry: { kind: 'regular_entry_debit', amount: 1 } },
    });
    expect(debitRegularEntry({ ...base, balance: 0, amount: 1 })).toEqual({ ok: false, error: 'INSUFFICIENT_CREDITS' });
  });

  it('allows subscriber renewals from any credits (single bucket)', () => {
    expect(debitSubscriberRenewal({ ...base, balance: 5, amount: 5 })).toMatchObject({
      ok: true,
      value: { balance: 0, entry: { kind: 'subscriber_renewal_debit', amount: 5 } },
    });
    // Renewals now draw from the single bucket; trial/referral-only balances can renew.
    expect(debitSubscriberRenewal({ ...base, balance: 20, amount: 5 })).toMatchObject({
      ok: true,
      value: { balance: 15 },
    });
    expect(debitSubscriberRenewal({ ...base, balance: 0, amount: 5 })).toEqual({ ok: false, error: 'INSUFFICIENT_CREDITS' });
    // Debiting from MAX_SAFE_INTEGER no longer overflows: subtracting from a single
    // bucket cannot exceed the safe-integer ceiling, only adding can.
    expect(debitSubscriberRenewal({ ...base, balance: Number.MAX_SAFE_INTEGER, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: Number.MAX_SAFE_INTEGER - 1 },
    });
  });

  it('restores credits via the authorized-deletion-restore path', () => {
    expect(restoreCredits({ ...base, balance: 4, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: 5, entry: { kind: 'authorized_deletion_restore', amount: 1 } },
    });
    expect(restoreCredits({ ...base, balance: Number.MAX_SAFE_INTEGER - 1, amount: 2 })).toEqual({ ok: false, error: 'CREDIT_BALANCE_OVERFLOW' });
  });

  it('applies admin corrections that add or subtract without going negative', () => {
    expect(applyCorrection({ ...base, balance: 10, amount: 5 })).toMatchObject({
      ok: true,
      value: { balance: 15, entry: { kind: 'correction_delta', amount: 5 } },
    });
    expect(applyCorrection({ ...base, balance: 10, amount: -5 })).toMatchObject({
      ok: true,
      value: { balance: 5, entry: { kind: 'correction_delta', amount: -5 } },
    });
    expect(applyCorrection({ ...base, balance: 3, amount: -5 })).toEqual({ ok: false, error: 'INSUFFICIENT_CREDITS' });
    expect(applyCorrection({ ...base, balance: 5, amount: 0 })).toEqual({ ok: false, error: 'INVALID_CREDIT_AMOUNT' });
  });

  it('materializes a deterministic auditable entry id from the operation details', () => {
    const result = materializeCreditLedgerEntry({
      ...base,
      kind: 'paid_grant',
      amount: 10,
      balanceBefore: 0,
      balanceAfter: 10,
    });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ entryId: 'garage-1:paid_grant:operation-1:2026-10-17T09%3A00%3A00.000Z:0:10' }),
    });
  });

  it('does not overwrite a prior ledger entry when the same key is reused after expiry for a new balance transition', () => {
    const first = materializeCreditLedgerEntry({
      ...base,
      kind: 'paid_grant',
      amount: 10,
      balanceBefore: 0,
      balanceAfter: 10,
    });
    const second = materializeCreditLedgerEntry({
      ...base,
      kind: 'paid_grant',
      amount: 10,
      balanceBefore: 10,
      balanceAfter: 20,
      occurredAt: '2026-10-18T09:00:00.000Z',
    });

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.idempotencyKey).toBe(second.value.idempotencyKey);
      expect(first.value.entryId).not.toBe(second.value.entryId);
    }
  });

  it('keeps different operation kinds distinct when a key is reused', () => {
    const paidGrant = materializeCreditLedgerEntry({
      ...base,
      kind: 'paid_grant',
      amount: 10,
      balanceBefore: 0,
      balanceAfter: 10,
    });
    const correction = materializeCreditLedgerEntry({
      ...base,
      kind: 'correction_delta',
      amount: 1,
      balanceBefore: 10,
      balanceAfter: 11,
    });

    expect(paidGrant.ok && correction.ok).toBe(true);
    if (paidGrant.ok && correction.ok) {
      expect(paidGrant.value.entryId).not.toBe(correction.value.entryId);
      expect(paidGrant.value.entryId).toBe('garage-1:paid_grant:operation-1:2026-10-17T09%3A00%3A00.000Z:0:10');
      expect(correction.value.entryId).toBe('garage-1:correction_delta:operation-1:2026-10-17T09%3A00%3A00.000Z:10:11');
    }
  });
});

describe('Trial credits (single bucket)', () => {
  it('grants trial credits to the single balance', () => {
    expect(grantTrialCredits({ ...base, balance: 0, amount: 100 })).toMatchObject({
      ok: true,
      value: { balance: 100, entry: { kind: 'trial_grant', amount: 100 } },
    });
  });

  it('allows trial credits to be debited for both regular entries and renewals', () => {
    expect(debitRegularEntry({ ...base, balance: 2, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: 1, entry: { kind: 'regular_entry_debit', amount: 1 } },
    });
    expect(debitSubscriberRenewal({ ...base, balance: 5, amount: 5 })).toMatchObject({
      ok: true,
      value: { balance: 0 },
    });
  });

  it('restores a credit via the authorized-deletion-restore kind', () => {
    expect(restoreCredits({ ...base, balance: 1, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: 2, entry: { kind: 'authorized_deletion_restore', amount: 1 } },
    });
  });
});
