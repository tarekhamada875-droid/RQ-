import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';
const mockDb = new MockFirestore();
vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() { return mockDb; }, adminAuth: mockAdminAuth, firebaseConfig: {}, initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));
import { api } from '../../server/api';
installDefaultWorkerTestSessionHeaders(api, mockDb);

const garageId = 'bill06-credit-garage';
const endpoint = `http://localhost/api/garages/${garageId}/credit-grants`;
const adminHeaders = { Authorization: 'Bearer valid-admin-token' };
const grantBody = { amount: 100, paymentAmountEgp: 100, paymentConfirmed: true, reason: 'Verified prepaid credit payment', idempotencyKey: 'bill06-grant-001' };
const qualifyingGrantBody = { amount: 500, paymentAmountEgp: 500, paymentConfirmed: true, reason: 'Verified qualifying prepaid credit payment', idempotencyKey: 'bill06-grant-qualifying' };

describe('BILL-06/07 manual prepaid credit grants and payment reporting', () => {
  beforeEach(() => {
    mockDb.clear();
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', credits: 14 });
  });

  it('requires external-payment confirmation and Admin authorization before any writes', async () => {
    const unconfirmed = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, paymentConfirmed: false }) }));
    expect(unconfirmed.status).toBe(400);
    const denied = await api.fetch(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer valid-garage-token-${garageId}` }, body: JSON.stringify(grantBody) }));
    expect(denied.status).toBe(403);
    expect(mockDb.records.get(`garages/${garageId}`)?.credits).toBe(14);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(0);
  });

  it('grants exactly the confirmed EGP amount as credits and records a private audit ledger plus a monetary event', async () => {
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ garageId, amount: 100, paymentAmountEgp: 100, balance: 114 });
    expect(mockDb.records.get(`garages/${garageId}`)?.credits).toBe(114);
    const entries = [...mockDb.records.entries()].filter(([path]) => path.startsWith('credit_ledger/'));
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toMatchObject({ kind: 'paid_grant', amount: 100, paymentAmountEgp: 100, balanceBefore: 14, balanceAfter: 114, actorUid: 'admin-uid', actorRole: 'admin', reason: 'Verified prepaid credit payment', source: 'admin_entered_grant', paymentConfirmed: true });
    const paymentEvents = [...mockDb.records.entries()].filter(([path, value]: [string, any]) => path.startsWith(`garages/${garageId}/events/`) && value.eventType === 'prepaid_credit_grant_paid');
    expect(paymentEvents).toHaveLength(1);
    expect(paymentEvents[0][1]).toMatchObject({ aggregateType: 'credit_grant', aggregateId: entries[0][1].entryId, payload: { amount: 100, creditAmount: 100, creditLedgerEntryId: entries[0][1].entryId } });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(1);
  });

  it('keeps a valid grant, referral award, audit records, and retry idempotency together', async () => {
    const referrerGarageId = 'bill06-referrer';
    mockDb.seed(`garages/${garageId}`, {
      name: 'Prepaid test',
      billingModel: 'prepaid_credits',
      referredByGarageId: referrerGarageId,
      credits: 14
    });
    mockDb.seed(`garages/${referrerGarageId}`, {
      name: 'Referrer',
      billingModel: 'prepaid_credits',
      credits: 3
    });
    const postGrant = () => api.fetch(new Request(endpoint, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(qualifyingGrantBody)
    }));

    const firstResponse = await postGrant();
    const firstBody = await firstResponse.json() as any;
    expect(firstResponse.status).toBe(200);
    expect(firstBody.data).toMatchObject({
      balance: 514,
      referralAward: { garageId: referrerGarageId, amount: 10 }
    });
    expect(mockDb.records.get(`garages/${garageId}`)?.credits).toBe(514);
    expect(mockDb.records.get(`garages/${referrerGarageId}`)?.credits).toBe(13);

    const ledgerEntries = [...mockDb.records.entries()].filter(([path]) => path.startsWith('credit_ledger/'));
    expect(ledgerEntries).toHaveLength(2);
    expect(ledgerEntries.map(([, value]: [string, any]) => value.kind).sort()).toEqual(['paid_grant', 'referral_award']);
    expect([...mockDb.records.entries()].filter(([path, value]: [string, any]) =>
      path.startsWith(`garages/${garageId}/events/`) && value.eventType === 'prepaid_credit_grant_paid'
    )).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(2);
    expect(mockDb.records.get(`credit_referral_awards/${garageId}`)).toMatchObject({
      referredGarageId: garageId,
      referrerGarageId,
      amount: 10,
      status: 'awarded'
    });

    const retryResponse = await postGrant();
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toEqual(firstBody);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(2);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith(`garages/${garageId}/events/`))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(2);
  });

  it('applies the configured creditRate when granting credits (rate=2 → 2x credits)', async () => {
    // Seed a custom creditRate of 2 (1 EGP = 2 credits)
    mockDb.seed('system_config/global', { creditRate: 2 });
    // Send 100 EGP. Server should derive credits = round(100 × 2) = 200.
    const response = await api.fetch(new Request(endpoint, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        amount: 100,            // legacy field, ignored by server
        paymentAmountEgp: 100,  // authoritative input
        paymentConfirmed: true,
        reason: 'Verified prepaid credit payment',
        idempotencyKey: 'bill07-rate-2x'
      })
    }));
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    // Server grants 200 credits (100 EGP × rate 2), balance = 14 + 200 = 214
    expect(body.data).toMatchObject({ garageId, amount: 200, paymentAmountEgp: 100, balance: 214 });
    expect(mockDb.records.get(`garages/${garageId}`)?.credits).toBe(214);
    // totalAdminRevenue tracks EGP, not credits
    expect(mockDb.records.get(`garages/${garageId}`)?.totalAdminRevenue).toBe(100);
    // Ledger entry records both: amount (credits) = 200, paymentAmountEgp = 100
    const entries = [...mockDb.records.entries()].filter(([path]) => path.startsWith('credit_ledger/'));
    expect(entries[0][1]).toMatchObject({ kind: 'paid_grant', amount: 200, paymentAmountEgp: 100, balanceBefore: 14, balanceAfter: 214 });
    // Event records both EGP and credit amount (they differ when rate ≠ 1)
    const paymentEvents = [...mockDb.records.entries()].filter(([path, value]: [string, any]) => path.startsWith(`garages/${garageId}/events/`) && value.eventType === 'prepaid_credit_grant_paid');
    expect(paymentEvents[0][1]).toMatchObject({ payload: { amount: 100, creditAmount: 200 } });
  });

  it('uses default rate of 1 when system_config has no creditRate field (backward compat)', async () => {
    // No system_config doc seeded — server should default creditRate to 1
    const response = await api.fetch(new Request(endpoint, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        amount: 100,
        paymentAmountEgp: 100,
        paymentConfirmed: true,
        reason: 'Verified prepaid credit payment',
        idempotencyKey: 'bill07-default-rate'
      })
    }));
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    // 100 EGP × rate 1 = 100 credits. Balance = 14 + 100 = 114.
    expect(body.data).toMatchObject({ amount: 100, paymentAmountEgp: 100, balance: 114 });
    expect(mockDb.records.get(`garages/${garageId}`)?.credits).toBe(114);
  });

  it('awards 10 referral credits once on the first paid grant and keeps a distinct auditable record', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', referredByGarageId: 'bill06-referrer', credits: 14 });
    mockDb.seed('garages/bill06-referrer', { name: 'Referrer', billingModel: 'prepaid_credits', credits: 3 });
    const first = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(qualifyingGrantBody) }));
    expect(first.status).toBe(200);
    expect(mockDb.records.get('garages/bill06-referrer')?.credits).toBe(13);
    expect([...mockDb.records.entries()].find(([path, value]: [string, any]) => path.startsWith('credit_ledger/') && value.garageId === 'bill06-referrer' && value.kind === 'referral_award' && value.idempotencyKey === 'first_paid_grant:bill06-credit-garage')?.[1]).toMatchObject({ kind: 'referral_award', amount: 10, source: 'first_paid_grant_referral', referredGarageId: garageId });
    expect(mockDb.records.get(`credit_referral_awards/${garageId}`)).toMatchObject({ referredGarageId: garageId, referrerGarageId: 'bill06-referrer', amount: 10 });
    // A second qualifying-grant-sized call uses a fresh idempotency key but the qualifying marker is already set,
    // so no second referral award fires. The grant itself succeeds.
    const second = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...qualifyingGrantBody, amount: 50, paymentAmountEgp: 50, idempotencyKey: 'bill06-grant-002' }) }));
    expect(second.status).toBe(200);
    expect(mockDb.records.get('garages/bill06-referrer')?.credits).toBe(13);
  });

  it('records a deferred legacy-referrer outcome without enabling that garage', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', referredByGarageId: 'legacy-referrer', credits: 10 });
    mockDb.seed('garages/legacy-referrer', { name: 'Legacy referrer', billingModel: 'subscription', balance: 12 });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(qualifyingGrantBody) }));
    expect(response.status).toBe(200);
    expect(mockDb.records.get(`credit_referral_awards/${garageId}`)).toMatchObject({ status: 'referrer_not_prepaid', amount: 0 });
    expect(mockDb.records.get('garages/legacy-referrer')).toMatchObject({ billingModel: 'subscription', balance: 12 });
    expect(mockDb.records.get('garages/legacy-referrer')?.credits).toBeUndefined();
  });

  it('replays idempotently and rejects a reused key with a different request', async () => {
    const post = (body: any) => api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) }));
    expect((await post(grantBody)).status).toBe(200);
    expect((await post(grantBody)).status).toBe(200);
    expect(mockDb.records.get(`garages/${garageId}`)?.credits).toBe(114);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(1);
    expect([...mockDb.records.entries()].filter(([path, value]: [string, any]) => path.startsWith(`garages/${garageId}/events/`) && value.eventType === 'prepaid_credit_grant_paid')).toHaveLength(1);
    expect((await post({ ...grantBody, amount: 101 })).status).toBe(409);
  });

  it('does not activate or migrate a legacy garage as a side effect of a grant', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Legacy', billingModel: 'subscription', balance: 9 });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    expect(response.status).toBe(409);
    expect(mockDb.records.get(`garages/${garageId}`)).toMatchObject({ billingModel: 'subscription', balance: 9 });
    expect(mockDb.records.get(`garages/${garageId}`)?.credits).toBeUndefined();
  });

  it('rejects invalid paymentAmountEgp values (server derives credits from EGP, ignores legacy amount field)', async () => {
    const post = (body: any) => api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, ...body }) }));
    // Legacy `amount` field is now ignored by the server (credits are derived from paymentAmountEgp × creditRate).
    // Sending amount: 1.5 or amount: 0 with a valid paymentAmountEgp no longer fails — the grant succeeds.
    // The new validation surface is paymentAmountEgp itself:
    expect((await post({ paymentAmountEgp: undefined })).status).toBe(400); // missing
    expect((await post({ paymentAmountEgp: 1.5 })).status).toBe(400);      // not an integer
    expect((await post({ paymentAmountEgp: 0 })).status).toBe(400);         // below min (50)
    expect((await post({ paymentAmountEgp: 49 })).status).toBe(400);        // below min (50)
    expect((await post({ paymentAmountEgp: 2001 })).status).toBe(400);      // above max (2000)
    // Sanity: a valid 100 EGP grant still succeeds (the success case is covered in detail above).
    expect((await post({ paymentAmountEgp: 100, idempotencyKey: 'bill07-valid-100' })).status).toBe(200);
  });

  it('keeps the payment amount in Admin history only, never exposing it to the garage user', async () => {
    mockDb.seed('credit_ledger/a', { garageId, entryId: 'a', kind: 'paid_grant', amount: 100, paymentAmountEgp: 100, occurredAt: '2026-10-17T00:00:00.000Z' });
    const admin = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: adminHeaders }));
    expect(admin.status).toBe(200);
    expect((await admin.json() as any).data[0].paymentAmountEgp).toBe(100);
    const owner = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: { Authorization: `Bearer valid-garage-token-${garageId}` } }));
    expect(owner.status).toBe(200);
    const ownerBody = await owner.json() as any;
    expect(JSON.stringify(ownerBody)).not.toContain('paymentAmountEgp');
    const other = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: { Authorization: 'Bearer valid-staff-token-other-garage' } }));
    expect(other.status).toBe(403);
  });
});
