import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { 
  connectFirestoreEmulator,
  initializeFirestore, 
  memoryLocalCache
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

// Enforce in-memory cache so offline mutations fail instantly instead of queuing locally
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: memoryLocalCache(),
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
