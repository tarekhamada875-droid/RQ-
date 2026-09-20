import type { IdempotencyRecord } from '../contracts/financial.js';
import { decideIdempotency, type IdempotencyDecision } from './financialIdempotency.js';

export function decideVehicleOperationIdempotency(
  existing: IdempotencyRecord | null,
  idempotencyKey: string,
  operation: 'vehicle.check_in' | 'vehicle.check_out',
  fingerprint: string
): IdempotencyDecision {
  return decideIdempotency(existing, idempotencyKey, operation, fingerprint);
}
