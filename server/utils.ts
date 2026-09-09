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

export async function saveEntityPin(collName: string, docId: string, cleanInputPin: string): Promise<void> {
  if (!cleanInputPin || !docId) return;
  const newScrypt = hashPinWithUniqueSalt(cleanInputPin);
  const lookupHash = computeLookupHash(cleanInputPin);
  const privatePinPayload = {
    pin: newScrypt,
    pinLookupHash: lookupHash,
    entityType: collName,
    entityId: docId,
    updatedAt: new Date()
  };

  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    const pinDocId = collName === 'admin_settings' ? 'auth_pin' : docId;
    await adminDb.doc(`private_pins/${pinDocId}`).set(privatePinPayload, { merge: true });
  } catch (e) {
    console.error(`[Server Auth] Error saving private pin for ${collName}/${docId}:`, e);
    throw e;
  }
}

export async function migratePinToHash(collName: string, docId: string, cleanInputPin: string): Promise<void> {
  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    // 1. Save to secure server-only private_pins collection
    await saveEntityPin(collName, docId, cleanInputPin);

    // 2. Cleanse legacy plaintext/hash fields from public tenant document
    const targetDocRef = collName === 'admin_settings' 
      ? adminDb.doc('admin_settings/auth_pin') 
      : adminDb.collection(collName).doc(docId);

    const docSnap = await targetDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      const updates: Record<string, any> = {};
      if ('pin' in data) updates.pin = null;
      if ('ownerPin' in data) updates.ownerPin = null;
      if ('adminPin' in data) updates.adminPin = null;
      if ('pinLookupHash' in data) updates.pinLookupHash = null;

      if (Object.keys(updates).length > 0) {
        await targetDocRef.set(updates, { merge: true });
      }
    }

    console.log(`[Server Auth] Auto-migrated credentials to private_pins for ${collName}/${docId}`);
  } catch (e) {
    console.error(`[Server Auth] Error auto-migrating PIN for ${collName}/${docId}:`, e);
  }
}

// Firestore-Backed Rate Limiter (safe across multiple Cloud Run instances)
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;

// In-memory LRU fallback when adminDb is unavailable
const memoryFallback = new Map<string, { count: number; resetAt: number }>();

