/**
 * PIN repository — Firestore CRUD operations for PIN credentials.
 *
 * Extracted from server/utils.ts (Wave 6a). Contains all Firestore
 * read/write operations for the private_pins and pin_reservations
 * collections. Depends on pinCrypto.ts for hashing and verification.
 *
 * Permanent retirement ("used once, never again"):
 *   When a PIN is changed or its owning entity is deleted, the old PIN is
 *   NOT freed for reuse. Instead, a doc is written to the `retired_pins`
 *   collection keyed by `lookupHash`. Any future attempt to assign that
 *   PIN (or check its availability) will fail with `PIN_PREVIOUSLY_USED`.
 *
 *   5-minute typo grace: when a PIN is CHANGED (not deleted), the old PIN
 *   is only retired if it was active for > 5 minutes. This prevents a
 *   typo'd PIN from being permanently burned if the admin catches it
 *   immediately. Entity DELETION has no grace period — the PIN is always
 *   retired.
 */
import { adminDb } from './firebaseAdmin';
import {
  hashPinWithUniqueSalt,
  computeLookupHash,
  computeLegacyLookupHash,
  isPinLookupSaltMigrated,
  verifyDocMatch,
  verifyPinMatch,
} from './pinCrypto';

/** Minimum active lifetime before a PIN is permanently retired on change. */
const PIN_RETIREMENT_GRACE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Write a `retired_pins/{lookupHash}` doc inside an existing transaction.
 * Idempotent — uses `set` with merge so re-running is safe.
 */
function retirePinInTransaction(
  transaction: any,
  lookupHash: string,
  lastEntityId: string,
  lastEntityType: string,
  now: Date
): void {
  if (!lookupHash) return;
  const retiredRef = adminDb.doc(`retired_pins/${lookupHash}`);
  transaction.set(retiredRef, {
    lookupHash,
    lastEntityId,
    lastEntityType,
    retiredAt: now,
    // updatedAt kept in sync so future rotations of the SAME PIN (which
    // shouldn't happen because retired is forever) at least have a sane
    // last-touch timestamp.
    updatedAt: now,
  }, { merge: true });
}

export async function saveEntityPinInTransaction(
  transaction: any,
  collName: string,
  docId: string,
  cleanInputPin: string
): Promise<void> {
  if (!cleanInputPin || !docId) return;
  if (!adminDb) throw new Error('ADMIN_SDK_NOT_INITIALIZED');

  const newScrypt = hashPinWithUniqueSalt(cleanInputPin);
  const lookupHash = computeLookupHash(cleanInputPin);
  const pinDocId = collName === 'admin_settings' ? 'auth_pin' : docId;
  const privateRef = adminDb.doc(`private_pins/${pinDocId}`);
  const newReservationRef = adminDb.doc(`pin_reservations/${lookupHash}`);
  const retiredRef = adminDb.doc(`retired_pins/${lookupHash}`);
  const privateSnap = await transaction.get(privateRef);
  const newReservationSnap = await transaction.get(newReservationRef);
  const retiredSnap = await transaction.get(retiredRef);
  const existingReservation = newReservationSnap.exists ? newReservationSnap.data() || {} : null;

  // 1. Active-PIN collision — another entity currently holds this PIN.
  if (existingReservation && (existingReservation.entityType !== collName || existingReservation.entityId !== pinDocId)) {
    throw new Error('PIN_ALREADY_TAKEN');
  }
  // 2. Retired-PIN collision — this PIN was used by some entity in the past
  //    (changed away or entity deleted). Permanent — never reuse.
  if (retiredSnap.exists) {
    throw new Error('PIN_PREVIOUSLY_USED');
  }

  const oldLookupHash = privateSnap.exists ? privateSnap.data()?.pinLookupHash : null;
  let oldReservationRef: any;
  let oldReservationSnap: any;
  if (oldLookupHash && oldLookupHash !== lookupHash) {
    oldReservationRef = adminDb.doc(`pin_reservations/${oldLookupHash}`);
    oldReservationSnap = await transaction.get(oldReservationRef);
  }

  const now = new Date();

  if (oldReservationSnap?.exists) {
    const oldReservation = oldReservationSnap.data() || {};
    if (oldReservation.entityType === collName && oldReservation.entityId === pinDocId) {
      // Retire the old PIN before deleting its reservation. 5-minute grace:
      // if the old PIN was set less than 5 minutes ago, skip retirement so
      // typo'd PINs aren't permanently burned.
      const oldUpdatedAt = oldReservation.updatedAt;
      const oldUpdatedMs = oldUpdatedAt?.toMillis
        ? oldUpdatedAt.toMillis()
        : (oldUpdatedAt instanceof Date
            ? oldUpdatedAt.getTime()
            : (typeof oldUpdatedAt === 'string' ? Date.parse(oldUpdatedAt) : 0));
      const ageMs = oldUpdatedMs > 0 ? (now.getTime() - oldUpdatedMs) : 0;
      if (ageMs >= PIN_RETIREMENT_GRACE_MS) {
        retirePinInTransaction(transaction, oldLookupHash, pinDocId, collName, now);
      }
      transaction.delete(oldReservationRef);
    }
  }

  transaction.set(newReservationRef, {
    lookupHash,
    entityType: collName,
    entityId: pinDocId,
    updatedAt: now
  });
  transaction.set(privateRef, {
    pin: newScrypt,
    pinLookupHash: lookupHash,
    entityType: collName,
    entityId: pinDocId,
    updatedAt: now
  }, { merge: true });
}

