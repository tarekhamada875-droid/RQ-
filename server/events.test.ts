import { describe, expect, it } from 'vitest';
import { recordDomainEventInTransaction, type DomainEventType, type EventPayload } from './events';

type EventFixture = {
  eventType: DomainEventType;
  aggregateType: 'vehicle' | 'delegate' | 'recharge' | 'wallet';
  amountField: string;
  errorCode: string;
  payload: EventPayload;
};

const eventFixtures: EventFixture[] = [
  { eventType: 'vehicle_exited', aggregateType: 'vehicle', amountField: 'cost', errorCode: 'INVALID_VEHICLE_EXIT_PAYLOAD', payload: { cost: 10 } },
  { eventType: 'vehicle_refunded', aggregateType: 'vehicle', amountField: 'refundAmount', errorCode: 'INVALID_REFUND_PAYLOAD', payload: { refundAmount: 10, accountingDate: '2026-10-15', accountingPolicy: 'refund_on_refund_date' } },
  { eventType: 'recharge_approved', aggregateType: 'recharge', amountField: 'amount', errorCode: 'INVALID_RECHARGE_PAYLOAD', payload: { amount: 10 } },
  { eventType: 'wallet_topup_approved', aggregateType: 'wallet', amountField: 'amount', errorCode: 'INVALID_WALLET_TOPUP_PAYLOAD', payload: { amount: 10 } },
  { eventType: 'wallet_debited', aggregateType: 'wallet', amountField: 'amount', errorCode: 'INVALID_WALLET_DEBIT_PAYLOAD', payload: { amount: 10 } },
  { eventType: 'package_purchased', aggregateType: 'recharge', amountField: 'amount', errorCode: 'INVALID_PACKAGE_PURCHASE_PAYLOAD', payload: { amount: 10 } },
  { eventType: 'delegate_settled', aggregateType: 'delegate', amountField: 'previousRechargedAmount', errorCode: 'INVALID_DELEGATE_SETTLEMENT_PAYLOAD', payload: { delegateId: 'd1', settlementId: 's1', previousRechargedAmount: 10, settledAt: '2026-10-15T00:00:00.000Z' } },
  { eventType: 'commission_earned', aggregateType: 'delegate', amountField: 'commissionAmount', errorCode: 'INVALID_COMMISSION_PAYLOAD', payload: { delegateId: 'd1', commissionAmount: 10, sourceRechargeId: 'r1', earnedAt: '2026-10-15T00:00:00.000Z' } }
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
  it.each(eventFixtures)('accepts a valid two-decimal amount for $eventType', (fixture) => {
    const value = writeEvent(fixture, { ...fixture.payload, [fixture.amountField]: 0.29 });
    expect(value.payload[fixture.amountField]).toBe(0.29);
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

  it.each([['originalAmount', -1], ['discountAmount', Number.NaN], ['commission', 1.239]] as const)(
    'rejects malformed optional recharge money field %s',
    (field, value) => {
      const fixture = eventFixtures.find((candidate) => candidate.eventType === 'recharge_approved')!;
      expect(() => writeEvent(fixture, { ...fixture.payload, [field]: value })).toThrow('INVALID_RECHARGE_PAYLOAD');
    }
  );
});
