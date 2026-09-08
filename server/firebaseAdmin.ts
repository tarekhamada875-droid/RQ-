import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase Admin SDK if credentials exist
let adminDb: any = null;
let adminAuth: any = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const existingApps = getAdminApps();
    const adminApp = existingApps.find(a => a.name === 'admin-app') || initAdminApp({
      credential: cert(sa),
      projectId: firebaseConfig.projectId
    }, 'admin-app');
    
    adminDb = getAdminFirestore(adminApp, (firebaseConfig as any).firestoreDatabaseId);
    adminAuth = getAdminAuth(adminApp);
    console.log('[Server Auth] Initialized Firebase Admin SDK with service account credentials');
  }
} catch (e) {
  console.warn('[Server Auth] Could not initialize Firebase Admin SDK:', e);
}

export {
  adminDb,
  adminAuth,
  firebaseConfig
};
