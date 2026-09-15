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

export interface DomainEvent {
  eventId: string;
  schemaVersion: number;
  garageId: string;
  aggregateType: 'vehicle' | 'subscriber' | 'delegate' | 'recharge';
  aggregateId: string;
  eventType: DomainEventType;
  occurredAt: string;
  recordedAt: string;
  actorUid: string;
  actorRole: string;
  idempotencyKey?: string;
  payload: Record<string, any>;
}

export interface CreateEventParams {
  garageId: string;
  aggregateType: 'vehicle' | 'subscriber' | 'delegate' | 'recharge';
  aggregateId: string;
  eventType: DomainEventType;
  actorUid: string;
  actorRole: string;
  idempotencyKey?: string;
  payload: Record<string, any>;
}

/**
 * Creates and writes an immutable domain event atomically inside a Firestore transaction.
 */
export function recordDomainEventInTransaction(
  t: any,
  adminDb: any,
  params: CreateEventParams
): DomainEvent {
  const timestampIso = new Date().toISOString();
  const eventId = `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  
  // Sanitize payload to ensure sensitive fields (like raw tokens/PINs) are never logged
  const safePayload = { ...params.payload };
  delete (safePayload as any).pin;
  delete (safePayload as any).password;
  delete (safePayload as any).token;

  const event: DomainEvent = {
    eventId,
    schemaVersion: 1,
    garageId: params.garageId,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    eventType: params.eventType,
    occurredAt: timestampIso,
    recordedAt: timestampIso,
    actorUid: params.actorUid || 'system',
    actorRole: params.actorRole || 'unknown',
    idempotencyKey: params.idempotencyKey || undefined,
    payload: safePayload
  };

  const eventRef = adminDb.doc(`garages/${params.garageId}/events/${eventId}`);
  t.set(eventRef, event);

  return event;
}
