import { describe, expect, it } from 'vitest';
import {
  awardReferralCredits,
  debitRegularEntry,
  debitSubscriberRenewal,
  grantPaidCredits,
  materializeCreditLedgerEntry,
  restoreCredits,
} from './domain/prepaidCreditLedger';

const base = {
  garageId: 'garage-1',
  actorUid: 'admin-1',
  actorRole: 'admin',
  reason: 'approved offline payment',
  reference: 'payment-1',
  occurredAt: '2026-10-17T09:00:00.000Z',
  idempotencyKey: 'operation-1',
};

describe('prepaid credit ledger', () => {
  it('grants only positive integer paid credits without touching referral credits', () => {
    expect(grantPaidCredits({ ...base, balance: { trial: 0, paid: 5, referral: 2 }, amount: 10 })).toMatchObject({
      ok: true,
      value: {
        balance: { trial: 0, paid: 15, referral: 2 },
        entry: { kind: 'paid_grant', bucket: 'paid', amount: 10, balanceBefore: 5, balanceAfter: 15 },
      },
    });
    expect(grantPaidCredits({ ...base, balance: { trial: 0, paid: 0, referral: 0 }, amount: 1.5 })).toEqual({ ok: false, error: 'INVALID_CREDIT_AMOUNT' });
    expect(grantPaidCredits({ ...base, balance: { trial: 0, paid: Number.MAX_SAFE_INTEGER, referral: 0 }, amount: 1 })).toEqual({ ok: false, error: 'CREDIT_BALANCE_OVERFLOW' });
    expect(grantPaidCredits({ ...base, balance: { paid: Number.MAX_SAFE_INTEGER - 1, referral: 1, trial: 0 }, amount: 1 })).toEqual({ ok: false, error: 'CREDIT_BALANCE_OVERFLOW' });
  });

  it('awards exactly 20 referral credits only after the first paid grant', () => {
    expect(awardReferralCredits({
      ...base,
      balance: { trial: 0, paid: 0, referral: 0 },
      referrerGarageId: 'referrer-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: true,
      firstPaidGrant: true,
    })).toMatchObject({ ok: true, value: { balance: { trial: 0, paid: 0, referral: 20 }, entry: { kind: 'referral_award', amount: 20 } } });

    expect(awardReferralCredits({
      ...base,
      balance: { trial: 0, paid: 0, referral: 0 },
      referrerGarageId: 'referrer-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: false,
      firstPaidGrant: true,
    })).toEqual({ ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' });
    expect(awardReferralCredits({
      ...base,
      balance: { trial: 0, paid: 0, referral: 0 },
      referrerGarageId: 'garage-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: true,
      firstPaidGrant: true,
    })).toEqual({ ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' });
  });

  it('debits one regular entry from the combined eligible pool and records the source', () => {
    expect(debitRegularEntry({ ...base, balance: { trial: 0, paid: 2, referral: 1 }, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: { trial: 0, paid: 1, referral: 1 }, entry: { kind: 'regular_entry_debit', bucket: 'paid', amount: 1 } },
    });
    expect(debitRegularEntry({ ...base, balance: { trial: 0, paid: 0, referral: 1 }, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: { trial: 0, paid: 0, referral: 0 }, entry: { kind: 'regular_entry_debit', bucket: 'referral', amount: 1 } },
    });
    expect(debitRegularEntry({ ...base, balance: { trial: 0, paid: 0, referral: 0 }, amount: 1 })).toEqual({ ok: false, error: 'INSUFFICIENT_ELIGIBLE_CREDITS' });
  });

  it('allows subscriber renewals only from paid credits', () => {
    expect(debitSubscriberRenewal({ ...base, balance: { trial: 0, paid: 5, referral: 20 }, amount: 5 })).toMatchObject({
      ok: true,
      value: { balance: { trial: 0, paid: 0, referral: 20 }, entry: { kind: 'subscriber_renewal_debit', bucket: 'paid', amount: 5 } },
    });
    expect(debitSubscriberRenewal({ ...base, balance: { trial: 0, paid: 0, referral: 20 }, amount: 5 })).toEqual({ ok: false, error: 'INSUFFICIENT_PAID_CREDITS' });
    expect(debitSubscriberRenewal({
      ...base,
      balance: { paid: 5, referral: Number.MAX_SAFE_INTEGER, trial: 1 },
      amount: 1,
    })).toEqual({ ok: false, error: 'CREDIT_BALANCE_OVERFLOW' });
  });

  it('restores the original bucket for an authorized correction and rejects unsafe total balances', () => {
    expect(restoreCredits({ ...base, balance: { trial: 0, paid: 0, referral: 4 }, amount: 1, bucket: 'referral' })).toMatchObject({
      ok: true,
      value: { balance: { trial: 0, paid: 0, referral: 5 }, entry: { kind: 'correction_restore', bucket: 'referral', amount: 1 } },
    });
    expect(restoreCredits({ ...base, balance: { paid: Number.MAX_SAFE_INTEGER - 1, referral: 1, trial: 0 }, amount: 1, bucket: 'paid' })).toEqual({ ok: false, error: 'CREDIT_BALANCE_OVERFLOW' });
  });

  it('materializes a deterministic auditable entry id from garage and idempotency key', () => {
    const result = materializeCreditLedgerEntry({
      ...base,
      kind: 'paid_grant',
      bucket: 'paid',
      amount: 10,
      balanceBefore: 0,
      balanceAfter: 10,
    });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ entryId: 'garage-1:paid_grant:operation-1' }),
    });
  });

  it('keeps different operation kinds distinct when a key is reused', () => {
    const paidGrant = materializeCreditLedgerEntry({
      ...base,
      kind: 'paid_grant',
      bucket: 'paid',
      amount: 10,
      balanceBefore: 0,
      balanceAfter: 10,
    });
    const restore = materializeCreditLedgerEntry({
      ...base,
      kind: 'correction_restore',
      bucket: 'paid',
      amount: 1,
      balanceBefore: 10,
      balanceAfter: 11,
    });

    expect(paidGrant.ok && restore.ok).toBe(true);
    if (paidGrant.ok && restore.ok) {
      expect(paidGrant.value.entryId).not.toBe(restore.value.entryId);
      expect(paidGrant.value.entryId).toBe('garage-1:paid_grant:operation-1');
      expect(restore.value.entryId).toBe('garage-1:correction_restore:operation-1');
    }
  });
});

describe('Trial credits', () => {
  it('grants and debits Trial credits for regular entries but not renewals', () => {
    expect(debitRegularEntry({ ...base, balance: { paid: 0, referral: 0, trial: 2 }, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: { paid: 0, referral: 0, trial: 1 }, entry: { kind: 'regular_entry_debit', bucket: 'trial', amount: 1 } },
    });
    expect(debitSubscriberRenewal({ ...base, balance: { paid: 0, referral: 0, trial: 5 }, amount: 5 })).toEqual({ ok: false, error: 'INSUFFICIENT_PAID_CREDITS' });
  });

  it('restores a Trial credit to the Trial bucket', () => {
    expect(restoreCredits({ ...base, balance: { paid: 0, referral: 0, trial: 1 }, amount: 1, bucket: 'trial' })).toMatchObject({
      ok: true,
      value: { balance: { paid: 0, referral: 0, trial: 2 }, entry: { kind: 'correction_restore', bucket: 'trial', amount: 1 } },
    });
  });
});
