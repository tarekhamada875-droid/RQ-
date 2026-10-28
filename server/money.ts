const CENTS_PER_UNIT = 100;
const MONEY_STRING = /^\d+(?:\.\d{1,2})?$/;
const SIGNED_MONEY_STRING = /^-?\d+(?:\.\d{1,2})?$/;
const MAX_CENT_ROUNDING_ERROR = 1e-9;

/**
 * Converts a valid non-negative currency amount into integer cents.
 * Strings are accepted for legacy stored records; new event payloads should
 * still be numeric and are checked as such by the event writer.
 */
export function parseMoneyCents(value: unknown): number | null {
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string' && MONEY_STRING.test(value)) {
    amount = Number(value);
  } else {
    return null;
  }

  if (!Number.isFinite(amount) || amount < 0) return null;
  const scaled = amount * CENTS_PER_UNIT;
  const cents = Math.round(scaled);
  if (!Number.isSafeInteger(cents) || Math.abs(scaled - cents) > MAX_CENT_ROUNDING_ERROR) return null;
  return cents;
}

/** Returns a normalized two-decimal currency amount, or null for invalid data. */
export function parseMoneyAmount(value: unknown): number | null {
  const cents = parseMoneyCents(value);
  return cents === null ? null : cents / CENTS_PER_UNIT;
}

/** Converts a valid signed derived currency value to cents (e.g. net revenue). */
export function parseSignedMoneyCents(value: unknown): number | null {
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string' && SIGNED_MONEY_STRING.test(value)) {
    amount = Number(value);
  } else {
    return null;
  }

  if (!Number.isFinite(amount)) return null;
  const scaled = amount * CENTS_PER_UNIT;
  const cents = Math.round(scaled);
  if (!Number.isSafeInteger(cents) || Math.abs(scaled - cents) > MAX_CENT_ROUNDING_ERROR) return null;
  return cents;
}

export function parseSignedMoneyAmount(value: unknown): number | null {
  const cents = parseSignedMoneyCents(value);
  return cents === null ? null : cents / CENTS_PER_UNIT;
}

/**
 * Adds a valid currency amount to a valid non-negative total. Invalid historical
 * values and sums that exceed safe integer cents are ignored, keeping reducers
 * finite and deterministic without rewriting or mutating their source records.
 */
export function addMoney(total: number, value: unknown): number {
  const totalCents = parseMoneyCents(total);
  const valueCents = parseMoneyCents(value);
  if (totalCents === null) return 0;
  if (valueCents === null) return totalCents / CENTS_PER_UNIT;

  const nextCents = totalCents + valueCents;
  if (!Number.isSafeInteger(nextCents)) return total;
  return nextCents / CENTS_PER_UNIT;
}

/** Adds signed derived currency values without allowing malformed data to poison totals. */
export function addSignedMoney(total: number, value: unknown): number {
  const totalCents = parseSignedMoneyCents(total);
  const valueCents = parseSignedMoneyCents(value);
  if (totalCents === null) return 0;
  if (valueCents === null) return totalCents / CENTS_PER_UNIT;

  const nextCents = totalCents + valueCents;
  if (!Number.isSafeInteger(nextCents)) return totalCents / CENTS_PER_UNIT;
  return nextCents / CENTS_PER_UNIT;
}
