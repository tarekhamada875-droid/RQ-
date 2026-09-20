import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { parseEnvironment } from '../config/environment.js';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { FirestoreSessionRepository } from '../infrastructure/firestoreSession.js';

const projectId = 'rq-v2-auth-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore v2 session repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('maps a live garage session only when the entity owns the session marker', async () => {
    await firestore.doc('garage_sessions/uid-1').set({ isActive: true, sessionId: 'session-1', entityId: 'garage-1', lastActive: new Date('2026-09-20T09:55:00.000Z') });
    await firestore.doc('garages/garage-1').set({ currentSessionId: 'session-1' });
    const repository = new FirestoreSessionRepository(firestore);

    await expect(repository.getSession('uid-1', 'session-1')).resolves.toMatchObject({
      id: 'session-1', uid: 'uid-1', role: 'garage', garageId: 'garage-1', revoked: false
    });
  });

  it('rejects a session whose canonical entity marker belongs to another session', async () => {
    await firestore.doc('garage_sessions/uid-1').set({ isActive: true, sessionId: 'session-1', entityId: 'garage-1', lastActive: new Date('2026-09-20T09:55:00.000Z') });
    await firestore.doc('garages/garage-1').set({ currentSessionId: 'session-other' });
    const repository = new FirestoreSessionRepository(firestore);

    await expect(repository.getSession('uid-1', 'session-1')).resolves.toBeUndefined();
  });

  it('maps delegate garage scope from the delegate entity', async () => {
    await firestore.doc('delegate_sessions/uid-2').set({ isActive: true, sessionId: 'session-2', entityId: 'delegate-1', lastActive: new Date('2026-09-20T09:55:00.000Z') });
    await firestore.doc('delegates/delegate-1').set({ currentSessionId: 'session-2', garageIds: ['garage-1', 'garage-2'] });
    const repository = new FirestoreSessionRepository(firestore);

    await expect(repository.getSession('uid-2', 'session-2')).resolves.toMatchObject({ role: 'delegate', delegateGarageIds: ['garage-1', 'garage-2'] });
  });
});