function checkRateLimitInMemory(ip: string): boolean {
  const now = Date.now();
  const entry = memoryFallback.get(ip);
  if (!entry || now > entry.resetAt) {
    memoryFallback.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export async function checkRateLimit(ip: string): Promise<boolean> {
  if (!adminDb) return checkRateLimitInMemory(ip);

  const docId = crypto.createHash('sha256').update(ip).digest('hex');
  const ref = adminDb.doc(`rate_limits/${docId}`);

  try {
    return await adminDb.runTransaction(async (t: any) => {
      const snap = await t.get(ref);
      const now = Date.now();
      const data = snap.exists ? snap.data() || {} : null;

      if (!data || now > data.resetAt) {
        t.set(ref, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS, expiresAt: new Date(now + RATE_LIMIT_WINDOW_MS) });
        return true;
      }
      if (data.count >= RATE_LIMIT_MAX_ATTEMPTS) {
        return false;
      }
      t.update(ref, { count: data.count + 1 });
      return true;
    });
  } catch (e) {
    console.error('[Server Auth] Rate limit transaction failed, failing closed to in-memory:', e);
    return checkRateLimitInMemory(ip);
  }
}

export async function resetRateLimit(ip: string): Promise<void> {
  memoryFallback.delete(ip);
  if (!adminDb) return;
  const docId = crypto.createHash('sha256').update(ip).digest('hex');
  try {
    await adminDb.doc(`rate_limits/${docId}`).delete();
  } catch (e) {
    console.error('[Server Auth] Failed to reset Firestore rate limit doc:', e);
  }
}

// Server Database Access Abstractions
export async function getAdminPin(): Promise<string> {
  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    // 1. Check secure private_pins collection first
    const privSnap = await adminDb.doc('private_pins/auth_pin').get();
    if (privSnap.exists && privSnap.data()?.pin) {
      return String(privSnap.data().pin);
    }

    // 2. Fallback to legacy admin_settings document
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

  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }

    // Phase 1: Query secure server-only private_pins collection
    try {
      const privSnap = await adminDb.collection('private_pins')
        .where('entityType', '==', collName)
        .where('pinLookupHash', '==', lookupHash)
        .limit(5)
        .get();

      for (const privDoc of privSnap.docs) {
        const privData = privDoc.data() || {};
        const entityId = privData.entityId || privDoc.id;
        const check = verifyDocMatch(normPin, privData);
        if (check.matches && !seenIds.has(entityId)) {
          seenIds.add(entityId);
          // Fetch actual public tenant document
          const entitySnap = await adminDb.collection(collName).doc(entityId).get();
          if (entitySnap.exists) {
            matches.push({ id: entityId, data: entitySnap.data(), isLegacyMatch: check.isLegacy });
          }
        }
      }
    } catch (privErr) {
      // Bounded fallback if private_pins index is warming
    }

    // If match found in private_pins, return immediately
    if (matches.length > 0) {
      return matches;
    }

    // Phase 2: Legacy fallback queries for unmigrated accounts
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

    // Phase 3: Bounded collection scan for legacy unhashed records (ensures zero lockout)
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

export async function checkPinAvailabilityAcrossAll(
  normPin: string,
  excludeId?: string
): Promise<{
  taken: boolean;
  role?: string;
  roleKey?: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage';
  name?: string;
  accountId?: string;
  account?: any;
}> {
  if (!normPin) return { taken: false };

  // 1. Check Admin PIN
  const adminPinStored = await getAdminPin();
  if (adminPinStored && verifyPinMatch(normPin, adminPinStored).matches) {
    if (!excludeId || excludeId !== 'auth_pin') {
      return {
        taken: true,
        role: 'مسؤول النظام (الآدمن الرئيسي)',
        roleKey: 'admin',
        name: 'الآدمن',
        accountId: 'auth_pin'
      };
    }
  }

  // 2. Check collections
  const collectionsToCheck: Array<{
    name: string;
    roleKey: 'supervisor' | 'delegate' | 'staff' | 'garage';
    label: string;
  }> = [
    { name: 'supervisors', roleKey: 'supervisor', label: 'مشرف نظام' },
    { name: 'delegates', roleKey: 'delegate', label: 'مندوب شحن' },
    { name: 'staff', roleKey: 'staff', label: 'موظف جراج' },
    { name: 'garages', roleKey: 'garage', label: 'صاحب جراج' }
  ];

  for (const coll of collectionsToCheck) {
    try {
      const docs = await queryAccountWherePin(coll.name, normPin);
      for (const dDoc of docs) {
        if (excludeId && dDoc.id === excludeId) continue;
        const docData = dDoc.data || {};
        return {
          taken: true,
          role: coll.label,
          roleKey: coll.roleKey,
          name: docData.name || docData.ownerName || docData.garageName || 'مستخدم آخر',
          accountId: dDoc.id,
          account: docData
        };
      }
    } catch (e) {
      console.error(`[Server Auth] Error checking pin in collection ${coll.name}:`, e);
    }
  }

  return { taken: false };
}

// Server-Authoritative Vehicle Cost Calculation
// Mirrors src/utils/index.ts calculateCost() — keep the two in sync if either changes.
export function calculateVehicleCost(
  vehicleData: { isSubscriber?: boolean; type?: string; entryTime: any },
  garageData: { hourlyRate?: number; overnightRate?: number },
  now: number = Date.now()
): number {
  if (vehicleData.isSubscriber) return 0;

  const entryTime = vehicleData.entryTime?.toDate
    ? vehicleData.entryTime.toDate()
    : new Date(vehicleData.entryTime);
  if (!entryTime || isNaN(entryTime.getTime())) return 0;

  const diffMs = now - entryTime.getTime();

  // 5-minute grace period: protects against accidental/instant check-in errors
  if (diffMs < 5 * 60 * 1000) return 0;

  const type = vehicleData.type || 'hourly';

  if (type === 'overnight') {
    const overnightRate = Number(garageData.overnightRate || 0);
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return Number((days * overnightRate).toFixed(2));
  }

  const hourlyRate = Number(garageData.hourlyRate || 0);
  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  return Number((hours * hourlyRate).toFixed(2));
}

