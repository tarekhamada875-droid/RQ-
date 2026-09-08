import crypto from 'crypto';
import {
  adminDb
} from './firebaseAdmin';

// Helper for digit normalization
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

// Cryptographic PIN Hashing Helpers
const LEGACY_PIN_SALT = 'ark_garage_secure_pin_salt_2026';
const PIN_LOOKUP_SALT = 'ark_garage_secure_pin_lookup_salt_v2';

// Modern per-account unique-salt scrypt hash ($scrypt$N=16384,r=8,p=1$<16_byte_salt_hex>$<derived_hex>)
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

// System-wide deterministic lookup hash for indexed Firestore queries
export function computeLookupHash(cleanPinStr: string): string {
  if (!cleanPinStr) return '';
  return crypto.scryptSync(cleanPinStr, PIN_LOOKUP_SALT, 32).toString('hex');
}

// Legacy single-salt hash calculation for backward compatibility
export function legacyHashPin(cleanPinStr: string): string {
  if (!cleanPinStr) return '';
  return crypto.scryptSync(cleanPinStr, LEGACY_PIN_SALT, 32).toString('hex');
}

export function hashPin(cleanPinStr: string): string {
  return hashPinWithUniqueSalt(cleanPinStr);
}

export function isHashedPin(pin: string): boolean {
  if (!pin) return false;
  return typeof pin === 'string' && pin.length === 64 && /^[0-9a-f]{64}$/i.test(pin);
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

  // Format 1: Unique-salt $scrypt$... (Modern)
  if (strVal.startsWith('$scrypt$')) {
    if (verifyScryptHash(inputCleanPin, strVal)) {
      return { matches: true, isLegacy: false };
    }
  }

  // Format 2: Old 64-character single-salt hex hash (Legacy)
  if (isHashedPin(strVal)) {
    const inputLegacyHash = legacyHashPin(inputCleanPin);
    if (safeCompare(inputLegacyHash, strVal)) {
      return { matches: true, isLegacy: true };
    }
  }

  // Format 3: Plaintext PIN string (Legacy)
  const cleanStored = cleanPin(strVal);
  if (cleanStored && safeCompare(cleanStored, inputCleanPin)) {
    return { matches: true, isLegacy: true };
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

export async function migratePinToHash(collName: string, docId: string, cleanInputPin: string): Promise<void> {
  const newScrypt = hashPinWithUniqueSalt(cleanInputPin);
  const lookupHash = computeLookupHash(cleanInputPin);
  const updatePayload = {
    pin: newScrypt,
    pinLookupHash: lookupHash
  };

  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    if (collName === 'admin_settings') {
      await adminDb.doc('admin_settings/auth_pin').set(updatePayload, { merge: true });
    } else {
      await adminDb.collection(collName).doc(docId).update(updatePayload);
    }
    console.log(`[Server Auth] Auto-migrated legacy PIN to unique-salt $scrypt$ hash for ${collName}/${docId}`);
  } catch (e) {
    console.error(`[Server Auth] Error auto-migrating PIN for ${collName}/${docId}:`, e);
  }
}

// In-Memory Rate Limiter for Authentication Endpoints
const failedAttemptsByIp = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = failedAttemptsByIp.get(ip);
  if (!entry || now > entry.resetAt) {
    failedAttemptsByIp.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 20) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetRateLimit(ip: string): void {
  failedAttemptsByIp.delete(ip);
}

// Server Database Access Abstractions
export async function getAdminPin(): Promise<string> {
  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    const snap = await adminDb.doc('admin_settings/auth_pin').get();
    return snap.exists ? String(snap.data()?.pin || '') : '';
  } catch (e) {
    console.error('[Server Auth] Error reading admin pin:', e);
    return '';
  }
}

export async function queryAccountWherePin(collName: string, normPin: string): Promise<Array<{ id: string; data: any; isLegacyMatch: boolean }>> {
  const lookupHash = computeLookupHash(normPin);
  const legacyHash = legacyHashPin(normPin);
  const matches: Array<{ id: string; data: any; isLegacyMatch: boolean }> = [];
  const seenIds = new Set<string>();

  // Deterministic candidate queries to test (field and matching value)
  const candidateQueries: Array<{ field: string; value: string }> = [
    { field: 'pinLookupHash', value: lookupHash },
    { field: 'pin', value: legacyHash },
    { field: 'pin', value: normPin }
  ];

  if (collName === 'garages') {
    candidateQueries.push(
      { field: 'ownerPin', value: normPin },
      { field: 'adminPin', value: normPin }
    );
  }

  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    for (const { field, value } of candidateQueries) {
      if (!value) continue;
      try {
        const snap = await adminDb.collection(collName).where(field, '==', value).limit(5).get();
        for (const d of snap.docs) {
          if (!seenIds.has(d.id)) {
            const check = verifyDocMatch(normPin, d.data());
            if (check.matches) {
              seenIds.add(d.id);
              matches.push({ id: d.id, data: d.data(), isLegacyMatch: check.isLegacy });
            }
          }
        }
      } catch (e) {}
    }

    // Legacy fallback: bounded collection scan for unmigrated accounts (prevents lockout)
    if (matches.length === 0) {
      try {
        const fallbackSnap = await adminDb.collection(collName).limit(50).get();
        for (const d of fallbackSnap.docs) {
          if (!seenIds.has(d.id)) {
            const check = verifyDocMatch(normPin, d.data());
            if (check.matches) {
              seenIds.add(d.id);
              matches.push({ id: d.id, data: d.data(), isLegacyMatch: check.isLegacy });
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error(`[Server Auth] Error querying collection ${collName} where pin:`, e);
  }

  return matches;
}

export async function queryDelegatesWherePhone(normPhone: string): Promise<Array<{ id: string; data: any }>> {
  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    const snap = await adminDb.collection('delegates').where('phone', '==', normPhone).limit(5).get();
    return snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
  } catch (e) {
    console.error('[Server Auth] Error querying delegates where phone:', e);
    return [];
  }
}
