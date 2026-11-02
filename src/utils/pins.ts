/**
 * PIN generation and display helpers (client-side).
 *
 * The server is authoritative for PIN hashing and verification
 * (server/utils.ts). These helpers handle client-side generation
 * and display formatting only.
 */

export const NEW_PIN_LENGTH = 5;

/**
 * Generates a five-digit PIN that is unique against the provided local set.
 * The server remains authoritative for global uniqueness.
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
      const idx = i + Math.floor(Math.random() * (pool.length - i));
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
    pin = Math.floor(10000 + Math.random() * 90000).toString();
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
