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

let activeDb: any = null;
let activeAuth: any = null;
let isInitialized = false;

export function initializeFirebaseAdmin(env?: any) {
  if (isInitialized && !env) return;

  const existingApps = getAdminApps();
  let adminApp = existingApps.find(a => a.name === 'admin-app');

  const saEnv = env?.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = env?.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const databaseId = env?.FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

  if (!adminApp) {
    if (saEnv) {
      let sa: any;
      try {
        sa = JSON.parse(saEnv.trim());
      } catch (err) {
        console.error('[Server Auth] Failed to JSON.parse FIREBASE_SERVICE_ACCOUNT:', err);
      }
      if (sa && typeof sa === 'object') {
        adminApp = initAdminApp({
          credential: cert(sa),
          projectId: sa.project_id || projectId
        }, 'admin-app');
        console.log('[Server Auth] Initialized Firebase Admin SDK with service account credentials for project:', sa.project_id || projectId);
      }
    }

    if (!adminApp) {
      try {
        adminApp = initAdminApp({
          projectId
        }, 'admin-app');
        console.log('[Server Auth] Initialized Firebase Admin SDK with default environment credentials');
      } catch (adcErr) {
        console.warn('[Server Auth] No FIREBASE_SERVICE_ACCOUNT or Application Default Credentials found:', adcErr);
      }
    }
  }

  if (adminApp) {
    activeDb = getAdminFirestore(adminApp, databaseId);
    activeAuth = getAdminAuth(adminApp);
    isInitialized = true;
  }
}

// Proxied exports so that any access dynamically checks if initialized and resolves correctly
export const adminDb: any = new Proxy({}, {
  get(_target, prop) {
    if (!activeDb) {
      initializeFirebaseAdmin();
    }
    if (!activeDb) {
      return undefined;
    }
    const value = activeDb[prop];
    return typeof value === 'function' ? value.bind(activeDb) : value;
  }
});

export const adminAuth: any = new Proxy({}, {
  get(_target, prop) {
    if (!activeAuth) {
      initializeFirebaseAdmin();
    }
    if (!activeAuth) {
      return undefined;
    }
    const value = activeAuth[prop];
    return typeof value === 'function' ? value.bind(activeAuth) : value;
  }
});
