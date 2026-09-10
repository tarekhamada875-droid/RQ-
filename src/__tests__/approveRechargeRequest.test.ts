import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firestoreService } from '../services';

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('mock_token'), uid: 'delegate_1' } },
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' }
}));

describe('approveRechargeRequest service API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates request structure before calling API', async () => {
    const res = await firestoreService.approveRechargeRequest({ id: '', garageId: '' });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('delegates valid request to /api/transactions/approve-recharge-request and returns success', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/api/transactions/approve-recharge-request')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const res = await firestoreService.approveRechargeRequest({
      id: 'req1',
      garageId: 'g1',
      packageId: 'pkg1',
      amount: 300
    });

    expect(res.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/transactions/approve-recharge-request'), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_token'
      }),
      body: expect.stringContaining('"requestId":"req1"')
    }));
  });

  it('handles REQUEST_ALREADY_PROCESSED server error gracefully', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: 'REQUEST_ALREADY_PROCESSED'
        })
      } as Response;
    });

    const res = await firestoreService.approveRechargeRequest({
      id: 'req1',
      garageId: 'g1',
      packageId: 'pkg1',
      amount: 300
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('الطلب تم معالجته مسبقاً');
  });

  it('handles REQUEST_NOT_FOUND server error gracefully', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return {
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          error: 'REQUEST_NOT_FOUND'
        })
      } as Response;
    });

    const res = await firestoreService.approveRechargeRequest({
      id: 'req_missing',
      garageId: 'g1',
      packageId: 'pkg1',
      amount: 300
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('الطلب غير موجود');
  });
});
