import { serverTimestamp } from 'firebase/firestore';
import { safeDate } from '../../utils';
import type { EntityRole } from '../../types';
import { getSessionConflictCode } from './sessionPolicy';

export const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

type SessionTransactionContext = {
  entityRef: any;
  securitySessionRef: any;
  role: EntityRole;
  sessionId: string;
};

export async function claimSessionInTransaction(
  transaction: any,
  { entityRef, securitySessionRef, role, sessionId }: SessionTransactionContext
): Promise<void> {
  const entitySnap = await transaction.get(entityRef);
  const secSnap = await transaction.get(securitySessionRef);

  if (entitySnap.exists()) {
    const data = entitySnap.data();
    const activeSessionId = data?.currentSessionId;
    const lastActive = safeDate(data?.lastActive).getTime();
    const isAlive = lastActive > 0 && (Date.now() - lastActive < SESSION_TIMEOUT_MS);

    if (activeSessionId && activeSessionId !== sessionId && isAlive) {
      throw new Error(getSessionConflictCode(role));
    }
  }

  if (entitySnap.exists()) {
    transaction.update(entityRef, {
      currentSessionId: sessionId,
      lastActive: serverTimestamp()
    });
  } else if (transaction.set) {
    transaction.set(entityRef, {
      currentSessionId: sessionId,
      lastActive: serverTimestamp()
    }, { merge: true });
  }

  const isSecDoc = secSnap && typeof secSnap.exists === 'function' && secSnap.exists();
  if (isSecDoc) {
    transaction.update(securitySessionRef, {
      isActive: true,
      lastActive: serverTimestamp()
    });
  }
}

export async function releaseSessionInTransaction(
  transaction: any,
  { entityRef, securitySessionRef, sessionId }: Pick<SessionTransactionContext, 'entityRef' | 'securitySessionRef' | 'sessionId'>
): Promise<void> {
  const entitySnap = await transaction.get(entityRef);
  if (entitySnap.exists()) {
    const data = entitySnap.data();
    if (data?.currentSessionId === sessionId) {
      transaction.update(entityRef, { currentSessionId: null });
    }
  }

  const secSnap = await transaction.get(securitySessionRef);
  if (secSnap.exists()) {
    const secData = secSnap.data();
    if (secData?.sessionId === sessionId) {
      transaction.update(securitySessionRef, {
        isActive: false,
        lastActive: serverTimestamp()
      });
    }
  }
}
