import { describe, it, expect, beforeEach } from 'vitest';
import { workerApp } from '../../server/cloudflareWorker';
import { adminDb } from '../../server/firebaseAdmin';

describe('CF7 — Cloudflare Worker Financial, Recharge & Reporting Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf7';
  const testDelegateId = 'worker-test-delegate-cf7';

  beforeEach(async () => {
    if (adminDb) {
      await adminDb.doc(`garages/${testGarageId}`).set({
        name: 'Financial Test Garage',
        balance: 100,
        balanceExpiry: '2026-10-01',
        dailyCapacity: 50,
        isTrial: false,
        createdByDelegateId: testDelegateId
      });

      await adminDb.doc(`delegates/${testDelegateId}`).set({
        name: 'Financial Delegate',
        phone: '01012345678',
        totalRechargedAmount: 500,
        totalCommissionEarned: 100
      });

      await adminDb.doc('packages/pkg_monthly_standard').set({
        id: 'pkg_monthly_standard',
        name: 'باقة شهرية standard',
        price: 500,
        basePrice: 500,
        discountAmount: 0,
        finalPrice: 500,
        durationDays: 30,
        dailyCapacity: 50,
        isUnlimited: false,
        isActive: true
      });
    }
  });

  it('1. POST /api/recharge-requests/create creates pending request', async () => {
    // Unauthenticated
    const unauthRes = await workerApp.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId: testGarageId })
    }));
    expect(unauthRes.status).toBe(401);

    // Valid creation
    const createRes = await workerApp.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'pkg_monthly_standard',
        amount: 500,
        requestType: 'package_purchase'
      })
    }), workerEnv);

    expect(createRes.status).toBe(200);
    const body = await createRes.json() as any;
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.data.status).toBe('pending');
  });

  it('2. POST /api/recharge-requests/process approves recharge and grants subscription', async () => {
    // Create request first
    const createRes = await workerApp.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'pkg_monthly_standard',
        amount: 500
      })
    }), workerEnv);

    const createBody = await createRes.json() as any;
    const requestId = createBody.id;
    const testIdempKey = `idemp_appr_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Process/Approve
    const processRes = await workerApp.fetch(new Request('http://localhost/api/recharge-requests/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken,
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        requestId,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(processRes.status).toBe(200);
    const processBody = await processRes.json() as any;
    expect(processBody.success).toBe(true);
    expect(processBody.data.status).toBe('approved');
  });

  it('3. POST /api/recharge-requests/reject rejects pending request', async () => {
    // Create request first
    const createRes = await workerApp.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'pkg_monthly_standard',
        amount: 500
      })
    }), workerEnv);

    const createBody = await createRes.json() as any;
    const requestId = createBody.id;
    const testIdempKey = `idemp_rej_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Reject
    const rejectRes = await workerApp.fetch(new Request('http://localhost/api/recharge-requests/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken,
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        requestId,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(rejectRes.status).toBe(200);
    const rejectBody = await rejectRes.json() as any;
    expect(rejectBody.success).toBe(true);
  });

  it('4. POST /api/transactions/admin-topup-balance adds direct wallet credit', async () => {
    const testIdempKey = `idemp_topup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const topupRes = await workerApp.fetch(new Request('http://localhost/api/transactions/admin-topup-balance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken,
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        garageId: testGarageId,
        amount: 200,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(topupRes.status).toBe(200);
    const topupBody = await topupRes.json() as any;
    expect(topupBody.success).toBe(true);
    expect(topupBody.data.newBalance).toBe(300);
  });

  it('5. POST /api/delegate/withdraw-commission settles delegate account', async () => {
    const testIdempKey = `idemp_settle_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const settleRes = await workerApp.fetch(new Request('http://localhost/api/delegate/withdraw-commission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken,
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        id: testDelegateId,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(settleRes.status).toBe(200);
    const settleBody = await settleRes.json() as any;
    expect(settleBody.success).toBe(true);
    expect(settleBody.settlementId).toBeDefined();
  });

  it('6. GET /api/financial-summary returns aggregated financial totals', async () => {
    const summaryRes = await workerApp.fetch(new Request('http://localhost/api/financial-summary', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(summaryRes.status).toBe(200);
    const summaryBody = await summaryRes.json() as any;
    expect(summaryBody.success).toBe(true);
    expect(summaryBody.data.report).toBeDefined();
    expect(typeof summaryBody.data.report.grossRechargeTotal).toBe('number');
  });
});
