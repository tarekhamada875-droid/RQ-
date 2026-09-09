import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

function loadFirebaseConfig(): any {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[Server Auth] Error reading firebase-applet-config.json from fs:', e);
  }
  return { projectId: 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759' };
}

const firebaseConfig = loadFirebaseConfig();

// Initialize Firebase Admin SDK if credentials exist
let adminDb: any = null;
let adminAuth: any = null;

try {
  const existingApps = getAdminApps();
  let adminApp = existingApps.find(a => a.name === 'admin-app');

  if (!adminApp) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      adminApp = initAdminApp({
        credential: cert(sa),
        projectId: firebaseConfig.projectId
      }, 'admin-app');
      console.log('[Server Auth] Initialized Firebase Admin SDK with service account credentials');
    } else {
      // Attempt Application Default Credentials (GCP/Cloud Run native environment)
      try {
        adminApp = initAdminApp({
          projectId: firebaseConfig.projectId
        }, 'admin-app');
        console.log('[Server Auth] Initialized Firebase Admin SDK with default environment credentials');
      } catch (adcErr) {
        console.warn('[Server Auth] No FIREBASE_SERVICE_ACCOUNT or Application Default Credentials found:', adcErr);
      }
    }
  }

  if (adminApp) {
    adminDb = getAdminFirestore(adminApp, (firebaseConfig as any).firestoreDatabaseId);
    adminAuth = getAdminAuth(adminApp);
  }
} catch (e) {
  console.warn('[Server Auth] Could not initialize Firebase Admin SDK:', e);
}

export {
  adminDb,
  adminAuth,
  firebaseConfig
};
