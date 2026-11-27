/**
 * PIN generation and display helpers (client-side).
 *
 * The server is authoritative for PIN hashing and verification
 * (server/pinCrypto.ts and server/pinRepository.ts). These helpers handle
 * client-side generation and display formatting only.
 */

export const NEW_PIN_LENGTH = 5;

/**
 * Returns a cryptographically secure uniform integer in [0, max).
 * Uses crypto.getRandomValues (Web Crypto API) — never Math.random(),
 * which is a non-cryptographic PRNG whose output is predictable from
 * prior outputs (audit N19, 2026-11-06).
 *
 * Falls back to Math.random only if Web Crypto is unavailable (very old
 * runtime); a console warning is emitted in that case so the operator
 * can detect the regression.
 */
function secureRandomInt(max: number): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    // Rejection sampling to avoid modulo bias. The max value we ever pass
    // is 10 (single digit), so this loop terminates in ~1 iteration on
    // average.
    const upperBound = 256 - (256 % max);
    const buf = new Uint8Array(1);
    let x = 256;
    while (x >= upperBound) {
      crypto.getRandomValues(buf);
      x = buf[0];
    }
    return x % max;
  }
  // Fallback for environments without Web Crypto. Should never happen in a
  // modern browser, but guard explicitly.
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[RQ] crypto.getRandomValues unavailable; falling back to Math.random for PIN generation. Audit N19.');
  }
  return Math.floor(Math.random() * max);
}

/**
 * Generates a five-digit PIN that is unique against the provided local set.
 * The server remains authoritative for global uniqueness.
 *
 * Uses crypto.getRandomValues (Web Crypto API) for cryptographic
 * unpredictability. The previous version used Math.random, which is a
 * non-cryptographic PRNG (audit N19, 2026-11-06).
 */
export const generateSafePin = (existingPins: Set<string> | string[] = new Set()): string => {
  const pins = existingPins instanceof Set ? existingPins : new Set(existingPins);
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let pin = '';
  let attempts = 0;
  while (attempts < 100) {
    const pool = [...digits];
    let candidate = '';
    for (let i = 0; i < NEW_PIN_LENGTH; i++) {
      // Fisher-Yates shuffle using secureRandomInt instead of Math.random.
      const idx = i + secureRandomInt(pool.length - i);
      const temp = pool[i];
      pool[i] = pool[idx];
      pool[idx] = temp;
      candidate += pool[i];
    }
    if (!pins.has(candidate)) {
      pin = candidate;
      break;
    }
    attempts++;
  }
  if (!pin) {
    // Fallback: a random 5-digit number using the same secure source.
    // Range [10000, 99999] = 90000 possibilities. secureRandomInt(90000)
    // gives [0, 89999]; add 10000.
    pin = (10000 + secureRandomInt(90000)).toString();
  }
  return pin;
};

/**
 * Detects whether a PIN string is a cryptographic hash (scrypt, sha256, etc.) rather than a plain PIN.
 */
export const isHashedPin = (pin: string | undefined | null): boolean => {
  if (!pin) return false;
  const str = String(pin).trim();
  if (str.length > 12) return true;
  return str.startsWith('$') || str.startsWith('!$') || str.startsWith('scrypt');
};

/**
 * Formats plain text or hashed PINs for clean UI display without breaking layouts.
 */
export const formatDisplayPin = (pin: string | undefined | null): string => {
  if (!pin) return '—';
  const str = String(pin).trim();
  if (isHashedPin(str)) {
    return '•••••••• (مشفر)';
  }
  return str;
};
