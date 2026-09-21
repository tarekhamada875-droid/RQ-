import { redactAuditPayload } from '../observability/redaction.js';
import {
  getTimestampTolerance,
  normalizeReadRecords,
  normalizeTimestamp,
  type NormalizeReadOptions,
  type ReadRecord
} from './normalizeReadComparison.js';

export type ReadComparisonInput = Readonly<{
  endpoint: string;
  garageId?: string;
  tenantId?: string;
  garageScope?: string;
  tenantScope?: string;
  requestId: string;
  dataVersion: string | number;
  legacy: ReadonlyArray<unknown> | ReadRecord;
  v2: ReadonlyArray<unknown> | ReadRecord;
  timestampToleranceMs?: number;
}>;

export type ReadMismatch = Readonly<{
  id: string;
  path: string;
  kind: 'missing-in-legacy' | 'missing-in-v2' | 'value-mismatch';
  legacy?: unknown;
  v2?: unknown;
}>;

export type ReadComparisonResult = Readonly<{
  endpoint: string;
  garageScope?: string;
  tenantScope?: string;
  requestId: string;
  dataVersion: string | number;
  equality: boolean;
  mismatches: ReadonlyArray<ReadMismatch>;
  financialMismatch: boolean;
  authorizationMismatch: boolean;
  financialMismatchHard: boolean;
  authorizationMismatchHard: boolean;
}>;

const FINANCIAL_PATH = /(amount|balance|price|revenue|commission|wallet|ledger|financial|refund|charge|payment|currency|money|fee)/i;
const AUTHORIZATION_PATH = /(authorization|permission|role|scope|access|owner|tenant|garage|actor|user|uid|principal|admin)/i;
const OMITTED = Symbol('omitted');

function isRecord(value: unknown): value is ReadRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function samePrimitive(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

function compareValue(
  id: string,
  path: string,
  legacy: unknown,
  v2: unknown,
  toleranceMs: number,
  output: ReadMismatch[]
): void {
  const legacyTimestamp = normalizeTimestamp(legacy);
  const v2Timestamp = normalizeTimestamp(v2);
  if (legacyTimestamp !== undefined && v2Timestamp !== undefined) {
    const distance = Math.abs(Date.parse(legacyTimestamp) - Date.parse(v2Timestamp));
    if (distance <= toleranceMs) return;
  }
  if (samePrimitive(legacy, v2)) return;
  if (Array.isArray(legacy) && Array.isArray(v2)) {
    if (legacy.length !== v2.length) {
      output.push({ id, path, kind: 'value-mismatch', legacy, v2 });
      return;
    }
    for (let index = 0; index < legacy.length; index += 1) {
      compareValue(id, `${path}[${index}]`, legacy[index], v2[index], toleranceMs, output);
    }
    return;
  }
  if (isRecord(legacy) && isRecord(v2)) {
    const keys = new Set([...Object.keys(legacy), ...Object.keys(v2)]);
    for (const key of [...keys].sort()) {
      const left = Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : OMITTED;
      const right = Object.prototype.hasOwnProperty.call(v2, key) ? v2[key] : OMITTED;
      if (left === OMITTED || right === OMITTED) {
        output.push({
          id,
          path: path ? `${path}.${key}` : key,
          kind: left === OMITTED ? 'missing-in-legacy' : 'missing-in-v2',
          ...(left !== OMITTED ? { legacy: left } : {}),
          ...(right !== OMITTED ? { v2: right } : {})
        });
      } else {
        compareValue(id, path ? `${path}.${key}` : key, left, right, toleranceMs, output);
      }
    }
    return;
  }
  output.push({ id, path, kind: 'value-mismatch', legacy, v2 });
}

function mismatchIsFinancial(mismatch: ReadMismatch): boolean {
  return FINANCIAL_PATH.test(mismatch.path) || [mismatch.legacy, mismatch.v2].some((value) => isRecord(value) && Object.keys(value).some((key) => FINANCIAL_PATH.test(key)));
}

function mismatchIsAuthorization(mismatch: ReadMismatch): boolean {
  return AUTHORIZATION_PATH.test(mismatch.path) || [mismatch.legacy, mismatch.v2].some((value) => isRecord(value) && Object.keys(value).some((key) => AUTHORIZATION_PATH.test(key)));
}

function redactedMismatch(mismatch: ReadMismatch): ReadMismatch {
  const redacted = redactAuditPayload(mismatch) as ReadMismatch;
  const sensitivePath = mismatchIsFinancial(mismatch) || mismatchIsAuthorization(mismatch);
  if (!sensitivePath) return redacted;
  return {
    ...redacted,
    ...(mismatch.legacy !== undefined ? { legacy: '[REDACTED]' } : {}),
    ...(mismatch.v2 !== undefined ? { v2: '[REDACTED]' } : {})
  };
}

/** Compare two read-only results without logging or mutating either input. */
export function compareReadResults(input: ReadComparisonInput): ReadComparisonResult {
  const toleranceOptions: NormalizeReadOptions = input.timestampToleranceMs === undefined
    ? {}
    : { timestampToleranceMs: input.timestampToleranceMs };
  const toleranceMs = getTimestampTolerance(toleranceOptions);
  const options: NormalizeReadOptions = { timestampToleranceMs: toleranceMs };
  const legacy = normalizeReadRecords(input.legacy, options);
  const v2 = normalizeReadRecords(input.v2, options);
  const legacyById = new Map(legacy.map((item) => [item.id, item.record]));
  const v2ById = new Map(v2.map((item) => [item.id, item.record]));
  const ids = [...new Set([...legacyById.keys(), ...v2ById.keys()])].sort();
  const mismatches: ReadMismatch[] = [];
  for (const id of ids) {
    const left = legacyById.get(id);
    const right = v2ById.get(id);
    if (left === undefined) {
      mismatches.push({ id, path: '$', kind: 'missing-in-legacy', v2: right });
    } else if (right === undefined) {
      mismatches.push({ id, path: '$', kind: 'missing-in-v2', legacy: left });
    } else {
      compareValue(id, '$', left, right, toleranceMs, mismatches);
    }
  }
  const financialMismatch = mismatches.some(mismatchIsFinancial);
  const authorizationMismatch = mismatches.some(mismatchIsAuthorization);
  return {
    endpoint: input.endpoint,
    ...(input.garageScope ?? input.garageId ? { garageScope: input.garageScope ?? input.garageId } : {}),
    ...(input.tenantScope ?? input.tenantId ? { tenantScope: input.tenantScope ?? input.tenantId } : {}),
    requestId: input.requestId,
    dataVersion: input.dataVersion,
    equality: mismatches.length === 0,
    mismatches: mismatches.map(redactedMismatch),
    financialMismatch,
    authorizationMismatch,
    financialMismatchHard: financialMismatch,
    authorizationMismatchHard: authorizationMismatch
  };
}

export const compareReadRecords = compareReadResults;
