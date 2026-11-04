/**
 * PIN cryptography helpers — hashing, verification, and digit normalization.
 *
 * Extracted from server/utils.ts (Wave 6a). Contains the scrypt-based
 * hashing and verification logic for PIN credentials.
 */
import crypto from 'crypto';

export function normalizeDigits(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9');
}

export function cleanPin(raw: any): string {
  return normalizeDigits(String(raw || '')).replace(/\D/g, '');
}

const PIN_LOOKUP_SALT = 'ark_garage_secure_pin_lookup_salt_v2';

export function hashPinWithUniqueSalt(cleanPinStr: string, saltHex?: string): string {
  if (!cleanPinStr) return '';
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const actualSaltHex = salt.toString('hex');
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = crypto.scryptSync(cleanPinStr, salt, 32, { N, r, p }).toString('hex');
  return `$scrypt$N=${N},r=${r},p=${p}$${actualSaltHex}$${derived}`;
}

export function computeLookupHash(cleanPinStr: string): string {
  if (!cleanPinStr) return '';
  return crypto.scryptSync(cleanPinStr, PIN_LOOKUP_SALT, 32).toString('hex');
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a.toLowerCase());
  const bufB = Buffer.from(b.toLowerCase());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyScryptHash(inputCleanPin: string, scryptStr: string): boolean {
  try {
    const parts = scryptStr.split('$');
    if (parts.length >= 5 && parts[1] === 'scrypt') {
      const paramStr = parts[2];
      const saltHex = parts[3];
      const expectedHash = parts[4];
      const params: Record<string, number> = {};
      paramStr.split(',').forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) params[k] = parseInt(v, 10);
      });
      const N = params.N || 16384;
      const r = params.r || 8;
      const p = params.p || 1;
      const salt = Buffer.from(saltHex, 'hex');
      const derived = crypto.scryptSync(inputCleanPin, salt, 32, { N, r, p }).toString('hex');
      return safeCompare(derived, expectedHash);
    }
  } catch (e) {
    console.error('[Server Auth] Error verifying scrypt hash:', e);
  }
  return false;
}

export function verifySingleFieldValue(inputCleanPin: string, storedVal: any): { matches: boolean; isLegacy: boolean } {
  if (!inputCleanPin || storedVal === undefined || storedVal === null) return { matches: false, isLegacy: false };
  const strVal = String(storedVal).trim();
  if (!strVal) return { matches: false, isLegacy: false };

  if (strVal.startsWith('$scrypt$') && verifyScryptHash(inputCleanPin, strVal)) {
    return { matches: true, isLegacy: false };
  }

  return { matches: false, isLegacy: false };
}

export function verifyPinMatch(inputCleanPin: string, storedPin: any): { matches: boolean; isLegacy: boolean } {
  return verifySingleFieldValue(inputCleanPin, storedPin);
}

export function verifyDocMatch(inputCleanPin: string, docData: any): { matches: boolean; isLegacy: boolean } {
  if (!docData) return { matches: false, isLegacy: false };
  const candidateFields = [docData.pin, docData.ownerPin, docData.adminPin, docData.pinLookupHash];
  for (const fieldVal of candidateFields) {
    const check = verifySingleFieldValue(inputCleanPin, fieldVal);
    if (check.matches) {
      return check;
    }
  }
  return { matches: false, isLegacy: false };
}
