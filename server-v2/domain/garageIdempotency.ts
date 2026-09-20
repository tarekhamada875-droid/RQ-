import type { IdempotencyRecord } from '../contracts/financial.js';
import { decideIdempotency, type IdempotencyDecision } from './financialIdempotency.js';

export function decideGarageLifecycleIdempotency(
  existing: IdempotencyRecord | null,
  key: string,
  operation: 'garage.lock' | 'garage.unlock' | 'garage.suspend' | 'garage.unsuspend',
  fingerprint: string
): IdempotencyDecision {
  return decideIdempotency(existing, key, operation, fingerprint);
}
