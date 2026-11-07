import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

// Re-export FieldValue so consumers can import it from this module.
//
// Audit ref: Phase 3 / A1 (consolidated audit, 2026-11-06).
//
// In dev/tests, this is the real firebase-admin SDK's FieldValue —
// FieldValue.increment(n) returns a server-side increment transform
// that the SDK correctly applies inside runTransaction.
//
// In production (Cloudflare build), tools/build-cloudflare.mjs aliases
// both 'firebaseAdmin' and 'firebase-admin/firestore' to
// firebaseWorkerAdmin.ts (the hand-rolled REST client). That file
// exports its own FieldValue sentinel that FirestoreRest.write
// translates into a real server-side increment.
//
// Before this re-export, workerMaintenance.ts imported FieldValue from
// './firebaseWorkerAdmin' directly — which in dev/tests returned the
// sentinel ({__op:'increment', value:n}) instead of the SDK's real
// transform. The MockFirestore persisted it as a literal map, so
// isUsableMaintainedSummary got NaN and the O(1) maintained-summary
// fast path silently never worked in dev. A test even papered over
// this by unwrapping __op. Now workerMaintenance.ts imports FieldValue
// from './firebaseAdmin', so dev/tests use the real SDK and production
// uses the alias-targeted REST client — both correct.
export { FieldValue };

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

// Proxied exports so that any access dynamically checks if initialized and resolves correctly.
//
// Implementation note (audit N1, 2026-11-06): the previous version returned
// `undefined` from the Proxy's get trap when activeDb was null. Combined with
// the Proxy itself being always-truthy, this meant every `if (!getAdminDb())`
// guard was dead code (Proxy is truthy, so the guard never fired), and every
// `getAdminDb().collection(...)` call crashed with an unhelpful
// `TypeError: Cannot read properties of undefined` instead of the intended
// `ADMIN_SDK_NOT_INITIALIZED` 500.
//
// Now: when activeDb is null after lazy-init, any property access throws an
// explicit `ADMIN_SDK_NOT_INITIALIZED` Error. The global error handler in
// cloudflareWorker.ts catches this and returns a clean 500 with that code.
// Callers that still want a non-throwing check can use `isFirebaseAdminInitialized()`.
class AdminSdkNotInitializedError extends Error {
  constructor() {
    super('ADMIN_SDK_NOT_INITIALIZED');
    this.name = 'AdminSdkNotInitializedError';
  }
}

function ensureInitialized(target: 'adminDb' | 'adminAuth'): void {
  if (target === 'adminDb' ? activeDb : activeAuth) return;
  initializeFirebaseAdmin();
  if (target === 'adminDb' ? !activeDb : !activeAuth) {
    throw new AdminSdkNotInitializedError();
  }
}

export const adminDb: any = new Proxy({}, {
  get(_target, prop) {
    ensureInitialized('adminDb');
    const value = (activeDb as any)[prop];
    return typeof value === 'function' ? value.bind(activeDb) : value;
  }
});

export const adminAuth: any = new Proxy({}, {
  get(_target, prop) {
    ensureInitialized('adminAuth');
    const value = (activeAuth as any)[prop];
    return typeof value === 'function' ? value.bind(activeAuth) : value;
  }
});

/**
 * Returns true if the Firebase Admin SDK is initialized and ready to serve
 * requests. Use this for honest health checks and for guards that prefer a
 * boolean over throwing.
 *
 * The traditional `if (!getAdminDb())` and `if (!adminDb)` guards remain
 * no-ops (the Proxy is always truthy) for backwards compatibility — but
 * any actual property access on adminDb/adminAuth will throw
 * `ADMIN_SDK_NOT_INITIALIZED` if the SDK is genuinely down, which the global
 * error handler maps to a clean 500.
 */
export function isFirebaseAdminInitialized(): boolean {
  if (!activeDb) initializeFirebaseAdmin();
  return Boolean(activeDb && activeAuth);
}
