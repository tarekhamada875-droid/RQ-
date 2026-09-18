import crypto from 'crypto';

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
  | 'recharge_rejected'
  | 'delegate_settled';

type AggregateType = 'vehicle' | 'subscriber' | 'delegate' | 'recharge';

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
  payload: Record<string, unknown>;
}

export interface CreateEventParams {
  garageId: string;
  aggregateType: AggregateType;
  aggregateId: string;
  eventType: DomainEventType;
  actorUid: string;
  actorRole: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
  /** Override the default garages/{garageId}/events collection for non-garage aggregates. */
  eventCollectionPath?: string;
}

const EVENT_AGGREGATE_TYPES: Record<DomainEventType, AggregateType> = {
  vehicle_entered: 'vehicle',
  vehicle_exited: 'vehicle',
  vehicle_refunded: 'vehicle',
  vehicle_deleted: 'vehicle',
  subscriber_created: 'subscriber',
  subscriber_renewed: 'subscriber',
  subscriber_updated: 'subscriber',
  subscriber_deleted: 'subscriber',
  recharge_approved: 'recharge',
  recharge_rejected: 'recharge',
  delegate_settled: 'delegate'
};

const SENSITIVE_KEYS = /^(pin|password|token|secret|privatekey|serviceaccount|authorization)$/i;

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
    SENSITIVE_KEYS.test(key) ? [] : [[key, redactSensitive(child)]]
  ));
}

function validateEventParams(params: CreateEventParams): void {
  if (EVENT_AGGREGATE_TYPES[params.eventType] !== params.aggregateType) {
    throw new Error('INVALID_EVENT_AGGREGATE');
  }
  if (!params.aggregateId || !params.eventType || !params.actorUid || !params.actorRole) {
    throw new Error('INVALID_EVENT_ENVELOPE');
  }
  const payload = JSON.stringify(params.payload);
  if (payload.length > 32_000) throw new Error('EVENT_PAYLOAD_TOO_LARGE');
}

/**
 * Creates and writes an immutable domain event atomically inside a Firestore transaction.
 */
export function recordDomainEventInTransaction(
  t: any,
  adminDb: any,
  params: CreateEventParams
): DomainEvent {
  validateEventParams(params);
  const timestamp = new Date();
  const eventId = `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const safePayload = redactSensitive(params.payload) as Record<string, unknown>;

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
    payload: safePayload
  };

  const eventPath = params.eventCollectionPath || `garages/${params.garageId}/events`;
  const eventRef = adminDb.doc(`${eventPath}/${eventId}`);
  t.set(eventRef, event);

  return event;
}
