// Firebase initialization with lazy-loading.
//
// Strategy: firebase/app is tiny (~33KB) and loads synchronously (needed for
// config + init). firebase/auth (~119KB) and firebase/firestore (~413KB)
// are loaded via dynamic import() — the browser starts downloading them
// immediately but doesn't block the main thread on parsing/executing them.
// The app's loading screen renders while Firebase loads in the background.
//
// The exports `auth` and `db` are created synchronously via dynamic import
// caching — once the modules load, the values are populated. The app's
// auth-ready gate (useGarageSession.ts) already waits for auth state to
// resolve before rendering the dashboard, so the async loading is naturally
// gated by the existing auth flow.

import { initializeApp } from 'firebase/app';
import productionFirebaseConfig from '../firebase-applet-config.json';
import previewFirebaseConfig from '../firebase-applet-preview-config.json';
import { logDiagnostic, verifyFirebaseAppletConfig } from './utils/authDiagnosticLogger';
import { selectFirebaseConfig } from './utils/firebaseConfigSelector';

const selectedFirebaseConfig = selectFirebaseConfig(
  import.meta.env.VITE_RQ_FIREBASE_TARGET,
  productionFirebaseConfig,
  previewFirebaseConfig,
);

const useEmulators = import.meta.env.VITE_RQ_USE_EMULATORS === 'true';
const firebaseConfig = useEmulators
  ? {
      ...selectedFirebaseConfig,
      projectId: import.meta.env.VITE_RQ_EMULATOR_PROJECT_ID || 'demo-rq-ui-fixtures',
    }
  : selectedFirebaseConfig;
const firestoreDatabaseId = useEmulators ? '(default)' : firebaseConfig.firestoreDatabaseId;

// Verify config before initialization
verifyFirebaseAppletConfig(firebaseConfig);

// Initialize Firebase App (tiny — firebase/app is ~33KB, loads synchronously)
const app = initializeApp(firebaseConfig);
logDiagnostic('FIREBASE_APP_INITIALIZED', { appName: app.name });

// Lazy-load auth and firestore via dynamic import.
// The browser starts downloading these chunks immediately (they're in the
// import graph) but doesn't block the main thread on parsing them.
// Once loaded, the promises resolve and the values are available.

// Types for the lazy-loaded modules
type AuthType = import('firebase/auth').Auth;
type FirestoreType = import('firebase/firestore').Firestore;

// These will be populated once the dynamic imports resolve.
// Components that need them use the `firebaseReady` promise below.
let _auth: AuthType | null = null;
let _db: FirestoreType | null = null;

// The ready promise — resolves once both auth and firestore are loaded.
// The app gates rendering on this (via useGarageSession's isAuthReady).
export const firebaseReady: Promise<void> = (async () => {
  // Dynamic import — browser downloads these chunks in parallel
  // without blocking the main thread.
  const [
    { connectAuthEmulator, getAuth },
    firestoreModule,
  ] = await Promise.all([
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  const {
    connectFirestoreEmulator,
    initializeFirestore,
    memoryLocalCache,
    persistentLocalCache,
    persistentMultipleTabManager,
  } = firestoreModule;

  function createPersistentCacheWithFallback() {
    if (typeof indexedDB === 'undefined') {
      logDiagnostic('FIRESTORE_PERSISTENT_CACHE_SKIPPED', { reason: 'indexedDB undefined' });
      return memoryLocalCache();
    }
    try {
      return persistentLocalCache({ tabManager: persistentMultipleTabManager() });
    } catch (cacheInitError) {
      logDiagnostic('FIRESTORE_PERSISTENT_CACHE_FAILED', {
        reason: cacheInitError instanceof Error ? cacheInitError.message : String(cacheInitError),
      });
      return memoryLocalCache();
    }
  }

  _db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    localCache: createPersistentCacheWithFallback(),
  }, firestoreDatabaseId);

  _auth = getAuth(app);

  if (useEmulators) {
    const emulatorHost = import.meta.env.VITE_RQ_EMULATOR_HOST || '127.0.0.1';
    const authPort = Number(import.meta.env.VITE_RQ_AUTH_EMULATOR_PORT || 9099);
    const firestorePort = Number(import.meta.env.VITE_RQ_FIRESTORE_EMULATOR_PORT || 8080);
    connectAuthEmulator(_auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(_db, emulatorHost, firestorePort);
    logDiagnostic('FIREBASE_EMULATORS_CONNECTED', { emulatorHost, authPort, firestorePort });
  }

  logDiagnostic('FIREBASE_AUTH_INITIALIZED', {
    hasCurrentUser: Boolean(_auth.currentUser),
    uid: _auth.currentUser?.uid || null,
    isAnonymous: _auth.currentUser?.isAnonymous || false,
  });
})();

// Synchronous accessors — throw if called before firebaseReady resolves.
// In practice, the app's loading screen waits for firebaseReady before
// rendering any component that needs auth/db, so these will always be
// populated by the time they're called.
export const auth: AuthType = new Proxy({} as AuthType, {
  get(_target, prop) {
    if (!_auth) {
      throw new Error(`Firebase auth accessed before initialization. Property: ${String(prop)}`);
    }
    return Reflect.get(_auth, prop);
  },
});

export const db: FirestoreType = new Proxy({} as FirestoreType, {
  get(_target, prop) {
    if (!_db) {
      throw new Error(`Firebase db accessed before initialization. Property: ${String(prop)}`);
    }
    return Reflect.get(_db, prop);
  },
});

// Error handling for Firestore operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const safeErrInfo = {
    error: errorMessage,
    operationType,
    path
  };
  console.error('Firestore Operation Error:', safeErrInfo);
  throw new Error(`خطأ في عملية قاعدة البيانات (${operationType}): ${errorMessage}`);
}
