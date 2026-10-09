import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-rq-unified-hono',
  firestore: {
    host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
    port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
    rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  }
});

try {
  const legacySupervisor = { name: 'Synthetic Preserved Supervisor', role: 'supervisor' };
  const legacySession = {
    uid: 'sup-uid', role: 'supervisor', entityId: 'sup-1', sessionId: 'legacy-session', isActive: true
  };

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'supervisor_sessions/sup-uid'), legacySession);
    await setDoc(doc(db, 'supervisors/sup-1'), legacySupervisor);
    await setDoc(doc(db, 'delegates/del-1'), {
      name: 'Synthetic Delegate', phone: '', role: 'delegate', createdAt: new Date(), totalRechargedAmount: 0
    });
    await setDoc(doc(db, 'garages/g-1'), {
      name: 'Synthetic Garage', phone: '000', hourlyRate: 1, overnightRate: 1,
      subscriptionExpiry: new Date(), createdAt: new Date(), billingModel: 'subscription'
    });
    await setDoc(doc(db, 'garages/g-1/subscribers/sub-1'), {
      id: 'sub-1', ownerName: 'Synthetic Owner', phone: '000', plateNumber: 'ABC123',
      plateNumberRaw: 'ABC123', startDate: '2026-10-01', endDate: '2026-10-31',
      garageId: 'g-1', createdAt: new Date()
    });
    await setDoc(doc(db, 'garages/g-1/daily_counts/2026-10-07'), {
      dateId: '2026-10-07', count: 1, limit: 10
    });
  });

  const db = env.authenticatedContext('sup-uid').firestore();
  const deniedReads = [
    getDoc(doc(db, 'supervisor_sessions/sup-uid')),
    getDoc(doc(db, 'supervisors/sup-1')),
    getDocs(collection(db, 'supervisors')),
    getDoc(doc(db, 'delegates/del-1')),
    getDoc(doc(db, 'garages/g-1')),
    getDocs(collection(db, 'garages')),
    getDoc(doc(db, 'garages/g-1/subscribers/sub-1')),
    getDoc(doc(db, 'garages/g-1/daily_counts/2026-10-07'))
  ];
  await Promise.all(deniedReads.map(assertFails));

  const deniedWrites = [
    updateDoc(doc(db, 'supervisor_sessions/sup-uid'), { lastActive: new Date() }),
    deleteDoc(doc(db, 'supervisor_sessions/sup-uid')),
    setDoc(doc(db, 'supervisor_sessions/new-uid'), legacySession),
    updateDoc(doc(db, 'supervisors/sup-1'), { name: 'Must Not Change' }),
    deleteDoc(doc(db, 'supervisors/sup-1')),
    setDoc(doc(db, 'supervisors/new-id'), legacySupervisor),
    updateDoc(doc(db, 'delegates/del-1'), { name: 'Should Be Denied' }),
    deleteDoc(doc(db, 'delegates/del-1')),
    updateDoc(doc(db, 'garages/g-1/subscribers/sub-1'), { ownerName: 'Should Be Denied', phone: '001' }),
    deleteDoc(doc(db, 'garages/g-1/subscribers/sub-1')),
    updateDoc(doc(db, 'garages/g-1/daily_counts/2026-10-07'), { count: 2 }),
    setDoc(doc(db, 'garages/g-1/daily_counts/2026-10-08'), { dateId: '2026-10-08', count: 1, limit: 10 })
  ];
  await Promise.all(deniedWrites.map(assertFails));

  await env.withSecurityRulesDisabled(async (context) => {
    const storedDb = context.firestore();
    assert.deepEqual((await getDoc(doc(storedDb, 'supervisor_sessions/sup-uid'))).data(), legacySession);
    assert.deepEqual((await getDoc(doc(storedDb, 'supervisors/sup-1'))).data(), legacySupervisor);
  });

  console.log('Supervisor rules test passed: all legacy Supervisor reads/writes denied; preserved records unchanged; non-Supervisor mutation attempts denied.');
} finally {
  await env.cleanup();
}
