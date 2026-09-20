import crypto from 'node:crypto';

export function businessDateKey(date: Date, timeZone = 'Africa/Cairo'): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

export function idempotencyFingerprint(operation: string, input: unknown): string {
  const canonical = JSON.stringify({ operation, input: canonicalize(input) });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
