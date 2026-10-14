import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-rq-unified-hono',
  firestore: {
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
    await setDoc(doc(db, 'system_config/safe-config'), { startupNotice: 'synthetic' });

    await setDoc(doc(db, 'garages/g-1/subscribers/sub-1'), {
      id: 'sub-1', ownerName: 'Synthetic Owner', phone: '000', plateNumber: 'ABC123',
      plateNumberRaw: 'ABC123', startDate: '2026-10-01', endDate: '2026-10-31',
      garageId: 'g-1', createdAt: new Date()
    });
    await setDoc(doc(db, 'garages/g-1/daily_counts/2026-10-07'), {
      dateId: '2026-10-07', count: 1, limit: 10
    });
  });

  // A positive assertion plus a negative assertion proves the checked-in rules
  // file is actually loaded by the emulator rather than relying on JS policy mocks.
  const adminDb = env.authenticatedContext('admin-uid').firestore();
  const ownerDb = env.authenticatedContext('owner-uid').firestore();
  const inactiveOwnerDb = env.authenticatedContext('inactive-owner-uid').firestore();
  const staffDb = env.authenticatedContext('staff-uid').firestore();
  const otherGarageStaffDb = env.authenticatedContext('other-garage-staff-uid').firestore();
  const delegateDb = env.authenticatedContext('delegate-uid').firestore();
  const unauthenticatedDb = env.unauthenticatedContext().firestore();

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
  await assertSucceeds(updateDoc(doc(ownerDb, 'garages/g-1'), { trialDecision: 'continued' }));
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

  // Any signed-in role can read the intended config projection; only Admin writes it.
  await assertSucceeds(getDoc(doc(ownerDb, 'system_config/safe-config')));
  await assertSucceeds(getDoc(doc(staffDb, 'system_config/safe-config')));
  await assertSucceeds(getDoc(doc(delegateDb, 'system_config/safe-config')));
  await assertFails(getDoc(doc(unauthenticatedDb, 'system_config/safe-config')));
  await assertSucceeds(updateDoc(doc(adminDb, 'system_config/safe-config'), { startupNotice: 'admin-update' }));
  await assertFails(updateDoc(doc(staffDb, 'system_config/safe-config'), { startupNotice: 'staff-update' }));

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

  console.log('Firestore rules emulator matrix passed: owner/admin/staff/delegate scopes, protected staff and garage writes, sessions, config, cross-garage denials, and retired Supervisor access.');
} finally {
  await env.cleanup();
}
