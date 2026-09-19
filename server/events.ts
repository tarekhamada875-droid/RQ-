import crypto from 'crypto';
import { getTraceContext } from './operationTrace';

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
  | 'wallet_debited'
  | 'package_purchased'
  | 'recharge_rejected'
  | 'delegate_settled'
  | 'commission_earned';

type AggregateType = 'vehicle' | 'subscriber' | 'delegate' | 'recharge' | 'wallet';
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
  sourceRechargeId: string;
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
  recharge_approved: 'recharge', wallet_topup_approved: 'wallet', wallet_debited: 'wallet', package_purchased: 'recharge', recharge_rejected: 'recharge', delegate_settled: 'delegate', commission_earned: 'delegate'
};
const SENSITIVE_KEYS = /^(pin|password|token|secret|privatekey|serviceaccount|authorization)$/i;

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => SENSITIVE_KEYS.test(key) ? [] : [[key, redactSensitive(child)]]));
}

function validateEventParams(params: CreateEventParams): void {
  if (EVENT_AGGREGATE_TYPES[params.eventType] !== params.aggregateType) throw new Error('INVALID_EVENT_AGGREGATE');
  if (!params.aggregateId || !params.eventType || !params.actorUid || !params.actorRole) throw new Error('INVALID_EVENT_ENVELOPE');
  if (JSON.stringify(params.payload).length > 32_000) throw new Error('EVENT_PAYLOAD_TOO_LARGE');
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
    if (!p.delegateId || typeof p.commissionAmount !== 'number' || !p.sourceRechargeId || !p.earnedAt) throw new Error('INVALID_COMMISSION_PAYLOAD');
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
    idempotencyKey: params.idempotencyKey || undefined,
    ...(params.correlationId || trace?.correlationId ? { correlationId: params.correlationId || trace?.correlationId } : {}),
    ...(params.operationId || trace?.operationId ? { operationId: params.operationId || trace?.operationId } : {}),
    payload: redactSensitive(params.payload) as EventPayload
  };
  const eventPath = params.eventCollectionPath || `garages/${params.garageId}/events`;
  t.set(adminDb.doc(`${eventPath}/${eventId}`), event);
  return event;
}
