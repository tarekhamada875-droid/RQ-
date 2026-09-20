import type { IdempotencyRecord } from '../contracts/financial.js';
import { decideIdempotency, type IdempotencyDecision } from './financialIdempotency.js';

export function decideDeletionIdempotency(
  existing: IdempotencyRecord | null,
  key: string,
  operation: 'garage.delete.start' | 'garage.delete.page' | 'garage.delete.resume',
  fingerprint: string
): IdempotencyDecision {
  return decideIdempotency(existing, key, operation, fingerprint);
}
