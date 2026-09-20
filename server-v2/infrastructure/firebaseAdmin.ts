import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { applyFirebaseEmulatorEnvironment, firebaseEmulatorConfig } from '../config/firebaseEmulator.js';
import type { V2Environment } from '../config/environment.js';

export type V2Firebase = Readonly<{
  app: App;
  firestore: Firestore;
}>;

export function createV2Firebase(environment: V2Environment): V2Firebase {
  if (environment.NODE_ENV !== 'production') applyFirebaseEmulatorEnvironment();
  const projectId = environment.FIREBASE_PROJECT_ID ?? firebaseEmulatorConfig.projectId;
  const app = getApps().find((candidate) => candidate.name === 'rq-v2') ?? initializeApp({ projectId }, 'rq-v2');
  return { app, firestore: getFirestore(app) };
}
