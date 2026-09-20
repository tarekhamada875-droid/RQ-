export const firebaseEmulatorConfig = Object.freeze({
  firestoreHost: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
  authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
  projectId: process.env.FIREBASE_PROJECT_ID ?? 'rq-v2-emulator'
});

export function applyFirebaseEmulatorEnvironment(): void {
  process.env.FIRESTORE_EMULATOR_HOST ??= firebaseEmulatorConfig.firestoreHost;
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= firebaseEmulatorConfig.authHost;
  process.env.GCLOUD_PROJECT ??= firebaseEmulatorConfig.projectId;
}
