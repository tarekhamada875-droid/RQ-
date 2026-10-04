import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { workerApp } from '../../server/cloudflareWorker';

const tokens = {
  admin: 'valid-admin-token',
  supervisor: 'valid-supervisor-token',
  delegate: 'valid-delegate-token',
  garage: 'valid-garage-token-garage-a',
  staff: 'valid-staff-token-garage-a'
} as const;

async function call(path: string, token: string, init: RequestInit = {}) {
  return workerApp.fetch(new Request(`http://localhost${path}`, {
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

  describe('1. Staff Management', () => {
    it('allows admin and garage owner to create, update, and delete staff', async () => {
      // Create staff for garage-a
      const createRes = await call('/api/staff/create', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          name: 'علي حسن',
          phone: '01012345678',
          pin: '87654321',
          garageId: 'garage-a',
          role: 'worker'
        })
      });
      expect(createRes.status).toBe(200);
      const createBody = await createRes.json();
      expect(createBody.success).toBe(true);
      const staffId = createBody.id;
      expect(staffId).toBeDefined();

      // Denies garage owner adding staff to another garage
      const crossRes = await call('/api/staff/create', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          name: 'محمود',
          pin: '11223344',
          garageId: 'garage-b'
        })
      });
      expect(crossRes.status).toBe(403);

      // Update staff
      const updateRes = await call('/api/staff/update', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          id: staffId,
          name: 'علي حسن المعدل',
          phone: '01099999999'
        })
      });
      expect(updateRes.status).toBe(200);
      expect(await updateRes.json()).toEqual({ success: true });
      expect(mockDb.records.get(`staff/${staffId}`)?.name).toBe('علي حسن المعدل');

      // Delete staff
      const deleteRes = await call('/api/staff/delete', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ id: staffId })
      });
      expect(deleteRes.status).toBe(200);
      expect(await deleteRes.json()).toEqual({ success: true });
      expect(mockDb.records.get(`staff/${staffId}`)).toBeUndefined();
    });
  });

  describe('2. Supervisor Management', () => {
    it('restricts supervisor management to admin', async () => {
      const forbidden = await call('/api/supervisors/create', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ name: 'مشرف', pin: '55667788' })
      });
      expect(forbidden.status).toBe(403);

      const createRes = await call('/api/supervisors/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ name: 'مشرف رئيسي', phone: '01122334455', pin: '55667788' })
      });
      expect(createRes.status).toBe(200);
      const createBody = await createRes.json();
      const supId = createBody.id;
      expect(supId).toBeDefined();

      const updateRes = await call('/api/supervisors/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: supId, name: 'مشرف رئيسي معدل' })
      });
      expect(updateRes.status).toBe(200);

      const deleteRes = await call('/api/supervisors/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: supId })
      });
      expect(deleteRes.status).toBe(200);
    });
  });

  describe('3. Delegate Management', () => {
    it('allows admin to create delegate and enforces unsettled commission guard on delete', async () => {
      const createRes = await call('/api/delegates/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          name: 'مندوب القاهرة',
          phone: '01234567890',
          pin: '99887766',
          commissionRate: 15
        })
      });
      expect(createRes.status).toBe(200);
      const delId = (await createRes.json()).id;

      const updateRes = await call('/api/delegates/update', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: delId, commissionRate: 20 })
      });
      expect(updateRes.status).toBe(200);

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
    });
  });

  describe('4. People Update PIN', () => {
    it('updates entity PIN and enforces scope rules', async () => {
      mockDb.seed('staff/staff-1', { id: 'staff-1', garageId: 'garage-a' });
      mockDb.seed('staff/staff-2', { id: 'staff-2', garageId: 'garage-b' });

      // Garage owner updating own staff PIN succeeds
      const ownStaffRes = await call('/api/people/update-pin', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'staff', entityId: 'staff-1', newPin: '12341234' })
      });
      expect(ownStaffRes.status).toBe(200);
      expect(await ownStaffRes.json()).toEqual({ success: true });

      // Garage owner updating other garage staff PIN fails
      const crossStaffRes = await call('/api/people/update-pin', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({ entityType: 'staff', entityId: 'staff-2', newPin: '43214321' })
      });
      expect(crossStaffRes.status).toBe(403);
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
      const pkgRes = await call('/api/admin/packages/create', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          name: 'باقة جديدة',
          price: 150,
          durationDays: 15,
          dailyCapacity: 30
        })
      });
      expect(pkgRes.status).toBe(200);
      const newPkgId = (await pkgRes.json()).id;

      const deletePkg = await call('/api/admin/packages/delete', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({ id: newPkgId })
      });
      expect(deletePkg.status).toBe(200);
    });
  });

  describe('6. Transactions: Self-Subscribe, Direct Recharge, Referral Reward', () => {
    it('processes garage self-subscription using balance', async () => {
      const res = await call('/api/transactions/garage-self-subscribe', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          garageId: 'garage-a',
          packageId: 'pkg-monthly',
          idempotencyKey: 'self-sub-test-key-12345'
        })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.newBalance).toBe(700); // 1000 - 300
    });

    it('processes direct admin recharge of a garage and awards referral reward to referrer', async () => {
      mockDb.seed('garages/garage-referrer', {
        name: 'Referrer Garage',
        balanceExpiry: new Date('2026-11-01T00:00:00Z'),
        totalGaragesReferredCount: 0
      });
      mockDb.seed('garages/garage-b', {
        name: 'Referred Garage B',
        referredByGarageId: 'garage-referrer',
        balanceExpiry: new Date('2026-10-10T00:00:00Z'),
        totalAdminRevenue: 0
      });

      const res = await call('/api/transactions/recharge-garage', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          garageId: 'garage-b',
          packageId: 'pkg-monthly',
          idempotencyKey: 'recharge-garage-b-key'
        })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const referrer = mockDb.records.get('garages/garage-referrer');
      expect(referrer?.totalGaragesReferredCount).toBe(1);
      const refExp = new Date(referrer?.balanceExpiry);
      expect(refExp.toISOString().startsWith('2026-11-02')).toBe(true);
    });

    it('processes direct admin recharge of a garage', async () => {
      const res = await call('/api/transactions/recharge-garage', tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          garageId: 'garage-a',
          packageId: 'pkg-monthly',
          idempotencyKey: 'recharge-garage-key-12345'
        })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.totalAdminRevenue).toBe(300);
    });

    it('allows garage to claim earned referral reward days', async () => {
      const res = await call('/api/transactions/use-referral-reward', tokens.garage, {
        method: 'POST',
        body: JSON.stringify({
          garageId: 'garage-a',
          idempotencyKey: 'claim-reward-key-12345'
        })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.daysClaimed).toBe(3);
      expect(mockDb.records.get('garages/garage-a')?.totalReferralRewardDays).toBe(0);
    });
  });

  describe('7. Garage Maintenance & Diagnostics', () => {
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
