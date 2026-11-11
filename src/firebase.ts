import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type FirestoreLocalCache,
} from 'firebase/firestore';
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

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
logDiagnostic('FIREBASE_APP_INITIALIZED', { appName: app.name });

// PR-E: switch from in-memory cache to persistent IndexedDB-backed cache with
// multi-tab synchronization. Reopening the dashboard no longer re-reads ~30 docs
// from Firestore — they're served from IDB. persistentMultipleTabManager
// propagates mutations across open tabs so the delegate/admin/garage views
// stay consistent without each tab maintaining its own listener set.
//
// Graceful fallback: if IndexedDB is unavailable (private browsing, storage
// quota exceeded, browser disabled IDB), initializeFirestore with
// persistentLocalCache throws. We catch and retry with the original
// memoryLocalCache so the app degrades gracefully instead of crashing.
//
// The original comment "Enforce in-memory cache so offline mutations fail
// instantly instead of queuing locally" is preserved as the fallback behavior:
// when IDB is unavailable, mutations still fail-fast (no local queue).
function createPersistentCacheWithFallback(): FirestoreLocalCache {
  // Browsers without IndexedDB (private mode in some browsers, disabled
  // storage) cannot use persistentLocalCache. Detect and skip the attempt.
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

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: createPersistentCacheWithFallback(),
}, firestoreDatabaseId);

export const auth = getAuth(app);

// Local UI fixture runs opt into emulators explicitly. Production and ordinary
// development builds keep their existing Firebase targets and never connect to
// localhost by accident.
if (useEmulators) {
  const emulatorHost = import.meta.env.VITE_RQ_EMULATOR_HOST || '127.0.0.1';
  const authPort = Number(import.meta.env.VITE_RQ_AUTH_EMULATOR_PORT || 9099);
  const firestorePort = Number(import.meta.env.VITE_RQ_FIRESTORE_EMULATOR_PORT || 8080);
  connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, firestorePort);
  logDiagnostic('FIREBASE_EMULATORS_CONNECTED', { emulatorHost, authPort, firestorePort });
}

logDiagnostic('FIREBASE_AUTH_INITIALIZED', {
  hasCurrentUser: Boolean(auth.currentUser),
  uid: auth.currentUser?.uid || null,
  isAnonymous: auth.currentUser?.isAnonymous || false,
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
