import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { api } from '../../server/api';
installDefaultWorkerTestSessionHeaders(api, mockDb);

const tokens = {
  admin: 'valid-admin-token',
  supervisor: 'valid-supervisor-token',
  delegate: 'valid-delegate-token',
  garage: 'valid-garage-token-garage-a',
  staff: 'valid-staff-token-garage-a'
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
    mockDb.seed('packages/pkg-monthly', {
      id: 'pkg-monthly',
      name: 'باقة شهرية',
      price: 300,
      durationDays: 30,
      dailyCapacity: 50,
      isActive: true
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
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({ success: false, error: 'TRIAL_DECISION_WORKFLOW_RETIRED' });
      expect(mockDb.records.get('garages/garage-a')).not.toHaveProperty('trialDecision');
      expect([...mockDb.records.keys()].some((path) => path.startsWith('activity_logs/'))).toBe(false);
    });
  });

  describe('1. Staff Management', () => {
    it('allows admin and garage owner to create, update, and delete staff', async () => {
      // Create staff for garage-a
      const createRes = await call('/api/staff/create', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          name: 'علي حسن',
          phone: '01012345678',
          pin: '87654',
          garageId: 'garage-a',
          role: 'worker'
        })
      });
      expect(createRes.status).toBe(200);
      const createBody = await createRes.json();
      expect(createBody.success).toBe(true);
      const staffId = createBody.id;
      expect(staffId).toBeDefined();
      const originalLookupHash = mockDb.records.get(`private_pins/${staffId}`)?.pinLookupHash;
      expect(originalLookupHash).toBeDefined();
      expect(mockDb.records.get(`pin_reservations/${originalLookupHash}`)).toMatchObject({ entityType: 'staff', entityId: staffId });

      const pinOwnerRes = await call('/api/staff/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ name: 'PIN Owner', pin: '12344', garageId: 'garage-b', role: 'worker' })
      });
      expect(pinOwnerRes.status).toBe(200);
      const rejectedCombinedUpdate = await call('/api/staff/update', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ id: staffId, name: 'Must Not Partially Change', pin: '12344' })
      });
      expect(rejectedCombinedUpdate.status).toBe(409);
      expect(mockDb.records.get(`staff/${staffId}`)?.name).toBe('علي حسن');
      expect(mockDb.records.get(`private_pins/${staffId}`)?.pinLookupHash).toBe(originalLookupHash);

      // Denies garage owner adding staff to another garage
      const crossRes = await call('/api/staff/create', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          name: 'محمود',
          pin: '11223',
          garageId: 'garage-b'
        })
      });
      expect(crossRes.status).toBe(403);

      mockDb.seed('staff/staff-other-garage', { id: 'staff-other-garage', garageId: 'garage-b', name: 'Protected' });
      const crossUpdate = await call('/api/staff/update', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ id: 'staff-other-garage', name: 'Must Not Change' })
      });
      expect(crossUpdate.status).toBe(403);
      const crossDelete = await call('/api/staff/delete', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ id: 'staff-other-garage' })
      });
      expect(crossDelete.status).toBe(403);
      expect(mockDb.records.get('staff/staff-other-garage')?.name).toBe('Protected');

      // Update staff
      const updateRes = await call('/api/staff/update', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          id: staffId,
          name: 'علي حسن المعدل',
          phone: '01099999999',
          pin: '87654'
        })
      });
      expect(updateRes.status).toBe(200);
      expect(await updateRes.json()).toEqual({ success: true });
      expect(mockDb.records.get(`staff/${staffId}`)?.name).toBe('علي حسن المعدل');
      const updatedLookupHash = mockDb.records.get(`private_pins/${staffId}`)?.pinLookupHash;
      expect(updatedLookupHash).not.toBe(originalLookupHash);
      expect(mockDb.records.has(`pin_reservations/${originalLookupHash}`)).toBe(false);
      expect(mockDb.records.get(`pin_reservations/${updatedLookupHash}`)).toMatchObject({ entityType: 'staff', entityId: staffId });
      mockDb.seed('pin_reservations/foreign-same-id-reservation', { entityType: 'delegates', entityId: staffId });

      // Delete staff
      const deleteRes = await call('/api/staff/delete', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ id: staffId })
      });
      expect(deleteRes.status).toBe(200);
      expect(await deleteRes.json()).toEqual({ success: true });
      expect(mockDb.records.get(`staff/${staffId}`)).toBeUndefined();
      expect(mockDb.records.has(`private_pins/${staffId}`)).toBe(false);
      expect(mockDb.records.has(`pin_reservations/${updatedLookupHash}`)).toBe(false);
      expect(mockDb.records.has('pin_reservations/foreign-same-id-reservation')).toBe(true);
    });

    it('denies same-garage Staff from managing peer staff without any writes', async () => {
      mockDb.seed('staff/staff-peer', { id: 'staff-peer', garageId: 'garage-a', name: 'Protected Peer' });
      const before = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));

      const create = await call('/api/staff/create', tokens.staff, {
        method: 'POST', body: JSON.stringify({ name: 'Unauthorized', phone: '01000000000', pin: '88776', garageId: 'garage-a' })
      });
      const update = await call('/api/staff/update', tokens.staff, {
        method: 'POST', body: JSON.stringify({ id: 'staff-peer', name: 'Must Not Change' })
      });
      const remove = await call('/api/staff/delete', tokens.staff, {
        method: 'POST', body: JSON.stringify({ id: 'staff-peer' })
      });

      for (const response of [create, update, remove]) expect(response.status).toBe(403);
      expect(mockDb.records).toEqual(before);
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

      for (const response of [create, update, remove]) {
        expect(response.status).toBe(410);
        expect(await response.json()).toMatchObject({ success: false, error: 'ROLE_RETIRED' });
      }
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
          pin: '99887',
          commissionRate: 15
        })
      });
      expect(createRes.status).toBe(200);
      const delId = (await createRes.json()).id;
      const initialLookupHash = mockDb.records.get(`private_pins/${delId}`)?.pinLookupHash;
      expect(mockDb.records.get(`pin_reservations/${initialLookupHash}`)).toMatchObject({ entityType: 'delegates', entityId: delId });

      const pinOwnerRes = await call('/api/staff/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ name: 'Other PIN Owner', pin: '99887', garageId: 'garage-a', role: 'worker' })
      });
      expect(pinOwnerRes.status).toBe(200);
      const rejectedCombinedUpdate = await call('/api/delegates/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: delId, commissionRate: 99, pin: '99887' })
      });
      expect(rejectedCombinedUpdate.status).toBe(409);
      expect(mockDb.records.get(`delegates/${delId}`)?.commissionRate).toBe(15);
      expect(mockDb.records.get(`private_pins/${delId}`)?.pinLookupHash).toBe(initialLookupHash);

      const updateRes = await call('/api/delegates/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: delId, commissionRate: 20, pin: '99887' })
      });
      expect(updateRes.status).toBe(200);
      const updatedLookupHash = mockDb.records.get(`private_pins/${delId}`)?.pinLookupHash;
      expect(updatedLookupHash).not.toBe(initialLookupHash);
      expect(mockDb.records.has(`pin_reservations/${initialLookupHash}`)).toBe(false);
      expect(mockDb.records.get(`pin_reservations/${updatedLookupHash}`)).toMatchObject({ entityType: 'delegates', entityId: delId });
      mockDb.seed('pin_reservations/foreign-same-id-reservation', { entityType: 'staff', entityId: delId });

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

  describe('4. People Update PIN', () => {
    it('updates entity PIN and enforces scope rules', async () => {
      mockDb.seed('staff/staff-1', { id: 'staff-1', garageId: 'garage-a' });
      mockDb.seed('staff/staff-2', { id: 'staff-2', garageId: 'garage-b' });

      // Garage owner updating own staff PIN succeeds
      const ownStaffRes = await call('/api/people/update-pin', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'staff', entityId: 'staff-1', newPin: '12341' })
      });
      expect(ownStaffRes.status).toBe(200);
      expect(await ownStaffRes.json()).toEqual({ success: true });

      // Garage owner updating other garage staff PIN fails
      const crossStaffRes = await call('/api/people/update-pin', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'staff', entityId: 'staff-2', newPin: '43214' })
      });
      expect(crossStaffRes.status).toBe(403);
    });

    it('denies same-garage Staff from rotating the garage or a peer PIN without writes', async () => {
      mockDb.seed('staff/staff-peer', { id: 'staff-peer', garageId: 'garage-a', name: 'Protected Peer' });
      const before = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));

      const garagePin = await call('/api/people/update-pin', tokens.staff, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'garages', entityId: 'garage-a', newPin: '12344' })
      });
      const peerPin = await call('/api/people/update-pin', tokens.staff, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'staff', entityId: 'staff-peer', newPin: '43211' })
      });

      expect(garagePin.status).toBe(403);
      expect(peerPin.status).toBe(403);
      expect(mockDb.records).toEqual(before);
    });
  });

  describe('5. Admin Announcements & Coupons & Packages', () => {
    it('manages announcements, coupons, and packages for admin only', async () => {
      // Announcements
      const annRes = await call('/api/admin/announcements/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ title: 'تحديث هام', message: 'مرحبا بالجميع', isActive: true })
      });
      expect(annRes.status).toBe(200);
      const annId = (await annRes.json()).id;

      const toggleRes = await call('/api/admin/announcements/toggle', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: annId, isActive: false })
      });
      expect(toggleRes.status).toBe(200);

      const deleteAnn = await call('/api/admin/announcements/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: annId })
      });
      expect(deleteAnn.status).toBe(200);

      // Coupons
      const couponRes = await call('/api/admin/coupons/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ code: 'SAVE20', discountPercent: 20 })
      });
      expect(couponRes.status).toBe(200);
      const couponId = (await couponRes.json()).id;

      const updateCoupon = await call('/api/admin/coupons/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: couponId, discountPercent: 25 })
      });
      expect(updateCoupon.status).toBe(200);

      const deleteCoupon = await call('/api/admin/coupons/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: couponId })
      });
      expect(deleteCoupon.status).toBe(200);

      // Packages
      const legacyPkgRes = await call('/api/admin/packages/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ name: 'Legacy month', price: 300, durationDays: 30, dailyCapacity: 50, catalogType: 'legacy_time' })
      });
      expect(legacyPkgRes.status).toBe(400);

      const mixedPkgRes = await call('/api/admin/packages/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ name: 'Mixed package', price: 300, creditQuantity: 300, durationDays: 30, catalogType: 'credit_bundle' })
      });
      expect(mixedPkgRes.status).toBe(400);

      const pkgRes = await call('/api/admin/packages/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          name: 'رصيد جديد',
          price: 150,
          creditQuantity: 150,
          catalogType: 'credit_bundle'
        })
      });
      expect(pkgRes.status).toBe(200);
      const newPkgId = (await pkgRes.json()).id;

      const deletePkg = await call('/api/admin/packages/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: newPkgId })
      });
      expect(deletePkg.status).toBe(200);

      const creditPkgRes = await call('/api/admin/packages/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          name: 'قالب 400 رصيد',
          price: 400,
          creditQuantity: 400,
          catalogType: 'credit_bundle'
        })
      });
      expect(creditPkgRes.status).toBe(200);
      const creditPkgId = (await creditPkgRes.json()).id;
      const creditPkgSnapshot = await mockDb.collection('packages').doc(creditPkgId).get();
      expect(creditPkgSnapshot.data()).toMatchObject({
        name: 'قالب 400 رصيد',
        price: 400,
        creditQuantity: 400,
        catalogType: 'credit_bundle',
        isActive: true
      });
      expect(creditPkgSnapshot.data()).not.toHaveProperty('durationDays');
      expect(creditPkgSnapshot.data()).not.toHaveProperty('dailyCapacity');

      const deleteCreditPkg = await call('/api/admin/packages/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: creditPkgId })
      });
      expect(deleteCreditPkg.status).toBe(200);
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
