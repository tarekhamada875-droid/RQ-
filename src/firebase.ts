import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  memoryLocalCache
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';
import { logDiagnostic, verifyFirebaseAppletConfig } from './utils/authDiagnosticLogger';

// Verify config before initialization
verifyFirebaseAppletConfig();

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
logDiagnostic('FIREBASE_APP_INITIALIZED', { appName: app.name });

// Enforce in-memory cache so offline mutations fail instantly instead of queuing locally
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: memoryLocalCache(),
}, firebaseConfig.firestoreDatabaseId);

export const functions = getFunctions(app);

export const auth = getAuth(app);
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
