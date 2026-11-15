/**
 * Server-side PIN generation.
 *
 * Used by create-garage flow when the caller is a delegate. The delegate
 * must NOT see the PIN — it's generated here, written to private_pins/
 * via saveEntityPinInTransaction, and surfaced only to admin in the
 * approval queue. Admin then communicates it to the garage owner out
 * of band (typically by phone).
 *
 * Algorithm mirrors the client-side generateSafePin (src/utils/pins.ts):
 * crypto.getRandomValues + rejection sampling, no modulo bias, retry
 * until the candidate is unique across all PIN collections.
 *
 * Why not share the client code? Because the Worker bundle must not
 * import from src/. And the client's helper takes a Set of existing
 * PINs (which it has, locally); the server checks uniqueness against
 * Firestore via checkPinAvailabilityAcrossAll, which is async.
 */

const PIN_LENGTH = 5;
const MAX_PIN_GENERATION_ATTEMPTS = 100;

/**
 * Returns one cryptographically random digit 0-9, with rejection sampling
 * to avoid modulo bias. Uses Web Crypto on the Worker runtime (Cloudflare
 * Workers ship crypto.getRandomValues).
 */
function secureRandomDigit(): number {
  // 256 mod 10 == 6, so reject values >= 250 to avoid bias.
  const buf = new Uint8Array(1);
  let x = 255;
  while (x >= 250) {
    crypto.getRandomValues(buf);
    x = buf[0];
  }
  return x % 10;
}

/**
 * Returns a candidate 5-digit PIN string. Caller checks uniqueness and
 * retries on collision.
 */
function candidatePin(): string {
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += secureRandomDigit().toString();
  }
  return pin;
}

/**
 * Fallback when the unbiased loop fails to find a unique PIN within
 * MAX_PIN_GENERATION_ATTEMPTS. Uses a single secureRandomInt across
 * [10000, 99999] — still cryptographically random, just a wider pool
 * so the next availability check has more room.
 */
function fallbackCandidatePin(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  // Convert 4 bytes to a 32-bit unsigned int, mod 90000, add 10000 → [10000, 99999].
  const view = new DataView(buf.buffer);
  const rand = view.getUint32(0, true) % 90000;
  return (10000 + rand).toString();
}

export interface PinGenerationResult {
  /** The generated 5-digit PIN, guaranteed unique at the time of generation. */
  pin: string;
  /** Number of availability attempts (1 = first try, MAX = exhausted fallback). */
  attempts: number;
  /** True if the unique PIN came from the fallback path (very rare). */
  usedFallback: boolean;
}

/**
 * Generates a 5-digit PIN that is not currently in use across any PIN
 * collection (garages, delegates, staff, retired_pins).
 *
 * Caller passes the existing checkPinAvailabilityAcrossAll helper so
 * this module stays free of Firestore imports (easier to unit-test).
 *
 * Throws if even the fallback cannot find a unique PIN — practically
 * impossible with ~90,000 possible PINs and <10K existing accounts,
 * but we surface it explicitly instead of returning a duplicate.
 */
export async function generateUniquePin(
  checkAvailability: (pin: string) => Promise<{ taken: boolean }>,
): Promise<PinGenerationResult> {
  for (let i = 0; i < MAX_PIN_GENERATION_ATTEMPTS; i++) {
    const candidate = candidatePin();
    const result = await checkAvailability(candidate);
    if (!result.taken) {
      return { pin: candidate, attempts: i + 1, usedFallback: false };
    }
  }
  // Fallback: wider random pool, one more availability check.
  const fallback = fallbackCandidatePin();
  const result = await checkAvailability(fallback);
  if (!result.taken) {
    return { pin: fallback, attempts: MAX_PIN_GENERATION_ATTEMPTS + 1, usedFallback: true };
  }
  throw new Error('PIN_GENERATION_EXHAUSTED');
}
