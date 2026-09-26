import { serverTimestamp } from 'firebase/firestore';
import type { EntityRole } from '../../types';

export const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

type SessionTransactionContext = {
  entityRef: any;
  securitySessionRef: any;
  role: EntityRole;
  sessionId: string;
};

export async function claimSessionInTransaction(
  transaction: any,
  { entityRef, securitySessionRef, sessionId }: SessionTransactionContext
): Promise<void> {
  const entitySnap = await transaction.get(entityRef);
  const secSnap = await transaction.get(securitySessionRef);

  let activeSessionIds: string[] = [sessionId];
  if (entitySnap.exists()) {
    const data = entitySnap.data();
    const existing = Array.isArray(data?.activeSessionIds)
      ? data.activeSessionIds.filter((id: any) => typeof id === 'string' && id.length > 0)
      : (data?.currentSessionId ? [data.currentSessionId] : []);
    activeSessionIds = [...new Set([...existing, sessionId])].slice(-100);
  }

  if (entitySnap.exists()) {
    transaction.update(entityRef, {
      currentSessionId: sessionId,
      activeSessionIds,
      lastActive: serverTimestamp()
    });
  } else if (transaction.set) {
    transaction.set(entityRef, {
      currentSessionId: sessionId,
      activeSessionIds,
      lastActive: serverTimestamp()
    }, { merge: true });
  }

  const isSecDoc = secSnap && typeof secSnap.exists === 'function' && secSnap.exists();
  if (isSecDoc) {
    transaction.update(securitySessionRef, {
      isActive: true,
      sessionId,
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
    const existing = Array.isArray(data?.activeSessionIds) ? data.activeSessionIds : [];
    const updated = existing.filter((id: string) => id !== sessionId);
    transaction.update(entityRef, {
      activeSessionIds: updated,
      ...(data?.currentSessionId === sessionId ? { currentSessionId: updated[updated.length - 1] || null } : {})
    });
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
