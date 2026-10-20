import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';
const mockDb = new MockFirestore();
vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() { return mockDb; }, adminAuth: mockAdminAuth, firebaseConfig: {}, initializeFirebaseAdmin: () => {}
}));
import { api } from '../../server/api';
installDefaultWorkerTestSessionHeaders(api, mockDb);

const garageId = 'bill06-credit-garage';
const endpoint = `http://localhost/api/garages/${garageId}/credit-grants`;
const adminHeaders = { Authorization: 'Bearer valid-admin-token' };
const grantBody = { amount: 30, paymentAmountEgp: 30, paymentConfirmed: true, paymentReference: 'transfer-sender-123', reason: 'Verified prepaid credit payment', idempotencyKey: 'bill06-grant-001' };

describe('BILL-06/07 manual prepaid credit grants and payment reporting', () => {
  beforeEach(() => {
    mockDb.clear();
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', creditBalance: { paid: 10, referral: 4 } });
    mockDb.seed('packages/credit-template-50', { name: '50 credits', catalogType: 'credit_bundle', creditQuantity: 50, price: 50, isActive: true });
  });

  it('requires external-payment confirmation and Admin authorization before any writes', async () => {
    const unconfirmed = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, paymentConfirmed: false }) }));
    expect(unconfirmed.status).toBe(400);
    const denied = await api.fetch(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer valid-garage-token-${garageId}` }, body: JSON.stringify(grantBody) }));
    expect(denied.status).toBe(403);
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 10, referral: 4 });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(0);
  });

  it('grants exactly the confirmed EGP amount as credits and records a private audit ledger plus a monetary event', async () => {
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ garageId, amount: 30, paymentAmountEgp: 30, balance: { paid: 40, referral: 4, trial: 0 } });
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 40, referral: 4, trial: 0 });
    const entries = [...mockDb.records.entries()].filter(([path]) => path.startsWith('credit_ledger/'));
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toMatchObject({ kind: 'paid_grant', bucket: 'paid', amount: 30, paymentAmountEgp: 30, balanceBefore: 10, balanceAfter: 40, totalBalanceAfter: 44, actorUid: 'admin-uid', actorRole: 'admin', reference: 'transfer-sender-123', reason: 'Verified prepaid credit payment', source: 'admin_entered_grant', paymentConfirmed: true });
    const paymentEvents = [...mockDb.records.entries()].filter(([path, value]: [string, any]) => path.startsWith(`garages/${garageId}/events/`) && value.eventType === 'prepaid_credit_grant_paid');
    expect(paymentEvents).toHaveLength(1);
    expect(paymentEvents[0][1]).toMatchObject({ aggregateType: 'credit_grant', aggregateId: entries[0][1].entryId, payload: { amount: 30, creditAmount: 30, creditLedgerEntryId: entries[0][1].entryId } });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(1);
  });

  it('keeps a valid grant, referral award, audit records, and retry idempotency together', async () => {
    const referrerGarageId = 'bill06-referrer';
    mockDb.seed(`garages/${garageId}`, {
      name: 'Prepaid test',
      billingModel: 'prepaid_credits',
      referredByGarageId: referrerGarageId,
      creditBalance: { paid: 10, referral: 4 }
    });
    mockDb.seed(`garages/${referrerGarageId}`, {
      name: 'Referrer',
      billingModel: 'prepaid_credits',
      creditBalance: { paid: 2, referral: 1 }
    });
    const postGrant = () => api.fetch(new Request(endpoint, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(grantBody)
    }));

    const firstResponse = await postGrant();
    const firstBody = await firstResponse.json() as any;
    expect(firstResponse.status).toBe(200);
    expect(firstBody.data).toMatchObject({
      balance: { paid: 40, referral: 4, trial: 0 },
      referralAward: { garageId: referrerGarageId, amount: 20, bucket: 'referral' }
    });
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 40, referral: 4, trial: 0 });
    expect(mockDb.records.get(`garages/${referrerGarageId}`)?.creditBalance).toEqual({ paid: 2, referral: 21, trial: 0 });

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
      amount: 20,
      status: 'awarded'
    });

    const retryResponse = await postGrant();
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toEqual(firstBody);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(2);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith(`garages/${garageId}/events/`))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(2);
  });

  it('rejects mismatched EGP and credit amounts before any balance or audit write', async () => {
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, paymentAmountEgp: 31, idempotencyKey: 'bill07-mismatch' }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: 'PAYMENT_AMOUNT_MUST_MATCH_CREDITS' });
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 10, referral: 4 });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(0);
    expect([...mockDb.records.keys()].filter((path) => path.includes('/events/'))).toHaveLength(0);
  });

  it('grants selected template quantity only when the template obeys the one-to-one price rule', async () => {
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ packageId: 'credit-template-50', paymentAmountEgp: 50, paymentConfirmed: true, paymentReference: 'transfer-template', reason: 'Verified bundle payment', idempotencyKey: 'bill06-template-1' }) }));
    expect(response.status).toBe(200);
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 60, referral: 4, trial: 0 });
    expect(mockDb.records.get(`credit_ledger/${garageId}:bill06-template-1`)).toMatchObject({ amount: 50, paymentAmountEgp: 50, source: 'admin_template_grant', packageId: 'credit-template-50', packageName: '50 credits' });
    expect(mockDb.records.get(`garages/${garageId}`)?.balance).toBeUndefined();
  });

  it('rejects a legacy-time package template without changing the prepaid garage', async () => {
    mockDb.seed('packages/legacy-time-template', { name: 'Legacy month', catalogType: 'legacy_time', durationDays: 30, price: 300, dailyCapacity: 50, isActive: true });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ packageId: 'legacy-time-template', paymentAmountEgp: 300, paymentConfirmed: true, paymentReference: 'transfer-legacy-template', reason: 'Legacy template must be rejected', idempotencyKey: 'bill07-legacy-template' }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: 'PACKAGE_NOT_CREDIT_BUNDLE' });
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 10, referral: 4 });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(0);
  });

  it('rejects an existing credit template whose price differs from the credit count', async () => {
    mockDb.seed('packages/credit-template-mismatch', { name: 'Mismatched', catalogType: 'credit_bundle', creditQuantity: 50, price: 60, isActive: true });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ packageId: 'credit-template-mismatch', paymentAmountEgp: 50, paymentConfirmed: true, paymentReference: 'transfer-mismatch', reason: 'Verified transfer', idempotencyKey: 'bill07-template-mismatch' }) }));
    expect(response.status).toBe(400);
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 10, referral: 4 });
  });

  it('awards 20 referral credits once on the first paid grant and keeps a distinct auditable record', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', referredByGarageId: 'bill06-referrer', creditBalance: { paid: 10, referral: 4 } });
    mockDb.seed('garages/bill06-referrer', { name: 'Referrer', billingModel: 'prepaid_credits', creditBalance: { paid: 2, referral: 1 } });
    const first = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    expect(first.status).toBe(200);
    expect(mockDb.records.get('garages/bill06-referrer')?.creditBalance).toEqual({ paid: 2, referral: 21, trial: 0 });
    expect(mockDb.records.get('credit_ledger/bill06-referrer:first_paid_grant:bill06-credit-garage')).toMatchObject({ kind: 'referral_award', bucket: 'referral', amount: 20, source: 'first_paid_grant_referral', referredGarageId: garageId });
    expect(mockDb.records.get(`credit_referral_awards/${garageId}`)).toMatchObject({ referredGarageId: garageId, referrerGarageId: 'bill06-referrer', amount: 20 });
    const second = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, amount: 31, paymentAmountEgp: 31, idempotencyKey: 'bill06-grant-002' }) }));
    expect(second.status).toBe(200);
    expect(mockDb.records.get('garages/bill06-referrer')?.creditBalance).toEqual({ paid: 2, referral: 21, trial: 0 });
  });

  it('records a deferred legacy-referrer outcome without enabling that garage', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', referredByGarageId: 'legacy-referrer', creditBalance: { paid: 10, referral: 0 } });
    mockDb.seed('garages/legacy-referrer', { name: 'Legacy referrer', billingModel: 'subscription', balance: 12 });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    expect(response.status).toBe(200);
    expect(mockDb.records.get(`credit_referral_awards/${garageId}`)).toMatchObject({ status: 'referrer_not_prepaid', amount: 0 });
    expect(mockDb.records.get('garages/legacy-referrer')).toMatchObject({ billingModel: 'subscription', balance: 12 });
    expect(mockDb.records.get('garages/legacy-referrer')?.creditBalance).toBeUndefined();
  });

  it('replays idempotently and rejects a reused key with a different request', async () => {
    const post = (body: any) => api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) }));
    expect((await post(grantBody)).status).toBe(200);
    expect((await post(grantBody)).status).toBe(200);
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 40, referral: 4, trial: 0 });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(1);
    expect([...mockDb.records.entries()].filter(([path, value]: [string, any]) => path.startsWith(`garages/${garageId}/events/`) && value.eventType === 'prepaid_credit_grant_paid')).toHaveLength(1);
    expect((await post({ ...grantBody, amount: 31 })).status).toBe(409);
  });

  it('does not activate or migrate a legacy garage as a side effect of a grant', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Legacy', billingModel: 'subscription', balance: 9 });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    expect(response.status).toBe(409);
    expect(mockDb.records.get(`garages/${garageId}`)).toMatchObject({ billingModel: 'subscription', balance: 9 });
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toBeUndefined();
  });

  it('rejects invalid amounts, missing money confirmation values, and mixed template/manual input', async () => {
    const post = (body: any) => api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, ...body }) }));
    expect((await post({ amount: 1.5 })).status).toBe(400);
    expect((await post({ paymentAmountEgp: undefined })).status).toBe(400);
    expect((await post({ packageId: 'credit-template-50' })).status).toBe(400);
    expect((await post({ amount: 0 })).status).toBe(400);
  });

  it('keeps the payment amount in Admin history only, never exposing it to the garage user', async () => {
    mockDb.seed('credit_ledger/a', { garageId, entryId: 'a', kind: 'paid_grant', bucket: 'paid', amount: 4, paymentAmountEgp: 4, occurredAt: '2026-10-17T00:00:00.000Z', reference: 'private-transfer-number' });
    const admin = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: adminHeaders }));
    expect(admin.status).toBe(200);
    expect((await admin.json() as any).data[0].paymentAmountEgp).toBe(4);
    const owner = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: { Authorization: `Bearer valid-garage-token-${garageId}` } }));
    expect(owner.status).toBe(200);
    const ownerBody = await owner.json() as any;
    expect(JSON.stringify(ownerBody)).not.toContain('private-transfer-number');
    expect(JSON.stringify(ownerBody)).not.toContain('paymentAmountEgp');
    const other = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: { Authorization: 'Bearer valid-staff-token-other-garage' } }));
    expect(other.status).toBe(403);
  });
});
