import { IdempotencyRecordSchema, type IdempotencyRecord } from '../contracts/financial.js';

export type IdempotencyDecision = Readonly<{
  kind: 'new' | 'replay' | 'conflict';
  record?: IdempotencyRecord;
}>;

export function decideIdempotency(
  existing: IdempotencyRecord | null,
  key: string,
  operation: string,
  fingerprint: string
): IdempotencyDecision {
  if (!key || !operation || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('INVALID_IDEMPOTENCY_INPUT');
  if (!existing) return { kind: 'new' };
  const record = IdempotencyRecordSchema.parse(existing);
  if (record.key !== key || record.operation !== operation) return { kind: 'conflict' };
  return record.fingerprint === fingerprint ? { kind: 'replay', record } : { kind: 'conflict' };
}

export function createIdempotencyRecord(input: Readonly<{
  key: string;
  operation: string;
  fingerprint: string;
  response: unknown;
  createdAt: Date;
}>): IdempotencyRecord {
  const responseJson = JSON.stringify(input.response);
  if (responseJson.length > 10000) throw new Error('IDEMPOTENCY_RESPONSE_TOO_LARGE');
  return IdempotencyRecordSchema.parse({
    key: input.key, operation: input.operation, fingerprint: input.fingerprint,
    status: 'completed', responseJson, createdAt: input.createdAt.toISOString()
  });
}
