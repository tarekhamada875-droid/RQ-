import { describe, expect, it } from 'vitest';
import { recordDomainEventInTransaction, type DomainEventType, type EventPayload } from './events';

type EventFixture = {
  eventType: DomainEventType;
  aggregateType: 'vehicle' | 'delegate' | 'recharge' | 'wallet' | 'credit_grant';
  amountField: string;
  errorCode: string;
  payload: EventPayload;
};

const eventFixtures: EventFixture[] = [
  { eventType: 'vehicle_exited', aggregateType: 'vehicle', amountField: 'cost', errorCode: 'INVALID_VEHICLE_EXIT_PAYLOAD', payload: { cost: 10 } },
  { eventType: 'vehicle_refunded', aggregateType: 'vehicle', amountField: 'refundAmount', errorCode: 'INVALID_REFUND_PAYLOAD', payload: { refundAmount: 10, accountingDate: '2026-10-15', accountingPolicy: 'refund_on_refund_date' } },
  { eventType: 'recharge_approved', aggregateType: 'recharge', amountField: 'amount', errorCode: 'INVALID_RECHARGE_PAYLOAD', payload: { amount: 10 } },
  { eventType: 'wallet_topup_approved', aggregateType: 'wallet', amountField: 'amount', errorCode: 'INVALID_WALLET_TOPUP_PAYLOAD', payload: { amount: 10 } },
  { eventType: 'delegate_settled', aggregateType: 'delegate', amountField: 'previousRechargedAmount', errorCode: 'INVALID_DELEGATE_SETTLEMENT_PAYLOAD', payload: { delegateId: 'd1', settlementId: 's1', previousRechargedAmount: 10, settledAt: '2026-10-15T00:00:00.000Z' } },
  { eventType: 'commission_earned', aggregateType: 'delegate', amountField: 'commissionAmount', errorCode: 'INVALID_COMMISSION_PAYLOAD', payload: { delegateId: 'd1', commissionAmount: 10, sourceRechargeId: 'r1', earnedAt: '2026-10-15T00:00:00.000Z' } },
  { eventType: 'prepaid_credit_grant_paid', aggregateType: 'credit_grant', amountField: 'amount', errorCode: 'INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD', payload: { amount: 10, creditAmount: 10, creditLedgerEntryId: 'garage-1:key-1' } },
];

function writeEvent(fixture: EventFixture, payload: EventPayload, onWrite: () => void = () => undefined) {
  return recordDomainEventInTransaction(
    { set: onWrite },
    { doc: (path: string) => ({ path }) },
    {
      garageId: 'garage-1',
      aggregateType: fixture.aggregateType,
      aggregateId: 'aggregate-1',
      eventType: fixture.eventType,
      actorUid: 'admin-1',
      actorRole: 'admin',
      payload
    }
  );
}

describe('domain event money invariants', () => {
  it.each(eventFixtures)('accepts a valid amount for $eventType', (fixture) => {
    const amount = fixture.eventType === 'prepaid_credit_grant_paid' ? 10 : 0.29;
    const value = writeEvent(fixture, { ...fixture.payload, [fixture.amountField]: amount });
    expect(value.payload[fixture.amountField]).toBe(amount);
  });

  it.each(eventFixtures.flatMap((fixture) => [
    { fixture, value: undefined, label: 'missing' },
    { fixture, value: -0.01, label: 'negative' },
    { fixture, value: Number.NaN, label: 'NaN' },
    { fixture, value: Number.POSITIVE_INFINITY, label: 'infinite' },
    { fixture, value: 1.234, label: 'more than two decimal places' },
    { fixture, value: '10.00', label: 'numeric string' }
  ]))('rejects $label money in $fixture.eventType without writing the event', ({ fixture, value }) => {
    let writes = 0;
    expect(() => writeEvent(fixture, { ...fixture.payload, [fixture.amountField]: value }, () => { writes += 1; }))
      .toThrow(fixture.errorCode);
    expect(writes).toBe(0);
  });

  it('rejects paid-credit events where the EGP amount and credit count differ', () => {
    const fixture = eventFixtures.find((candidate) => candidate.eventType === 'prepaid_credit_grant_paid')!;
    expect(() => writeEvent(fixture, { ...fixture.payload, creditAmount: 9 })).toThrow('INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD');
    expect(() => writeEvent(fixture, { ...fixture.payload, creditLedgerEntryId: '' })).toThrow('INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD');
  });

  it.each([['originalAmount', -1], ['discountAmount', Number.NaN], ['commission', 1.239]] as const)(
    'rejects malformed optional recharge money field %s',
    (field, value) => {
      const fixture = eventFixtures.find((candidate) => candidate.eventType === 'recharge_approved')!;
      expect(() => writeEvent(fixture, { ...fixture.payload, [field]: value })).toThrow('INVALID_RECHARGE_PAYLOAD');
    }
  );
});
