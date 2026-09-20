const SENSITIVE_KEY = /(authorization|token|password|secret|pin|credential|private.?key|service.?account)/i;
const FINANCIAL_KEY = /(balance|amount|price|revenue|commission|wallet|ledger)/i;
const REDACTED = '[REDACTED]';

export function redactAuditPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redactAuditPayload(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) || FINANCIAL_KEY.test(key) ? REDACTED : redactAuditPayload(item, depth + 1)
    ]));
  }
  if (typeof value === 'string' && value.length > 1000) return `${value.slice(0, 1000)}…`;
  return value;
}
