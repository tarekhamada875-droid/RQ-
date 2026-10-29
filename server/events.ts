import crypto from 'crypto';
import { getTraceContext } from './operationTrace';
import { parseMoneyAmount } from './money';

export type DomainEventType =
  | 'vehicle_entered'
  | 'vehicle_exited'
  | 'vehicle_refunded'
  | 'vehicle_deleted'
  | 'subscriber_created'
  | 'subscriber_renewed'
  | 'subscriber_updated'
  | 'subscriber_deleted'
  | 'recharge_approved'
  | 'wallet_topup_approved'
  | 'delegate_settled'
  | 'commission_earned'
  | 'prepaid_credit_grant_paid';

type AggregateType = 'vehicle' | 'subscriber' | 'delegate' | 'recharge' | 'wallet' | 'credit_grant';
export type EventPayload = Record<string, unknown>;

export interface DelegateSettledPayload extends EventPayload {
  delegateId: string;
  settlementId: string;
  previousRechargedAmount: number;
  settledAt: string;
}
export interface VehicleRefundedPayload extends EventPayload {
  refundAmount: number;
  accountingDate: string;
  accountingPolicy: 'refund_on_refund_date';
}
export interface CommissionEarnedPayload extends EventPayload {
  delegateId: string;
  commissionAmount: number;
  /** Legacy source retained for reading old event payloads. */
  sourceRechargeId?: string;
  /** New commissions are earned from a garage's first paid credit grant. */
  sourceCreditGrantId?: string;
  earnedAt: string;
}

export interface DomainEvent {
  eventId: string;
  schemaVersion: number;
  garageId: string;
  aggregateType: AggregateType;
  aggregateId: string;
  eventType: DomainEventType;
  occurredAt: string;
  recordedAt: string;
  actorUid: string;
  actorRole: string;
  idempotencyKey?: string;
  correlationId?: string;
  operationId?: string;
  payload: EventPayload;
}

export interface CreateEventParams {
  garageId: string;
  aggregateType: AggregateType;
  aggregateId: string;
  eventType: DomainEventType;
  actorUid: string;
  actorRole: string;
  idempotencyKey?: string;
  correlationId?: string;
  operationId?: string;
  payload: EventPayload;
  eventCollectionPath?: string;
}

const EVENT_AGGREGATE_TYPES: Record<DomainEventType, AggregateType> = {
  vehicle_entered: 'vehicle', vehicle_exited: 'vehicle', vehicle_refunded: 'vehicle', vehicle_deleted: 'vehicle',
  subscriber_created: 'subscriber', subscriber_renewed: 'subscriber', subscriber_updated: 'subscriber', subscriber_deleted: 'subscriber',
  recharge_approved: 'recharge', wallet_topup_approved: 'wallet', delegate_settled: 'delegate', commission_earned: 'delegate', prepaid_credit_grant_paid: 'credit_grant'
};
const SENSITIVE_KEYS = /^(pin|password|token|secret|privatekey|serviceaccount|authorization)$/i;

type MoneyEventRule = {
  required: readonly string[];
  optional?: readonly string[];
  errorCode: string;
};

const MONEY_EVENT_RULES: Partial<Record<DomainEventType, MoneyEventRule>> = {
  vehicle_exited: { required: ['cost'], errorCode: 'INVALID_VEHICLE_EXIT_PAYLOAD' },
  vehicle_refunded: { required: ['refundAmount'], errorCode: 'INVALID_REFUND_PAYLOAD' },
  recharge_approved: {
    required: ['amount'],
    optional: ['originalAmount', 'discountAmount', 'commission'],
    errorCode: 'INVALID_RECHARGE_PAYLOAD'
  },
  wallet_topup_approved: { required: ['amount'], errorCode: 'INVALID_WALLET_TOPUP_PAYLOAD' },
  delegate_settled: { required: ['previousRechargedAmount'], errorCode: 'INVALID_DELEGATE_SETTLEMENT_PAYLOAD' },
  commission_earned: { required: ['commissionAmount'], errorCode: 'INVALID_COMMISSION_PAYLOAD' },
  prepaid_credit_grant_paid: { required: ['amount'], errorCode: 'INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD' }
};

