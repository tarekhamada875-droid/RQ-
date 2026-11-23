import { vi, describe, it, expect, beforeEach } from 'vitest';
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

/**
 * Income routes — the admin Income page (الدخل), owner feature 2026-11-23.
 * Covers: one-time alignment of admin_summary/global against the garage-doc
 * counters, the never-lower guarantee (deleted garages keep received income),
 * and the paged paid_grant-only history with legacy garage-name resolution.
 */
describe('Income routes — admin income page', () => {
  const workerEnv = { BACKEND_OPERATOR_TOKEN: 'test-operator-token-32-chars-long!!' };

  const adminGet = (path: string) => api.fetch(new Request(`http://localhost${path}`, {
    headers: { Authorization: 'Bearer valid-admin-token' }
  }), workerEnv);

  beforeEach(() => {
    mockDb.clear();
  });

  describe('GET /api/admin/income/summary', () => {
    it('aligns the summary once when it undercounts the garage docs, then serves O(1)', async () => {
      mockDb.seed('garages/g1', { name: 'جراج أ', totalAdminRevenue: 100 });
      mockDb.seed('garages/g2', { name: 'جراج ب', totalAdminRevenue: 250 });
      mockDb.seed('garages/g3', { name: 'بدون دخل' });
      mockDb.seed('admin_summary/global', { totalAdminRevenue: 200, totalGarages: 3 });

      const first = await (await adminGet('/api/admin/income/summary')).json();
      // 200 (stored) + 350-200 missing (approval-path grants before the
      // 2026-11-21 audit fix never fed the summary) = 350.
      expect(first).toMatchObject({ success: true, data: { totalIncomeEgp: 350, recounted: true } });

      const stamp = mockDb.records.get('admin_summary/global');
      expect(stamp?.incomeRecountAt).toBeDefined();
      // merge — unrelated summary fields survive the alignment write
      expect(stamp?.totalGarages).toBe(3);

      const stampBefore = structuredClone(stamp);
      const second = await (await adminGet('/api/admin/income/summary')).json();
      expect(second).toMatchObject({ success: true, data: { totalIncomeEgp: 350, recounted: false } });
      expect(structuredClone(mockDb.records.get('admin_summary/global'))).toEqual(stampBefore);
    });

    it('never lowers the total — money already received from deleted garages stays', async () => {
      // The summary carries 900 (incl. income from since-deleted garages);
      // surviving garage docs only add up to 100.
      mockDb.seed('admin_summary/global', { totalAdminRevenue: 900 });
      mockDb.seed('garages/g1', { totalAdminRevenue: 100 });

      const body = await (await adminGet('/api/admin/income/summary')).json();
      expect(body).toMatchObject({ success: true, data: { totalIncomeEgp: 900, recounted: true } });
    });

    it('creates the summary doc when it has never existed', async () => {
      mockDb.seed('garages/g1', { totalAdminRevenue: 75 });

      const body = await (await adminGet('/api/admin/income/summary')).json();
      expect(body).toMatchObject({ success: true, data: { totalIncomeEgp: 75, recounted: true } });
      expect(mockDb.records.get('admin_summary/global')?.totalAdminRevenue).toBe(75);
    });

    it('requires the admin role', async () => {
      const garageRes = await api.fetch(new Request('http://localhost/api/admin/income/summary', {
        headers: { Authorization: 'Bearer valid-garage-token-garage-a' }
      }), workerEnv);
      expect(garageRes.status).toBe(403);

      const anonRes = await api.fetch(new Request('http://localhost/api/admin/income/summary'), workerEnv);
      expect(anonRes.status).toBe(401);
    });
  });

  describe('GET /api/admin/income/history', () => {
    it('returns only paid_grant rows newest-first and resolves legacy garage names', async () => {
      mockDb.seed('credit_ledger/row-old', {
        garageId: 'g1', kind: 'paid_grant', amount: 50, paymentAmountEgp: 500,
        balanceAfter: 60, occurredAt: '2026-11-01T10:00:00.000Z',
        reason: 'دفعة نقدية', source: 'admin_entered_grant'
      });
      mockDb.seed('credit_ledger/row-new', {
        garageId: 'g2', kind: 'paid_grant', amount: 100, paymentAmountEgp: 1000,
        balanceAfter: 160, occurredAt: '2026-11-20T10:00:00.000Z',
        reason: 'طلب مندوب', source: 'credit_request_approval',
        garageName: 'جراج ب'
      });
      mockDb.seed('credit_ledger/row-debit', {
        garageId: 'g1', kind: 'regular_entry_debit', amount: 1,
        occurredAt: '2026-11-21T10:00:00.000Z'
      });
      mockDb.seed('garages/g1', { name: 'جراج أ' });
      // g2 deliberately absent: the row carries its stamped name already.

      const response = await adminGet('/api/admin/income/history?limit=50');
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.rows).toHaveLength(2);
      expect(body.data.rows[0].id).toBe('row-new');
      expect(body.data.rows[0].garageName).toBe('جراج ب');
      expect(body.data.rows[1].id).toBe('row-old');
      expect(body.data.rows[1].garageName).toBe('جراج أ');
      expect(body.data.hasMore).toBe(false);
      expect(body.data.nextCursor).toBeNull();
    });

    it('pages through history with cursors without repeating or skipping rows', async () => {
      for (let i = 0; i < 5; i += 1) {
        mockDb.seed(`credit_ledger/row-${i}`, {
          garageId: 'g1', kind: 'paid_grant', amount: 10, paymentAmountEgp: 100,
          occurredAt: new Date(Date.UTC(2026, 10, 20 - i)).toISOString(),
          source: 'admin_entered_grant'
        });
      }
      mockDb.seed('garages/g1', { name: 'جراج أ' });

      const page1 = await (await adminGet('/api/admin/income/history?limit=2')).json();
      expect(page1.data.rows).toHaveLength(2);
      expect(page1.data.hasMore).toBe(true);
      expect(page1.data.nextCursor).toBeTruthy();

      const page2 = await (await adminGet(`/api/admin/income/history?limit=2&cursor=${encodeURIComponent(page1.data.nextCursor)}`)).json();
      expect(page2.data.rows).toHaveLength(2);
      expect(page2.data.hasMore).toBe(true);

      const page3 = await (await adminGet(`/api/admin/income/history?limit=2&cursor=${encodeURIComponent(page2.data.nextCursor)}`)).json();
      expect(page3.data.rows).toHaveLength(1);
      expect(page3.data.hasMore).toBe(false);

      const ids = [...page1.data.rows, ...page2.data.rows, ...page3.data.rows].map((row: any) => row.id).sort();
      expect(ids).toEqual(['row-0', 'row-1', 'row-2', 'row-3', 'row-4']);
    });

    it('requires the admin role', async () => {
      const delegateRes = await api.fetch(new Request('http://localhost/api/admin/income/history', {
        headers: { Authorization: 'Bearer valid-delegate-token' }
      }), workerEnv);
      expect(delegateRes.status).toBe(403);

      const anonRes = await api.fetch(new Request('http://localhost/api/admin/income/history'), workerEnv);
      expect(anonRes.status).toBe(401);
    });
  });
});
