import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimSessionInTransaction, releaseSessionInTransaction } from './sessionTransactions';

vi.mock('firebase/firestore', () => ({
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
}));

const snapshot = (data: any) => ({
  exists: () => data !== null,
  data: () => data
});

const makeTransaction = (entityData: any, securityData: any) => {
  const updates: Array<{ ref: string; data: any }> = [];
  const tx = {
    get: vi.fn(async (ref: string) => ref === 'entity' ? snapshot(entityData) : snapshot(securityData)),
    update: vi.fn((ref: string, data: any) => updates.push({ ref, data })),
    set: vi.fn((ref: string, data: any) => updates.push({ ref, data }))
  };
  return { tx, updates };
};

describe('session transaction contracts', () => {
  beforeEach(() => vi.useRealTimers());

  it('allows concurrent multi-device logins and adds new device to activeSessionIds without throwing', async () => {
    const { tx, updates } = makeTransaction(
      { currentSessionId: 'device-1', activeSessionIds: ['device-1'], lastActive: new Date() },
      { sessionId: null }
    );

    await claimSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', role: 'garage', sessionId: 'device-2'
    });

    expect(updates).toEqual([
      {
        ref: 'entity',
        data: {
          currentSessionId: 'device-2',
          activeSessionIds: ['device-1', 'device-2'],
          lastActive: 'SERVER_TIMESTAMP'
        }
      },
      {
        ref: 'security',
        data: {
          isActive: true,
          sessionId: 'device-2',
          lastActive: 'SERVER_TIMESTAMP'
        }
      }
    ]);
  });

  it('refreshes the owner and activates an existing security session', async () => {
    const { tx, updates } = makeTransaction(
      { currentSessionId: 'same-session', activeSessionIds: ['same-session'], lastActive: new Date() },
      { sessionId: 'same-session', isActive: false }
    );

    await claimSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', role: 'delegate', sessionId: 'same-session'
    });

    expect(updates).toEqual([
      {
        ref: 'entity',
        data: {
          currentSessionId: 'same-session',
          activeSessionIds: ['same-session'],
          lastActive: 'SERVER_TIMESTAMP'
        }
      },
      { ref: 'security', data: { isActive: true, sessionId: 'same-session', lastActive: 'SERVER_TIMESTAMP' } }
    ]);
  });

  it('releases only the specific device session from activeSessionIds', async () => {
    const { tx, updates } = makeTransaction(
      { currentSessionId: 'device-2', activeSessionIds: ['device-1', 'device-2'] },
      { sessionId: 'device-2', isActive: true }
    );

    await releaseSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', sessionId: 'device-2'
    });

    expect(updates).toEqual([
      { ref: 'entity', data: { activeSessionIds: ['device-1'], currentSessionId: 'device-1' } },
      { ref: 'security', data: { isActive: false, lastActive: 'SERVER_TIMESTAMP' } }
    ]);
  });

  it('does not clear an unrelated session during release', async () => {
    const { tx, updates } = makeTransaction(
      { currentSessionId: 'device-2', activeSessionIds: ['device-2'] },
      { sessionId: 'device-2', isActive: true }
    );

    await releaseSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', sessionId: 'device-1'
    });

    expect(updates).toEqual([
      { ref: 'entity', data: { activeSessionIds: ['device-2'] } }
    ]);
  });
});
