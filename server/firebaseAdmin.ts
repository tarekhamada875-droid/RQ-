import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

function loadFirebaseConfig(): any {
  const fallbackConfig = {
    projectId: 'gen-lang-client-0091669619',
    appId: '1:841039846471:web:2499d21dd43c7af2652562',
    apiKey: 'AIzaSyAlX0k1nFD1E53_Y8EVJCyEByD1pz92XdE',
    authDomain: 'gen-lang-client-0091669619.firebaseapp.com',
    firestoreDatabaseId: 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759',
    storageBucket: 'gen-lang-client-0091669619.firebasestorage.app',
    messagingSenderId: '841039846471'
  };

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[Server Auth] Error reading firebase-applet-config.json from fs, using embedded fallback:', e);
  }
  return fallbackConfig;
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
      let sa: any;
      try {
        const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        sa = JSON.parse(rawSA);
      } catch (parseErr) {
        console.error('[Server Auth] Failed to JSON.parse FIREBASE_SERVICE_ACCOUNT:', parseErr);
      }

      if (sa && typeof sa === 'object') {
        adminApp = initAdminApp({
          credential: cert(sa),
          projectId: sa.project_id || firebaseConfig.projectId
        }, 'admin-app');
        console.log('[Server Auth] Initialized Firebase Admin SDK with service account credentials for project:', sa.project_id || firebaseConfig.projectId);
      }
    }

    if (!adminApp) {
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
