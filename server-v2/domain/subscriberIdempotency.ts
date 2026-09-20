import type { IdempotencyRecord } from '../contracts/financial.js';
import { decideIdempotency, type IdempotencyDecision } from './financialIdempotency.js';

export function decideSubscriberIdempotency(
  existing: IdempotencyRecord | null,
  key: string,
  operation: 'subscriber.create' | 'subscriber.renew' | 'subscriber.suspend' | 'subscriber.cancel',
  fingerprint: string
): IdempotencyDecision {
  return decideIdempotency(existing, key, operation, fingerprint);
}
