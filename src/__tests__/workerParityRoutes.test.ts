import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));

import { api } from '../../server/api';
installDefaultWorkerTestSessionHeaders(api, mockDb);

const tokens = {
  admin: 'valid-admin-token',
  supervisor: 'valid-supervisor-token',
  delegate: 'valid-delegate-token',
  garage: 'valid-garage-token-garage-a'
} as const;

async function call(path: string, token: string, init: RequestInit = {}) {
  return api.fetch(new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  }));
}

describe('Worker Route Parity Suite', () => {
  beforeEach(() => {
    mockDb.clear();
    mockDb.seed('garages/garage-a', {
      id: 'garage-a',
      name: 'Garage Alpha',
      balance: 1000,
      balanceExpiry: new Date(Date.now() + 86400000).toISOString(),
      dailyCapacity: 50,
      totalReferralRewardDays: 3,
      carsInside: 5
    });
    mockDb.seed('garages/garage-b', {
      id: 'garage-b',
      name: 'Garage Beta',
      balance: 500,
      carsInside: 2
    });
  });

  describe('0. Delegate dashboard replacement', () => {
    it('serves the scoped dashboard through Hono without exposing PIN fields', async () => {
      mockDb.seed('delegate_sessions/delegate-uid', {
        uid: 'delegate-uid', role: 'delegate', entityId: 'delegate-a', sessionId: 'delegate-session', isActive: true, lastActive: new Date()
      });
      mockDb.seed('delegates/delegate-a', {
        name: 'Delegate A', phone: '01000000000', pin: 'secret-pin',
        activeSessionIds: ['delegate-session'], currentSessionId: 'delegate-session'
      });
      mockDb.seed('garages/created-garage', { name: 'Created Garage', createdByDelegateId: 'delegate-a', pin: 'garage-pin' });
      mockDb.seed('garages/referred-garage', { name: 'Referred Garage', referrerId: 'delegate-a' });
      mockDb.seed('recharge_requests/request-a', { delegateId: 'delegate-a', createdAt: new Date('2026-10-09T10:00:00Z') });

      const response = await call('/api/delegates/dashboard', 'valid-delegate-token-delegate-a', {
        headers: { 'x-session-id': 'delegate-session' }
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ success: true, delegate: { id: 'delegate-a', name: 'Delegate A' } });
      expect(body.delegate).not.toHaveProperty('pin');
      expect(body.garages).toHaveLength(2);
      expect(body.garages.every((garage: Record<string, unknown>) => !('pin' in garage))).toBe(true);
      expect(body).not.toHaveProperty('requests');
    });
  });

  describe('0.1. Retired trial decision workflow', () => {
    it('rejects the old route without writing a garage or activity log', async () => {
      const response = await call('/api/garages/trial-decision', tokens.garage, {
        method: 'POST', body: JSON.stringify({ garageId: 'garage-a', trialDecision: 'continued' })
      });
      // Removed routes now fall through to the standard not-found response.
      expect(response.status).toBe(404);
      expect(mockDb.records.get('garages/garage-a')).not.toHaveProperty('trialDecision');
      expect([...mockDb.records.keys()].some((path) => path.startsWith('activity_logs/'))).toBe(false);
    });
  });

  describe('2. Retired Supervisor role', () => {
    it('keeps legacy records unchanged and rejects create/update/delete endpoints', async () => {
      const legacyRecord = { id: 'legacy-supervisor', name: 'Preserved QA Record', role: 'supervisor' };
      mockDb.seed('supervisors/legacy-supervisor', legacyRecord);

      const create = await call('/api/supervisors/create', tokens.admin, {
        method: 'POST', body: JSON.stringify({ name: 'No new record', pin: '55667' })
      });
      const update = await call('/api/supervisors/update', tokens.admin, {
        method: 'POST', body: JSON.stringify({ id: 'legacy-supervisor', name: 'Must not change' })
      });
      const remove = await call('/api/supervisors/delete', tokens.admin, {
        method: 'POST', body: JSON.stringify({ id: 'legacy-supervisor' })
      });
      const pinRotation = await call('/api/people/update-pin', tokens.admin, {
        method: 'POST', body: JSON.stringify({ entityType: 'supervisors', entityId: 'legacy-supervisor', newPin: '88997' })
      });

      // Retired management routes are removed; legacy records remain untouched.
      for (const response of [create, update, remove]) expect(response.status).toBe(404);
      expect(pinRotation.status).toBe(400);
      expect(await pinRotation.json()).toMatchObject({ success: false, error: 'INVALID_ENTITY_TYPE' });
      expect(mockDb.records.get('supervisors/legacy-supervisor')).toEqual(legacyRecord);
      expect([...mockDb.records.keys()].filter((key) => key.startsWith('supervisors/'))).toEqual(['supervisors/legacy-supervisor']);
    });

    it('does not authenticate an old Supervisor token for protected routes', async () => {
      const response = await call('/api/garages', tokens.supervisor);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ success: false, error: 'ROLE_RETIRED' });
    });
  });

  describe('3. Delegate Management', () => {
    it('denies retired Supervisor tokens before any database write', async () => {
      mockDb.seed('delegates/supervisor-target', {
        id: 'supervisor-target',
        name: 'Protected Delegate',
        totalRechargedAmount: 0
      });

      const updateRes = await call('/api/delegates/update', tokens.supervisor, {
        method: 'POST',
        body: JSON.stringify({ id: 'supervisor-target', name: 'Must Not Change' })
      });
      const deleteRes = await call('/api/delegates/delete', tokens.supervisor, {
        method: 'POST',
        body: JSON.stringify({ id: 'supervisor-target' })
      });

      expect(updateRes.status).toBe(403);
      expect(deleteRes.status).toBe(403);
      expect(mockDb.records.get('delegates/supervisor-target')?.name).toBe('Protected Delegate');
    });

    it('allows admin to create delegate and enforces unsettled commission guard on delete', async () => {
      const createRes = await call('/api/delegates/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          name: 'مندوب القاهرة',
          phone: '01234567890',
          pin: '99887'
        })
      });
      expect(createRes.status).toBe(200);
      const delId = (await createRes.json()).id;
      const initialLookupHash = mockDb.records.get(`private_pins/${delId}`)?.pinLookupHash;
      expect(mockDb.records.get(`pin_reservations/${initialLookupHash}`)).toMatchObject({ entityType: 'delegates', entityId: delId });

      const pinOwnerRes = await call('/api/delegates/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ name: 'Other PIN Owner', pin: '88776' })
      });
      expect(pinOwnerRes.status).toBe(200);
      const rejectedCombinedUpdate = await call('/api/delegates/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: delId, commissionRate: 99, pin: '88776' })
      });
      expect(rejectedCombinedUpdate.status).toBe(400);
      expect(mockDb.records.get(`delegates/${delId}`)?.commissionRate).toBeUndefined();
      expect(mockDb.records.get(`private_pins/${delId}`)?.pinLookupHash).toBe(initialLookupHash);

      const updateRes = await call('/api/delegates/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: delId, pin: '77665' })
      });
      expect(updateRes.status).toBe(200);
      const updatedLookupHash = mockDb.records.get(`private_pins/${delId}`)?.pinLookupHash;
      expect(updatedLookupHash).not.toBe(initialLookupHash);
      expect(mockDb.records.has(`pin_reservations/${initialLookupHash}`)).toBe(false);
      expect(mockDb.records.get(`pin_reservations/${updatedLookupHash}`)).toMatchObject({ entityType: 'delegates', entityId: delId });
      mockDb.seed('pin_reservations/foreign-same-id-reservation', { entityType: 'delegates', entityId: delId });

      // Seed unsettled commission -> delete must be blocked with 409
      mockDb.seed(`delegates/${delId}`, {
        id: delId,
        name: 'مندوب القاهرة',
        totalRechargedAmount: 500
      });
      const deleteBlocked = await call('/api/delegates/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: delId })
      });
      expect(deleteBlocked.status).toBe(409);
      expect(await deleteBlocked.json()).toMatchObject({
        success: false,
        error: 'DELEGATE_HAS_UNSETTLED_COMMISSION',
        unsettledCycleTotal: 500
      });

      // Clear unsettled commission -> delete succeeds
      mockDb.seed(`delegates/${delId}`, {
        id: delId,
        name: 'مندوب القاهرة',
        totalRechargedAmount: 0
      });
      const deleteSuccess = await call('/api/delegates/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: delId })
      });
      expect(deleteSuccess.status).toBe(200);
      expect(mockDb.records.has(`private_pins/${delId}`)).toBe(false);
      expect(mockDb.records.has(`pin_reservations/${updatedLookupHash}`)).toBe(false);
      expect(mockDb.records.has('pin_reservations/foreign-same-id-reservation')).toBe(true);
    });

    it('settles a delegate cycle atomically and replays the same idempotency result', async () => {
      mockDb.seed('delegates/settle-delegate', { id: 'settle-delegate', totalRechargedAmount: 125 });
      const payload = { id: 'settle-delegate', idempotencyKey: 'delegate-settlement-key' };
      const first = await call('/api/delegates/settle-account', tokens.admin, {
        method: 'POST', body: JSON.stringify(payload)
      });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody).toMatchObject({ success: true, previousRechargedAmount: 125 });
      expect(mockDb.records.get('delegates/settle-delegate')).toMatchObject({ totalRechargedAmount: 0 });

      const replay = await call('/api/delegates/settle-account', tokens.admin, {
        method: 'POST', body: JSON.stringify(payload)
      });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(firstBody);
    });
  });

  describe('6. Transactions: Self-Subscribe, Direct Recharge, Referral Reward', () => {
    it('updates garage referredByGarageId and persists in database', async () => {
      mockDb.seed('garages/garage-target', {
        name: 'Target Garage',
        referredByGarageId: null
      });

      const res = await call('/api/garages/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          id: 'garage-target',
          referredByGarageId: 'garage-referrer',
          referredByGarageName: 'Referrer Garage'
        })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const target = mockDb.records.get('garages/garage-target');
      expect(target?.referredByGarageId).toBe('garage-referrer');
      expect(target?.referredByGarageName).toBe('Referrer Garage');
    });

    it('recalculates cars inside count accurately', async () => {
      mockDb.seed('garages/garage-a/vehicles/v1', { status: 'inside' });
      mockDb.seed('garages/garage-a/vehicles/v2', { status: 'inside' });
      mockDb.seed('garages/garage-a/vehicles/v3', { status: 'departed' });

      const res = await call('/api/garages/recalculate-cars-inside', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ garageId: 'garage-a' })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(2);
      expect(mockDb.records.get('garages/garage-a')?.carsInside).toBe(2);
    });

    it('rejects client-written activity logs with 403', async () => {
      const res = await call('/api/activity-logs/add', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ action: 'test' })
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ success: false, error: 'SERVER_GENERATED_ONLY' });
    });
  });
});