function isValidEventMoneyAmount(value: unknown): value is number {
  return typeof value === 'number' && parseMoneyAmount(value) !== null;
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => SENSITIVE_KEYS.test(key) ? [] : [[key, redactSensitive(child)]]));
}

function validateEventParams(params: CreateEventParams): void {
  if (EVENT_AGGREGATE_TYPES[params.eventType] !== params.aggregateType) throw new Error('INVALID_EVENT_AGGREGATE');
  if (!params.aggregateId || !params.eventType || !params.actorUid || !params.actorRole) throw new Error('INVALID_EVENT_ENVELOPE');
  if (JSON.stringify(params.payload).length > 32_000) throw new Error('EVENT_PAYLOAD_TOO_LARGE');
  const moneyRule = MONEY_EVENT_RULES[params.eventType];
  if (moneyRule) {
    for (const field of moneyRule.required) {
      if (!isValidEventMoneyAmount(params.payload[field])) throw new Error(moneyRule.errorCode);
    }
    for (const field of moneyRule.optional || []) {
      const value = params.payload[field];
      if (value !== undefined && !isValidEventMoneyAmount(value)) throw new Error(moneyRule.errorCode);
    }
  }
  if (params.eventType === 'delegate_settled') {
    const p = params.payload as Partial<DelegateSettledPayload>;
    if (!p.delegateId || !p.settlementId || typeof p.previousRechargedAmount !== 'number' || !p.settledAt) throw new Error('INVALID_DELEGATE_SETTLEMENT_PAYLOAD');
  }
  if (params.eventType === 'vehicle_refunded') {
    const p = params.payload as Partial<VehicleRefundedPayload>;
    if (typeof p.refundAmount !== 'number' || !p.accountingDate || p.accountingPolicy !== 'refund_on_refund_date') throw new Error('INVALID_REFUND_PAYLOAD');
  }
  if (params.eventType === 'commission_earned') {
    const p = params.payload as Partial<CommissionEarnedPayload>;
    if (!p.delegateId || typeof p.commissionAmount !== 'number' || !(p.sourceCreditGrantId || p.sourceRechargeId) || !p.earnedAt) throw new Error('INVALID_COMMISSION_PAYLOAD');
  }
  if (params.eventType === 'prepaid_credit_grant_paid') {
    const amount = params.payload.amount;
    const creditAmount = params.payload.creditAmount;
    if (!Number.isSafeInteger(creditAmount) || Number(creditAmount) < 1 || amount !== creditAmount || typeof params.payload.creditLedgerEntryId !== 'string' || !params.payload.creditLedgerEntryId) {
      throw new Error('INVALID_CREDIT_GRANT_PAYMENT_PAYLOAD');
    }
  }
}

export function recordDomainEventInTransaction(t: any, adminDb: any, params: CreateEventParams): DomainEvent {
  validateEventParams(params);
  const timestamp = new Date();
  const eventId = `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const trace = getTraceContext();
  const event: DomainEvent = {
    eventId,
    schemaVersion: 1,
    garageId: params.garageId,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    eventType: params.eventType,
    occurredAt: timestamp.toISOString(),
    recordedAt: timestamp.toISOString(),
    actorUid: params.actorUid || 'system',
    actorRole: params.actorRole || 'unknown',
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    ...(params.correlationId || trace?.correlationId ? { correlationId: params.correlationId || trace?.correlationId } : {}),
    ...(params.operationId || trace?.operationId ? { operationId: params.operationId || trace?.operationId } : {}),
    payload: redactSensitive(params.payload) as EventPayload
  };
  const eventPath = params.eventCollectionPath || `garages/${params.garageId}/events`;
  t.set(adminDb.doc(`${eventPath}/${eventId}`), event);
  return event;
}
