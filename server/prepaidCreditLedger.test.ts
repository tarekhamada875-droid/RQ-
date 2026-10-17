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
    expect(grantPaidCredits({ ...base, balance: { paid: 5, referral: 2 }, amount: 10 })).toMatchObject({
      ok: true,
      value: {
        balance: { paid: 15, referral: 2 },
        entry: { kind: 'paid_grant', bucket: 'paid', amount: 10, balanceBefore: 5, balanceAfter: 15 },
      },
    });
    expect(grantPaidCredits({ ...base, balance: { paid: 0, referral: 0 }, amount: 1.5 })).toEqual({ ok: false, error: 'INVALID_CREDIT_AMOUNT' });
    expect(grantPaidCredits({ ...base, balance: { paid: Number.MAX_SAFE_INTEGER, referral: 0 }, amount: 1 })).toEqual({ ok: false, error: 'CREDIT_BALANCE_OVERFLOW' });
  });

  it('awards exactly 20 referral credits only after the first paid grant', () => {
    expect(awardReferralCredits({
      ...base,
      balance: { paid: 0, referral: 0 },
      referrerGarageId: 'referrer-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: true,
      firstPaidGrant: true,
    })).toMatchObject({ ok: true, value: { balance: { paid: 0, referral: 20 }, entry: { kind: 'referral_award', amount: 20 } } });

    expect(awardReferralCredits({
      ...base,
      balance: { paid: 0, referral: 0 },
      referrerGarageId: 'referrer-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: false,
      firstPaidGrant: true,
    })).toEqual({ ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' });
    expect(awardReferralCredits({
      ...base,
      balance: { paid: 0, referral: 0 },
      referrerGarageId: 'garage-1',
      referredGarageId: 'garage-1',
      paidGrantConfirmed: true,
      firstPaidGrant: true,
    })).toEqual({ ok: false, error: 'REFERRAL_AWARD_NOT_ELIGIBLE' });
  });

  it('debits one regular entry from the combined eligible pool and records the source', () => {
    expect(debitRegularEntry({ ...base, balance: { paid: 2, referral: 1 }, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: { paid: 1, referral: 1 }, entry: { kind: 'regular_entry_debit', bucket: 'paid', amount: 1 } },
    });
    expect(debitRegularEntry({ ...base, balance: { paid: 0, referral: 1 }, amount: 1 })).toMatchObject({
      ok: true,
      value: { balance: { paid: 0, referral: 0 }, entry: { kind: 'regular_entry_debit', bucket: 'referral', amount: 1 } },
    });
    expect(debitRegularEntry({ ...base, balance: { paid: 0, referral: 0 }, amount: 1 })).toEqual({ ok: false, error: 'INSUFFICIENT_ELIGIBLE_CREDITS' });
  });

  it('allows subscriber renewals only from paid credits', () => {
    expect(debitSubscriberRenewal({ ...base, balance: { paid: 5, referral: 20 }, amount: 5 })).toMatchObject({
      ok: true,
      value: { balance: { paid: 0, referral: 20 }, entry: { kind: 'subscriber_renewal_debit', bucket: 'paid', amount: 5 } },
    });
    expect(debitSubscriberRenewal({ ...base, balance: { paid: 0, referral: 20 }, amount: 5 })).toEqual({ ok: false, error: 'INSUFFICIENT_PAID_CREDITS' });
  });

  it('restores the original bucket for an authorized correction', () => {
    expect(restoreCredits({ ...base, balance: { paid: 0, referral: 4 }, amount: 1, bucket: 'referral' })).toMatchObject({
      ok: true,
      value: { balance: { paid: 0, referral: 5 }, entry: { kind: 'correction_restore', bucket: 'referral', amount: 1 } },
    });
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
      value: expect.objectContaining({ entryId: 'garage-1:operation-1' }),
    });
  });
});
