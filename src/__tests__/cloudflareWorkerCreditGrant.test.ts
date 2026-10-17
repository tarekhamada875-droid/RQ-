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
const grantBody = { amount: 30, paymentConfirmed: true, paymentReference: 'offline-receipt-123', reason: 'April prepaid credit payment', idempotencyKey: 'bill06-grant-001' };

describe('BILL-06 manual prepaid credit grants', () => {
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

  it('grants exactly the entered amount to paid credits atomically and creates an auditable ledger entry', async () => {
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ garageId, amount: 30, balance: { paid: 40, referral: 4 } });
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 40, referral: 4 });
    const entries = [...mockDb.records.entries()].filter(([path]) => path.startsWith('credit_ledger/'));
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toMatchObject({ kind: 'paid_grant', bucket: 'paid', amount: 30, balanceBefore: 10, balanceAfter: 40, actorUid: 'admin-uid', actorRole: 'admin', reference: 'offline-receipt-123', reason: 'April prepaid credit payment', source: 'admin_entered_grant', paymentConfirmed: true });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(1);
  });

  it('grants selected template quantity without treating template price as wallet money', async () => {
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ packageId: 'credit-template-50', paymentConfirmed: true, paymentReference: 'receipt-template', reason: 'Paid bundle', idempotencyKey: 'bill06-template-1' }) }));
    expect(response.status).toBe(200);
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 60, referral: 4 });
    expect(mockDb.records.get(`credit_ledger/${garageId}:bill06-template-1`)).toMatchObject({ amount: 50, source: 'admin_template_grant', packageId: 'credit-template-50', packageName: '50 credits' });
    expect(mockDb.records.get(`garages/${garageId}`)?.balance).toBeUndefined();
  });

  it('awards 20 referral credits once on the first paid grant and keeps a distinct auditable record', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', referredByGarageId: 'bill06-referrer', creditBalance: { paid: 10, referral: 4 } });
    mockDb.seed('garages/bill06-referrer', { name: 'Referrer', billingModel: 'prepaid_credits', creditBalance: { paid: 2, referral: 1 } });
    const first = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    expect(first.status).toBe(200);
    expect(mockDb.records.get('garages/bill06-referrer')?.creditBalance).toEqual({ paid: 2, referral: 21 });
    expect(mockDb.records.get('credit_ledger/bill06-referrer:first_paid_grant:bill06-credit-garage')).toMatchObject({ kind: 'referral_award', bucket: 'referral', amount: 20, source: 'first_paid_grant_referral', referredGarageId: garageId });
    expect(mockDb.records.get(`credit_referral_awards/${garageId}`)).toMatchObject({ referredGarageId: garageId, referrerGarageId: 'bill06-referrer', amount: 20 });
    const second = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, amount: 31, idempotencyKey: 'bill06-grant-002' }) }));
    expect(second.status).toBe(200);
    expect(mockDb.records.get('garages/bill06-referrer')?.creditBalance).toEqual({ paid: 2, referral: 21 });
  });

  it('records a deferred legacy-referrer outcome without enabling that garage', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Prepaid test', billingModel: 'prepaid_credits', referredByGarageId: 'legacy-referrer', creditBalance: { paid: 10, referral: 0 } });
    mockDb.seed('garages/legacy-referrer', { name: 'Legacy referrer', billingModel: 'subscription', balance: 12 });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    expect(response.status).toBe(200);
    expect(mockDb.records.get('credit_referral_awards/bill06-credit-garage')).toMatchObject({ status: 'referrer_not_prepaid', amount: 0 });
    expect(mockDb.records.get('garages/legacy-referrer')).toMatchObject({ billingModel: 'subscription', balance: 12 });
    expect(mockDb.records.get('garages/legacy-referrer')?.creditBalance).toBeUndefined();
  });

  it('replays idempotently and rejects a reused key with a different request', async () => {
    const post = (body: any) => api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) }));
    expect((await post(grantBody)).status).toBe(200);
    expect((await post(grantBody)).status).toBe(200);
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toEqual({ paid: 40, referral: 4 });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('credit_ledger/'))).toHaveLength(1);
    expect((await post({ ...grantBody, amount: 31 })).status).toBe(409);
  });

  it('does not activate or migrate a legacy garage as a side effect of a grant', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Legacy', billingModel: 'subscription', balance: 9 });
    const response = await api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify(grantBody) }));
    expect(response.status).toBe(409);
    expect(mockDb.records.get(`garages/${garageId}`)).toMatchObject({ billingModel: 'subscription', balance: 9 });
    expect(mockDb.records.get(`garages/${garageId}`)?.creditBalance).toBeUndefined();
  });

  it('rejects invalid amounts and mixed template/manual input', async () => {
    const post = (body: any) => api.fetch(new Request(endpoint, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...grantBody, ...body }) }));
    expect((await post({ amount: 1.5 })).status).toBe(400);
    expect((await post({ packageId: 'credit-template-50' })).status).toBe(400);
    expect((await post({ amount: 0 })).status).toBe(400);
  });

  it('allows Admin and same-garage users to read bounded history, but not another garage', async () => {
    mockDb.seed('credit_ledger/a', { garageId, entryId: 'a', kind: 'paid_grant', bucket: 'paid', amount: 4, occurredAt: '2026-10-17T00:00:00.000Z', reference: 'private-payment-reference' });
    const admin = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: adminHeaders }));
    expect(admin.status).toBe(200);
    expect((await admin.json() as any).data).toHaveLength(1);
    const owner = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: { Authorization: `Bearer valid-garage-token-${garageId}` } }));
    expect(owner.status).toBe(200);
    expect(JSON.stringify(await owner.json())).not.toContain('private-payment-reference');
    const other = await api.fetch(new Request(`http://localhost/api/garages/${garageId}/credit-ledger`, { headers: { Authorization: 'Bearer valid-staff-token-other-garage' } }));
    expect(other.status).toBe(403);
  });
});
