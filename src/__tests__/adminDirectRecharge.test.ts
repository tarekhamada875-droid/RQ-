import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminService } from '../services/adminService';
import type { Package } from '../types';

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('mock_token'), uid: 'admin' } },
  handleFirestoreError: vi.fn((err) => { throw err; }),
  OperationType: { UPDATE: 'UPDATE' }
}));

describe('adminDirectRechargeGarage API transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockPkg: Package = {
    id: 'pkg_1',
    name: 'باقة شهرية',
    price: 300,
    vehiclesCount: 30,
    durationDays: 30,
    dailyCapacity: 50,
    isActive: true
  };

  it('sends POST request to /api/transactions/recharge-garage and handles success', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/api/transactions/recharge-garage')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { newExpiry: '2026-10-06T12:00:00.000Z', totalAdminRevenue: 900 }
          })
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    await adminService.adminDirectRechargeGarage('garage_123', mockPkg, {
      staffId: 'admin',
      staffName: 'مدير النظام (Admin)',
      isEnglish: false
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/transactions/recharge-garage', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_token'
      }),
      body: expect.stringContaining('"garageId":"garage_123"')
    }));
  });

  it('throws error if garage does not exist during recharge transaction', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return {
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          error: 'GARAGE_NOT_FOUND'
        })
      } as Response;
    });

    await expect(
      adminService.adminDirectRechargeGarage('non_existent', mockPkg)
    ).rejects.toThrow('GARAGE_NOT_FOUND');
  });
});
