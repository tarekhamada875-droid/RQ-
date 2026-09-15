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

  it.each([
    ['admin', 'SESSION_OCCUPIED'],
    ['supervisor', 'SESSION_OCCUPIED'],
    ['staff', 'SESSION_OCCUPIED'],
    ['delegate', 'DELEGATE_SESSION_OCCUPIED'],
    ['garage', 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS']
  ] as const)('rejects an active competing %s session with its policy error', async (role, errorCode) => {
    const { tx } = makeTransaction(
      { currentSessionId: 'other-session', lastActive: new Date() },
      { sessionId: null }
    );

    await expect(claimSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', role, sessionId: 'new-session'
    })).rejects.toThrow(errorCode);
  });

  it('refreshes the owner and activates an existing security session', async () => {
    const { tx, updates } = makeTransaction(
      { currentSessionId: 'same-session', lastActive: new Date() },
      { sessionId: 'same-session', isActive: false }
    );

    await claimSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', role: 'delegate', sessionId: 'same-session'
    });

    expect(updates).toEqual([
      { ref: 'entity', data: { currentSessionId: 'same-session', lastActive: 'SERVER_TIMESTAMP' } },
      { ref: 'security', data: { isActive: true, lastActive: 'SERVER_TIMESTAMP' } }
    ]);
  });

  it('releases only an owned entity lock and matching security session', async () => {
    const { tx, updates } = makeTransaction(
      { currentSessionId: 'same-session' },
      { sessionId: 'same-session', isActive: true }
    );

    await releaseSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', sessionId: 'same-session'
    });

    expect(updates).toEqual([
      { ref: 'entity', data: { currentSessionId: null } },
      { ref: 'security', data: { isActive: false, lastActive: 'SERVER_TIMESTAMP' } }
    ]);
  });

  it('does not clear a newer session during release', async () => {
    const { tx, updates } = makeTransaction(
      { currentSessionId: 'newer-session' },
      { sessionId: 'newer-session', isActive: true }
    );

    await releaseSessionInTransaction(tx, {
      entityRef: 'entity', securitySessionRef: 'security', sessionId: 'old-session'
    });

    expect(updates).toEqual([]);
  });
});