export async function deleteEntityPinInTransaction(
  transaction: any,
  collName: string,
  docId: string
): Promise<void> {
  if (!adminDb || !docId) return;
  const privateRef = adminDb.doc(`private_pins/${docId}`);
  const privateSnap = await transaction.get(privateRef);
  if (!privateSnap.exists) return;

  const privateData = privateSnap.data() || {};
  if (privateData.entityType !== collName || privateData.entityId !== docId) return;

  const lookupHash = typeof privateData.pinLookupHash === 'string' ? privateData.pinLookupHash : '';
  let reservationRef: any = null;
  let reservationSnap: any = null;
  if (lookupHash) {
    reservationRef = adminDb.doc(`pin_reservations/${lookupHash}`);
    reservationSnap = await transaction.get(reservationRef);
  }

  const now = new Date();

  // Entity deletion: ALWAYS retire the PIN. No grace period — the entity is
  // going away, so its PIN must be permanently retired per the
  // "used once, never again" policy.
  if (lookupHash) {
    retirePinInTransaction(transaction, lookupHash, docId, collName, now);
  }

  if (reservationSnap?.exists) {
    const reservationData = reservationSnap.data() || {};
    if (reservationData.entityType === collName && reservationData.entityId === docId) {
      transaction.delete(reservationRef);
    }
  }
  transaction.delete(privateRef);
}

export async function saveEntityPin(collName: string, docId: string, cleanInputPin: string): Promise<void> {
  if (!cleanInputPin || !docId) return;

  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    await adminDb.runTransaction((transaction: any) =>
      saveEntityPinInTransaction(transaction, collName, docId, cleanInputPin)
    );
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
    await saveEntityPin(collName, docId, cleanInputPin);

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

export async function getAdminPin(): Promise<string> {
  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }
    const privSnap = await adminDb.doc('private_pins/auth_pin').get();
    if (privSnap.exists && privSnap.data()?.pin) {
      return String(privSnap.data().pin);
    }
    return '';
  } catch (e) {
    console.error('[Server Auth] Error reading admin pin:', e);
    throw e;
  }
}

export async function queryAccountWherePin(collName: string, normPin: string): Promise<Array<{ id: string; data: any; isLegacyMatch: boolean }>> {
  const lookupHash = computeLookupHash(normPin);
  // Audit N22: when the operator has migrated PIN_LOOKUP_SALT, existing
  // private_pins docs have pinLookupHash computed with the LEGACY salt.
  // Lookups by the active salt would miss them. Fall back to the legacy
  // salt for read lookups so existing PINs continue to verify.
  const legacyLookupHash = isPinLookupSaltMigrated() ? computeLegacyLookupHash(normPin) : null;
  const matches: Array<{ id: string; data: any; isLegacyMatch: boolean }> = [];
  const seenIds = new Set<string>();

  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }

    // Try the active salt first; if no matches and migration is in
    // progress, try the legacy salt.
    const lookupHashesToTry = legacyLookupHash ? [lookupHash, legacyLookupHash] : [lookupHash];

    for (const tryHash of lookupHashesToTry) {
      const privSnap = await adminDb.collection('private_pins')
        .where('entityType', '==', collName)
        .where('pinLookupHash', '==', tryHash)
        .limit(5)
        .get();

      for (const privDoc of privSnap.docs) {
        const privData = privDoc.data() || {};
        const entityId = privData.entityId || privDoc.id;
        const check = verifyDocMatch(normPin, privData);
        if (check.matches && !seenIds.has(entityId)) {
          seenIds.add(entityId);
          const entitySnap = await adminDb.collection(collName).doc(entityId).get();
          if (entitySnap.exists) {
            matches.push({ id: entityId, data: entitySnap.data(), isLegacyMatch: check.isLegacy });
          }
        }
      }

      if (matches.length > 0) {
        return matches;
      }
    }

  } catch (e) {
    console.error(`[Server Auth] Error querying collection ${collName} where pin:`, e);
    throw e;
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
  roleKey?: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage' | 'retired';
  name?: string;
  accountId?: string;
  account?: any;
}> {
  if (!normPin) return { taken: false };

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

  const lookupHash = computeLookupHash(normPin);
  // Audit N22: when the salt has been migrated, retired_pins docs may have
  // been written with the legacy salt. Check both paths so a previously-
  // retired PIN can't be silently reused just because the salt changed.
  const legacyLookupHash = isPinLookupSaltMigrated() ? computeLegacyLookupHash(normPin) : null;

  const [adminPinStored, retiredSnap, retiredLegacySnap, ...collectionResults] = await Promise.all([
    getAdminPin(),
    adminDb ? adminDb.doc(`retired_pins/${lookupHash}`).get() : Promise.resolve(null),
    (adminDb && legacyLookupHash) ? adminDb.doc(`retired_pins/${legacyLookupHash}`).get() : Promise.resolve(null),
    ...collectionsToCheck.map((coll) => queryAccountWherePin(coll.name, normPin))
  ]);

  // Permanent retirement check — this PIN was used by some entity in the
  // past and is forever blocked from reuse. Either salt-path counts.
  if ((retiredSnap && retiredSnap.exists) || (retiredLegacySnap && retiredLegacySnap.exists)) {
    return {
      taken: true,
      role: 'رمز مستخدم سابقاً',
      roleKey: 'retired',
      name: 'رمز مستخدم سابقاً',
      accountId: 'retired'
    };
  }

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

  for (let index = 0; index < collectionsToCheck.length; index += 1) {
    const coll = collectionsToCheck[index];
    const docs = collectionResults[index] || [];
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
  }

  return { taken: false };
}
