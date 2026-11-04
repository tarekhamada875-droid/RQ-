/**
 * PIN repository — Firestore CRUD operations for PIN credentials.
 *
 * Extracted from server/utils.ts (Wave 6a). Contains all Firestore
 * read/write operations for the private_pins and pin_reservations
 * collections. Depends on pinCrypto.ts for hashing and verification.
 */
import { adminDb } from './firebaseAdmin';
import {
  hashPinWithUniqueSalt,
  computeLookupHash,
  verifyDocMatch,
  verifyPinMatch,
} from './pinCrypto';

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
  const privateSnap = await transaction.get(privateRef);
  const newReservationSnap = await transaction.get(newReservationRef);
  const existingReservation = newReservationSnap.exists ? newReservationSnap.data() || {} : null;

  if (existingReservation && (existingReservation.entityType !== collName || existingReservation.entityId !== pinDocId)) {
    throw new Error('PIN_ALREADY_TAKEN');
  }

  const oldLookupHash = privateSnap.exists ? privateSnap.data()?.pinLookupHash : null;
  let oldReservationRef: any;
  let oldReservationSnap: any;
  if (oldLookupHash && oldLookupHash !== lookupHash) {
    oldReservationRef = adminDb.doc(`pin_reservations/${oldLookupHash}`);
    oldReservationSnap = await transaction.get(oldReservationRef);
  }

  if (oldReservationSnap?.exists) {
    const oldReservation = oldReservationSnap.data() || {};
    if (oldReservation.entityType === collName && oldReservation.entityId === pinDocId) {
      transaction.delete(oldReservationRef);
    }
  }

  const now = new Date();
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
  const matches: Array<{ id: string; data: any; isLegacyMatch: boolean }> = [];
  const seenIds = new Set<string>();

  try {
    if (!adminDb) {
      throw new Error('ADMIN_SDK_NOT_INITIALIZED');
    }

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
        const entitySnap = await adminDb.collection(collName).doc(entityId).get();
        if (entitySnap.exists) {
          matches.push({ id: entityId, data: entitySnap.data(), isLegacyMatch: check.isLegacy });
        }
      }
    }

    if (matches.length > 0) {
      return matches;
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
  roleKey?: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage';
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

  const [adminPinStored, ...collectionResults] = await Promise.all([
    getAdminPin(),
    ...collectionsToCheck.map((coll) => queryAccountWherePin(coll.name, normPin))
  ]);

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
