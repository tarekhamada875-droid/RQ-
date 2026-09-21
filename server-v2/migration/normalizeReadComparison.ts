import { createHash } from 'node:crypto';

export type ReadRecord = Readonly<Record<string, unknown>>;

export type NormalizeReadOptions = Readonly<{
  timestampToleranceMs?: number;
  stableIdFields?: readonly string[];
  timestampFields?: readonly string[];
}>;

export type NormalizedReadRecord = Readonly<{
  id: string;
  record: ReadRecord;
  timestampFields: Readonly<Record<string, string>>;
}>;

const DEFAULT_ID_FIELDS = ['id', 'documentId', 'docId', 'entityId'] as const;
const DEFAULT_TIMESTAMP_FIELDS = [
  'createdAt',
  'updatedAt',
  'occurredAt',
  'timestamp',
  'deletedAt',
  'checkedInAt',
  'checkedOutAt'
] as const;
const ID_FIELD_SET: ReadonlySet<string> = new Set(DEFAULT_ID_FIELDS);
const TIMESTAMP_FIELD_PATTERN = /(?:At|timestamp|Timestamp|Date|date|Time|time)$/;

function isRecord(value: unknown): value is ReadRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(value: ReadRecord): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}

function toTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (isRecord(value) && typeof value.toDate === 'function') {
    const dateValue: unknown = value.toDate();
    return toTimestamp(dateValue);
  }
  if (isRecord(value) && typeof value.seconds === 'number') {
    const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
    return toTimestamp(value.seconds * 1000 + Math.floor(nanos / 1_000_000));
  }
  return undefined;
}

function timestampKeys(record: ReadRecord, configured: readonly string[]): string[] {
  const configuredSet = new Set(configured);
  return Object.keys(record).filter((key) => configuredSet.has(key) || TIMESTAMP_FIELD_PATTERN.test(key));
}

function canonicalRecord(record: ReadRecord, id: string, timestamps: Readonly<Record<string, string>>, configuredIds: readonly string[]): ReadRecord {
  const result: Record<string, unknown> = {};
  const idFields = new Set([...DEFAULT_ID_FIELDS, ...configuredIds]);
  for (const [key, value] of Object.entries(record)) {
    if (idFields.has(key)) continue;
    const normalizedTimestamp = timestamps[key];
    result[key] = normalizedTimestamp === undefined ? value : normalizedTimestamp;
  }
  result.id = id;
  return result;
}

function extractItems(input: ReadonlyArray<unknown> | ReadRecord): ReadonlyArray<unknown> {
  if (Array.isArray(input)) return input;
  const items = (input as ReadRecord)['items'];
  return Array.isArray(items) ? items : [input];
}

function stableId(record: ReadRecord, configured: readonly string[], withoutTimestamps: ReadRecord): string {
  for (const field of [...configured, ...DEFAULT_ID_FIELDS]) {
    const value = record[field];
    if ((typeof value === 'string' && value.length > 0) || typeof value === 'number') return String(value);
  }
  return `missing:${fingerprint(withoutTimestamps)}`;
}

/**
 * Converts legacy and v2 item arrays (or `{ items }` pages) to a deterministic,
 * transport-independent representation. No input object is mutated.
 */
export function normalizeReadRecords(
  input: ReadonlyArray<unknown> | ReadRecord,
  options: NormalizeReadOptions = {}
): ReadonlyArray<NormalizedReadRecord> {
  const configuredIds = options.stableIdFields ?? [];
  const configuredTimestamps = options.timestampFields ?? DEFAULT_TIMESTAMP_FIELDS;
  const normalized = extractItems(input).map((item, index) => {
    if (!isRecord(item)) throw new Error(`READ_RECORD_NOT_OBJECT:${index}`);
    const timestamps: Record<string, string> = {};
    for (const key of timestampKeys(item, configuredTimestamps)) {
      const parsed = toTimestamp(item[key]);
      if (parsed !== undefined) timestamps[key] = parsed;
    }
    const withoutTimestamps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (timestamps[key] === undefined && ID_FIELD_SET.has(key)) continue;
      if (timestamps[key] !== undefined) continue;
      withoutTimestamps[key] = value;
    }
    const id = stableId(item, configuredIds, withoutTimestamps);
    return { id, record: canonicalRecord(item, id, timestamps, configuredIds), timestampFields: timestamps };
  });
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

export function normalizeTimestamp(value: unknown): string | undefined {
  return toTimestamp(value);
}

export function getTimestampTolerance(options: NormalizeReadOptions = {}): number {
  const tolerance = options.timestampToleranceMs ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('TIMESTAMP_TOLERANCE_INVALID');
  return tolerance;
}

export const DEFAULT_READ_TIMESTAMP_TOLERANCE_MS = 0;
export const DEFAULT_READ_ID_FIELDS = DEFAULT_ID_FIELDS;
export const DEFAULT_READ_TIMESTAMP_FIELDS = DEFAULT_TIMESTAMP_FIELDS;
