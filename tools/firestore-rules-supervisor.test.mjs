import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-rq-unified-hono',
  firestore: {
    host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
    port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
    rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  }
});

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'supervisor_sessions/sup-uid'), {
      uid: 'sup-uid', role: 'supervisor', entityId: 'sup-1', isActive: true
    });
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
  const readChecks = [
    getDoc(doc(db, 'delegates/del-1')),
    getDoc(doc(db, 'garages/g-1/subscribers/sub-1')),
    getDoc(doc(db, 'garages/g-1/daily_counts/2026-10-07'))
  ];
  await Promise.all(readChecks.map(assertSucceeds));

  const deniedWrites = [
    updateDoc(doc(db, 'delegates/del-1'), { name: 'Should Be Denied' }),
    deleteDoc(doc(db, 'delegates/del-1')),
    updateDoc(doc(db, 'garages/g-1/subscribers/sub-1'), { ownerName: 'Should Be Denied', phone: '001' }),
    deleteDoc(doc(db, 'garages/g-1/subscribers/sub-1')),
    updateDoc(doc(db, 'garages/g-1/daily_counts/2026-10-07'), { count: 2 }),
    setDoc(doc(db, 'garages/g-1/daily_counts/2026-10-08'), { dateId: '2026-10-08', count: 1, limit: 10 })
  ];
  await Promise.all(deniedWrites.map(assertFails));
  console.log('Supervisor rules test passed: read monitoring allowed; six mutation attempts denied.');
} finally {
  await env.cleanup();
}
