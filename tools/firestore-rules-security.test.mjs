import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, writeBatch, runTransaction } from 'firebase/firestore';

const firestoreIndexes = JSON.parse(fs.readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
const staffCompositeIndex = firestoreIndexes.indexes.find((index) =>
  index.collectionGroup === 'staff' && index.queryScope === 'COLLECTION'
);
assert.deepEqual(staffCompositeIndex?.fields, [
  { fieldPath: 'garageId', order: 'ASCENDING' },
  { fieldPath: 'createdAt', order: 'DESCENDING' }
], 'firestore.indexes.json must retain the staff garageId/createdAt composite index');
const activityLogCompositeIndex = firestoreIndexes.indexes.find((index) =>
  index.collectionGroup === 'activity_logs' && index.queryScope === 'COLLECTION' && index.fields.length === 2
);
assert.deepEqual(activityLogCompositeIndex?.fields, [
  { fieldPath: 'garageId', order: 'ASCENDING' },
  { fieldPath: 'timestamp', order: 'DESCENDING' }
], 'firestore.indexes.json must retain the activity_logs garageId/timestamp composite index');
const rechargeActivityLogCompositeIndex = firestoreIndexes.indexes.find((index) =>
  index.collectionGroup === 'activity_logs' && index.queryScope === 'COLLECTION' && index.fields.length === 3
);
assert.deepEqual(rechargeActivityLogCompositeIndex?.fields, [
  { fieldPath: 'garageId', order: 'ASCENDING' },
  { fieldPath: 'actionType', order: 'ASCENDING' },
  { fieldPath: 'timestamp', order: 'DESCENDING' }
], 'firestore.indexes.json must retain the ordered garage recharge activity-log index');
for (const [collectionGroup, equalityField] of [
  ['garages', 'createdByDelegateId'],
  ['garages', 'referrerId'],
  ['recharge_requests', 'delegateId']
]) {
  const pageIndex = firestoreIndexes.indexes.find((index) =>
    index.collectionGroup === collectionGroup && index.queryScope === 'COLLECTION' &&
    index.fields.some((field) => field.fieldPath === equalityField) &&
    index.fields.some((field) => field.fieldPath === 'createdAt' && field.order === 'DESCENDING')
  );
  assert.ok(pageIndex, `firestore.indexes.json must include ${collectionGroup}.${equalityField}/createdAt descending for cursor pages`);
}

const env = await initializeTestEnvironment({
  projectId: 'demo-rq-unified-hono',
  firestore: {
    databaseId: 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759',
    host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
    port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
    rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  }
});

const session = (uid, role, entityId = uid, isActive = true) => ({
  uid,
  role,
  entityId,
  sessionId: `${uid}-session`,
  isActive,
  createdAt: new Date(),
  lastActive: new Date()
});

const garage = (name, extra = {}) => ({
  name,
  phone: '000',
  hourlyRate: 1,
  overnightRate: 1,
  subscriptionExpiry: new Date(),
  createdAt: new Date(),
  billingModel: 'subscription',
  ...extra
});

const staff = (name, garageId) => ({
  name,
  phone: '000',
  garageId,
  role: 'staff',
  pin: '1234'
});

// Mirrors claimSessionInTransaction's browser fallback writes. The Worker is
// authoritative; these writes must remain blocked when server validation fails.
const attemptBrowserSessionClaimFallback = (db, uid, sessionId) => runTransaction(db, async (transaction) => {
  const entityRef = doc(db, 'garages/g-1');
  const securitySessionRef = doc(db, `garage_sessions/${uid}`);
  const [entitySnap, securitySessionSnap] = await Promise.all([
    transaction.get(entityRef),
    transaction.get(securitySessionRef)
  ]);

  const data = entitySnap.exists() ? entitySnap.data() : {};
  const existing = Array.isArray(data.activeSessionIds)
    ? data.activeSessionIds.filter((id) => typeof id === 'string' && id.length > 0)
    : (data.currentSessionId ? [data.currentSessionId] : []);
  const activeSessionIds = [...new Set([...existing, sessionId])].slice(-100);

  if (entitySnap.exists()) {
    transaction.update(entityRef, {
      currentSessionId: sessionId,
      activeSessionIds,
      lastActive: new Date()
    });
  }
  if (securitySessionSnap.exists()) {
    transaction.update(securitySessionRef, {
      isActive: true,
      sessionId,
      lastActive: new Date()
    });
  }
});

try {
  const legacySupervisor = { name: 'Synthetic Preserved Supervisor', role: 'supervisor' };
  const legacySession = {
    uid: 'sup-uid', role: 'supervisor', entityId: 'sup-1',
    sessionId: 'legacy-session', isActive: true
  };

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'admin_sessions/admin-uid'), session('admin-uid', 'admin'));
    await setDoc(doc(db, 'garage_sessions/owner-uid'), session('owner-uid', 'garage', 'g-1'));
    await setDoc(doc(db, 'garage_sessions/inactive-owner-uid'), session('inactive-owner-uid', 'garage', 'g-1', false));
    await setDoc(doc(db, 'staff_sessions/staff-uid'), session('staff-uid', 'staff', 'staff-1'));
    await setDoc(doc(db, 'staff_sessions/other-garage-staff-uid'), session('other-garage-staff-uid', 'staff', 'staff-g-2'));
    await setDoc(doc(db, 'delegate_sessions/delegate-uid'), session('delegate-uid', 'delegate', 'del-1'));
    await setDoc(doc(db, 'supervisor_sessions/sup-uid'), legacySession);
    await setDoc(doc(db, 'supervisors/sup-1'), legacySupervisor);

    await setDoc(doc(db, 'delegates/del-1'), {
      name: 'Synthetic Delegate', phone: '', role: 'delegate', createdAt: new Date(), totalRechargedAmount: 0
    });
    await setDoc(doc(db, 'delegates/del-2'), {
      name: 'Other Delegate', phone: '', role: 'delegate', createdAt: new Date(), totalRechargedAmount: 0
    });
    await setDoc(doc(db, 'garages/g-1'), garage('Synthetic Garage', { createdByDelegateId: 'del-1' }));
    await setDoc(doc(db, 'garages/g-2'), garage('Other Synthetic Garage'));
    await setDoc(doc(db, 'staff/staff-1'), staff('Synthetic Staff', 'g-1'));
    await setDoc(doc(db, 'staff/staff-peer'), staff('Synthetic Peer', 'g-1'));
    await setDoc(doc(db, 'staff/staff-g-2'), staff('Other Garage Staff', 'g-2'));
    await setDoc(doc(db, 'staff/staff-index-newest'), {
      ...staff('Newest Indexed Staff', 'g-1'), createdAt: new Date('2026-10-15T12:00:00.000Z')
    });
    await setDoc(doc(db, 'staff/staff-index-older'), {
      ...staff('Older Indexed Staff', 'g-1'), createdAt: new Date('2026-10-14T12:00:00.000Z')
    });
    await setDoc(doc(db, 'staff/staff-index-other-garage'), {
      ...staff('Other Garage Indexed Staff', 'g-2'), createdAt: new Date('2026-10-16T12:00:00.000Z')
    });
    await setDoc(doc(db, 'system_config/safe-config'), {
      startupNotice: 'synthetic',
      walletNumber: 'synthetic-wallet',
      monthlySubscribersFlatFee: 250,
      syntheticSensitiveField: 'private-to-authenticated'
    });
    await setDoc(doc(db, 'admin_settings/wallet_number'), { value: 'synthetic-wallet' });
    await setDoc(doc(db, 'admin_settings/subscription_prices'), { value: { monthly: 500 } });
    await setDoc(doc(db, 'admin_settings/private_setting'), { value: 'admin-only' });
    await setDoc(doc(db, 'packages/existing-legacy-record'), {
      name: 'Synthetic stored monthly package', price: 300, catalogType: 'legacy_time',
      durationDays: 30, dailyCapacity: 50
    });

    await setDoc(doc(db, 'garages/g-1/subscribers/sub-1'), {
      id: 'sub-1', ownerName: 'Synthetic Owner', phone: '000', plateNumber: 'ABC123',
      plateNumberRaw: 'ABC123', startDate: '2026-10-01', endDate: '2026-10-31',
      garageId: 'g-1', createdAt: new Date()
    });
    await setDoc(doc(db, 'garages/g-1/daily_counts/2026-10-07'), {
      dateId: '2026-10-07', count: 1, limit: 10
    });

    const activityLogBatch = writeBatch(db);
    for (let index = 0; index < 205; index += 1) {
      const logId = `activity-index-${String(index).padStart(3, '0')}`;
      activityLogBatch.set(doc(db, `activity_logs/${logId}`), {
        garageId: 'g-1',
        timestamp: new Date(Date.UTC(2026, 9, 15, 12, 0, 0) - index * 60 * 1000),
        actionType: 'vehicle_exit',
        staffName: 'Synthetic Staff',
        plateNumberRaw: `TEST${index}`
      });
    }
    await activityLogBatch.commit();

    const orderedStaff = await getDocs(query(
      collection(db, 'staff'),
      where('garageId', '==', 'g-1'),
      orderBy('createdAt', 'desc')
    ));
    assert.deepEqual(orderedStaff.docs.map((staffDoc) => staffDoc.id), [
      'staff-index-newest',
      'staff-index-older'
    ], 'staff query must be garage-scoped and descending; legacy staff without createdAt remain excluded');
  });

  // A positive assertion plus a negative assertion proves the checked-in rules
  // file is actually loaded by the emulator rather than relying on JS policy mocks.
  const adminDb = env.authenticatedContext('admin-uid').firestore();
  const ownerDb = env.authenticatedContext('owner-uid').firestore();
  const fallbackOwnerDb = env.authenticatedContext('fallback-owner-uid').firestore();
  const inactiveOwnerDb = env.authenticatedContext('inactive-owner-uid').firestore();
  const staffDb = env.authenticatedContext('staff-uid').firestore();
  const otherGarageStaffDb = env.authenticatedContext('other-garage-staff-uid').firestore();
  const delegateDb = env.authenticatedContext('delegate-uid').firestore();
  const unauthenticatedDb = env.unauthenticatedContext().firestore();

  const orderedActivityLogs = await getDocs(query(
    collection(adminDb, 'activity_logs'),
    where('garageId', '==', 'g-1'),
    where('timestamp', '>=', new Date('2026-10-15T00:00:00.000Z')),
    orderBy('timestamp', 'desc'),
    limit(200)
  ));
  assert.equal(orderedActivityLogs.size, 200, 'activity history query must retain its documented 200-record cap');
  assert.equal(orderedActivityLogs.docs[0].id, 'activity-index-000', 'activity history must return the newest matching record first');
  assert.equal(orderedActivityLogs.docs[199].id, 'activity-index-199', 'the final record must still be within the newest 200');
  assert.ok(orderedActivityLogs.docs.every((log) => log.data().garageId === 'g-1'), 'activity history must remain garage-scoped');

  // Admin, owner, staff, and delegate access stays scoped to the expected records.
  await assertSucceeds(getDoc(doc(adminDb, 'garages/g-1')));
  await assertSucceeds(getDocs(collection(adminDb, 'garages')));
  await assertSucceeds(getDoc(doc(ownerDb, 'garages/g-1')));
  await assertFails(getDoc(doc(ownerDb, 'garages/g-2')));
  await assertSucceeds(getDoc(doc(staffDb, 'garages/g-1')));
  await assertFails(getDoc(doc(staffDb, 'garages/g-2')));
  await assertSucceeds(getDoc(doc(staffDb, 'staff/staff-peer')));
  await assertFails(getDoc(doc(otherGarageStaffDb, 'staff/staff-peer')));
  await assertSucceeds(getDoc(doc(delegateDb, 'garages/g-1')));
  await assertFails(getDoc(doc(delegateDb, 'garages/g-2')));
  await assertSucceeds(getDoc(doc(delegateDb, 'delegates/del-1')));
  await assertFails(getDoc(doc(delegateDb, 'delegates/del-2')));
  await assertFails(getDoc(doc(unauthenticatedDb, 'garages/g-1')));

  // Signed-in users retain the two live production settings reads, but not other Admin settings.
  await assertSucceeds(getDoc(doc(ownerDb, 'admin_settings/wallet_number')));
  await assertSucceeds(getDoc(doc(ownerDb, 'admin_settings/subscription_prices')));
  await assertFails(getDoc(doc(ownerDb, 'admin_settings/private_setting')));

  // Every client-written package must use the exact credit-bundle catalog format.
  await assertSucceeds(setDoc(doc(adminDb, 'packages/credit-bundle-valid'), {
    name: 'Synthetic 400 credits', price: 400, creditQuantity: 400,
    catalogType: 'credit_bundle', isActive: true, createdAt: new Date()
  }));
  await assertFails(setDoc(doc(adminDb, 'packages/time-based-only'), {
    name: 'Synthetic monthly package', price: 300, durationDays: 30,
    dailyCapacity: 50, catalogType: 'legacy_time'
  }));
  await assertFails(setDoc(doc(adminDb, 'packages/mixed-credit-and-duration'), {
    name: 'Synthetic mixed package', price: 400, creditQuantity: 400,
    catalogType: 'credit_bundle', durationDays: 30
  }));
  await assertFails(setDoc(doc(adminDb, 'packages/mismatched-credit-price'), {
    name: 'Synthetic mismatched bundle', price: 500, creditQuantity: 400,
    catalogType: 'credit_bundle'
  }));
  await assertSucceeds(getDoc(doc(ownerDb, 'packages/credit-bundle-valid')));
  await assertFails(getDoc(doc(ownerDb, 'packages/existing-legacy-record')));
  await assertFails(getDocs(collection(ownerDb, 'packages')));
  const visibleCreditBundles = await getDocs(query(
    collection(ownerDb, 'packages'),
    where('catalogType', '==', 'credit_bundle')
  ));
  assert.deepEqual(visibleCreditBundles.docs.map((packageDoc) => packageDoc.id), ['credit-bundle-valid']);

  // Staff may refresh only their own heartbeat; they cannot manage peer staff.
  await assertSucceeds(updateDoc(doc(staffDb, 'staff/staff-1'), { lastActive: new Date() }));
  const deniedStaffWrites = [
    updateDoc(doc(staffDb, 'staff/staff-peer'), { name: 'Must Not Change' }),
    updateDoc(doc(staffDb, 'staff/staff-peer'), { role: 'garage' }),
    updateDoc(doc(staffDb, 'staff/staff-peer'), { garageId: 'g-2' }),
    updateDoc(doc(staffDb, 'staff/staff-peer'), { pin: '9999' }),
    setDoc(doc(staffDb, 'staff/staff-new'), staff('Unauthorized', 'g-1')),
    deleteDoc(doc(staffDb, 'staff/staff-peer'))
  ];
  await Promise.all(deniedStaffWrites.map(assertFails));

  // A same-garage staff session is not an owner key for protected garage settings.
  const deniedGarageWrites = [
    updateDoc(doc(staffDb, 'garages/g-1'), { hourlyRate: 99 }),
    updateDoc(doc(staffDb, 'garages/g-1'), { overnightRate: 99 }),
    updateDoc(doc(staffDb, 'garages/g-1'), { trialDecision: 'continued' })
  ];
  await Promise.all(deniedGarageWrites.map(assertFails));
  await assertSucceeds(updateDoc(doc(staffDb, 'garages/g-1'), { lastActive: new Date() }));
  await assertFails(updateDoc(doc(inactiveOwnerDb, 'garages/g-1'), { hourlyRate: 99 }));

  // The actual garage owner and Admin retain their intended management path.
  await assertFails(updateDoc(doc(adminDb, 'garages/g-1'), {
    creditBalance: { paid: 999, referral: 0, trial: 0 }
  }));
  await assertFails(updateDoc(doc(ownerDb, 'garages/g-1'), {
    creditBalance: { paid: 999, referral: 0, trial: 0 }
  }));
  await assertSucceeds(updateDoc(doc(ownerDb, 'staff/staff-peer'), { name: 'Owner Updated Peer' }));
  await assertSucceeds(updateDoc(doc(ownerDb, 'staff/staff-peer'), { phone: '01112345678' }));
  await assertFails(updateDoc(doc(ownerDb, 'staff/staff-peer'), { role: 'garage' }));
  await assertFails(updateDoc(doc(ownerDb, 'staff/staff-peer'), { garageId: 'g-2' }));
  await assertFails(updateDoc(doc(ownerDb, 'staff/staff-peer'), { pin: '9999' }));
  await assertFails(setDoc(doc(ownerDb, 'staff/staff-owner-created'), staff('Owner Created', 'g-1')));
  await assertFails(deleteDoc(doc(ownerDb, 'staff/staff-peer')));
  await assertFails(updateDoc(doc(ownerDb, 'staff/staff-g-2'), { name: 'Cross-Garage Change' }));
  await assertFails(deleteDoc(doc(ownerDb, 'staff/staff-g-2')));
  await assertSucceeds(updateDoc(doc(ownerDb, 'garages/g-1'), { hourlyRate: 2 }));
  await assertFails(updateDoc(doc(ownerDb, 'garages/g-1'), { trialDecision: 'continued' }));
  await assertFails(updateDoc(doc(ownerDb, 'garages/g-2'), { hourlyRate: 2 }));
  await assertSucceeds(updateDoc(doc(adminDb, 'staff/staff-g-2'), { name: 'Admin Updated Staff' }));
  await assertFails(updateDoc(doc(adminDb, 'staff/staff-g-2'), { role: 'garage' }));
  await assertFails(updateDoc(doc(adminDb, 'staff/staff-g-2'), { pin: '9999' }));
  await assertFails(setDoc(doc(adminDb, 'staff/admin-created-staff'), staff('Admin Created', 'g-2')));
  await assertFails(deleteDoc(doc(adminDb, 'staff/staff-g-2')));
  await assertSucceeds(updateDoc(doc(adminDb, 'garages/g-2'), { hourlyRate: 3 }));

  // Session records remain server-created and immutable except for the caller's heartbeat.
  await assertSucceeds(getDoc(doc(ownerDb, 'garage_sessions/owner-uid')));
  await assertSucceeds(updateDoc(doc(ownerDb, 'garage_sessions/owner-uid'), { lastActive: new Date() }));
  await assertFails(updateDoc(doc(ownerDb, 'garage_sessions/owner-uid'), { isActive: false }));
  await assertFails(setDoc(doc(ownerDb, 'garage_sessions/new-owner'), session('new-owner', 'garage', 'g-1')));
  await assertFails(updateDoc(doc(ownerDb, 'garage_sessions/staff-uid'), { lastActive: new Date() }));

  // If the Worker validation/claim path fails, the legacy client transaction
  // must not be able to claim an existing session or create a new one.
  await assertFails(attemptBrowserSessionClaimFallback(ownerDb, 'owner-uid', 'browser-fallback-session'));
  await assertFails(attemptBrowserSessionClaimFallback(fallbackOwnerDb, 'fallback-owner-uid', 'browser-fallback-new-session'));
  await assertSucceeds(getDoc(doc(ownerDb, 'garage_sessions/owner-uid')));

  // Browser roles must use the Worker projection; nobody reads the raw private config document.
  for (const signedInDb of [adminDb, ownerDb, staffDb, delegateDb]) {
    await assertFails(getDoc(doc(signedInDb, 'system_config/safe-config')));
  }
  await assertFails(getDoc(doc(unauthenticatedDb, 'system_config/safe-config')));
  await assertSucceeds(updateDoc(doc(adminDb, 'system_config/safe-config'), { startupNotice: 'admin-update' }));
  await assertFails(updateDoc(doc(staffDb, 'system_config/safe-config'), { startupNotice: 'staff-update' }));

  // Subscriber reads retain their existing owner/staff/Admin/delegate scope; every mutation is Worker-only.
  const subscriberPath = 'garages/g-1/subscribers/sub-1';
  for (const readerDb of [adminDb, ownerDb, staffDb, delegateDb]) {
    await assertSucceeds(getDoc(doc(readerDb, subscriberPath)));
    await assertSucceeds(getDocs(collection(readerDb, 'garages/g-1/subscribers')));
  }
  const deniedSubscriberMutations = [adminDb, ownerDb, staffDb, delegateDb].flatMap((clientDb, index) => [
    setDoc(doc(clientDb, `garages/g-1/subscribers/client-created-${index}`), {
      id: `client-created-${index}`, ownerName: 'Client Write', phone: '000', plateNumber: 'ZZZ999',
      plateNumberRaw: 'ZZZ999', startDate: '2026-10-01', endDate: '2026-10-31', garageId: 'g-1', createdAt: new Date()
    }),
    updateDoc(doc(clientDb, subscriberPath), { ownerName: 'Unauthorized Client Update' }),
    deleteDoc(doc(clientDb, subscriberPath))
  ]);
  await Promise.all(deniedSubscriberMutations.map(assertFails));

  // Delegate self-service is limited to its own record and heartbeat field.
  await assertSucceeds(updateDoc(doc(delegateDb, 'delegates/del-1'), { lastActive: new Date() }));
  await assertFails(updateDoc(doc(delegateDb, 'delegates/del-1'), { name: 'Unauthorized Rename' }));
  await assertFails(updateDoc(doc(delegateDb, 'delegates/del-2'), { lastActive: new Date() }));
  await assertFails(updateDoc(doc(delegateDb, 'private_pins/del-1'), { pin: '1234' }));

  // Retired Supervisor history is preserved but never grants access.
  const retiredDb = env.authenticatedContext('sup-uid').firestore();
  const deniedReads = [
    getDoc(doc(retiredDb, 'supervisor_sessions/sup-uid')),
    getDoc(doc(retiredDb, 'supervisors/sup-1')),
    getDocs(collection(retiredDb, 'supervisors')),
    getDoc(doc(retiredDb, 'delegates/del-1')),
    getDoc(doc(retiredDb, 'garages/g-1')),
    getDocs(collection(retiredDb, 'garages')),
    getDoc(doc(retiredDb, 'garages/g-1/subscribers/sub-1')),
    getDoc(doc(retiredDb, 'garages/g-1/daily_counts/2026-10-07'))
  ];
  await Promise.all(deniedReads.map(assertFails));

  const deniedRetiredWrites = [
    updateDoc(doc(retiredDb, 'supervisor_sessions/sup-uid'), { lastActive: new Date() }),
    deleteDoc(doc(retiredDb, 'supervisor_sessions/sup-uid')),
    setDoc(doc(retiredDb, 'supervisor_sessions/new-uid'), legacySession),
    updateDoc(doc(retiredDb, 'supervisors/sup-1'), { name: 'Must Not Change' }),
    deleteDoc(doc(retiredDb, 'supervisors/sup-1')),
    setDoc(doc(retiredDb, 'supervisors/new-id'), legacySupervisor),
    updateDoc(doc(retiredDb, 'delegates/del-1'), { name: 'Should Be Denied' }),
    deleteDoc(doc(retiredDb, 'delegates/del-1')),
    updateDoc(doc(retiredDb, 'garages/g-1/subscribers/sub-1'), { ownerName: 'Should Be Denied', phone: '001' }),
    deleteDoc(doc(retiredDb, 'garages/g-1/subscribers/sub-1')),
    updateDoc(doc(retiredDb, 'garages/g-1/daily_counts/2026-10-07'), { count: 2 }),
    setDoc(doc(retiredDb, 'garages/g-1/daily_counts/2026-10-08'), { dateId: '2026-10-08', count: 1, limit: 10 })
  ];
  await Promise.all(deniedRetiredWrites.map(assertFails));

  // Confirm denied client attempts left the seeded legacy records untouched.
  await env.withSecurityRulesDisabled(async (context) => {
    const storedDb = context.firestore();
    assert.deepEqual((await getDoc(doc(storedDb, 'supervisor_sessions/sup-uid'))).data(), legacySession);
    assert.deepEqual((await getDoc(doc(storedDb, 'supervisors/sup-1'))).data(), legacySupervisor);
  });

  console.log('Firestore rules emulator matrix passed: owner/admin/staff/delegate scopes, staff/activity-log composite indexes and ordering, protected staff and garage writes, raw config-read denial, Worker-only subscriber mutations, cross-garage denials, and retired Supervisor access.');
} finally {
  await env.cleanup();
}
