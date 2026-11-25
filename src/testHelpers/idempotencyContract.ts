/**
 * Test-side mirror of the idempotency-key header contract.
 *
 * Moved here from types/apiContracts.ts (audit F-14): production code hardcodes
 * the wire strings where it sends them, so these constants and the extractor
 * existed solely for tests to pin the header contract without magic strings.
 * Nothing in the shipped bundle imports this module.
 */
export const IDEMPOTENCY_HEADER_NAME = 'x-idempotency-key';
export const IDEMPOTENCY_HEADER_NAME_ALT = 'idempotency-key';

/**
 * Extracts and normalizes the idempotency key from request headers or object.
 */
export function extractIdempotencyKey(headers: Record<string, any>): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const key = headers[IDEMPOTENCY_HEADER_NAME] || headers[IDEMPOTENCY_HEADER_NAME_ALT] || null;
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}
