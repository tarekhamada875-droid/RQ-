import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFinancialRoutes } from './financialRoutes';

afterEach(() => vi.restoreAllMocks());

function createHarness(options: { delegateExists?: boolean; events?: any[] } = {}) {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') {
        routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      }
      return app;
    }
  });
  const events = options.events || [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: name === 'delegates' && id === 'delegate-1' && options.delegateExists !== false })
      })
    }),
    collectionGroup: (name: string) => {
      const filters: Array<{ field: string; value: unknown }> = [];
      const query: any = {
        where: (field: string, _operator: string, value: unknown) => {
          filters.push({ field, value });
          return query;
        },
        get: async () => ({
          docs: events
            .filter((event) => filters.every((filter) =>
              filter.field === 'payload.delegateId' ? event.payload?.delegateId === filter.value : true
            ))
            .map((event, index) => ({ id: `event-${index}`, data: () => event }))
        })
      };
      return query;
    }
  };
  registerFinancialRoutes(app, {
    getAdminDb: () => db,
    requireWorkerAuth: vi.fn(),
    enforceWorkerFinancialRateLimit: vi.fn(),
    validateId: (value: string) => value,
    validateIdempotencyKey: vi.fn(),
    checkIdempotencyInTransaction: vi.fn(),
    createRequestFingerprint: vi.fn(),
    storeIdempotencyInTransaction: vi.fn(),
    recordDomainEventInTransaction: vi.fn(),
    parseFirestorePageRequest: vi.fn(),
    readWorkerFirestorePage: vi.fn(),
    sanitizeDelegateDoc: (value: any) => value,
    canViewFinancialReport: (user: any) => user?.role === 'admin',
    addFinancialReportCreditLedgerEntry: vi.fn(),
    addFinancialReportEvent: vi.fn(),
    addFinancialReportSettlement: vi.fn(),
    createFinancialReportAccumulator: vi.fn(),
    finishFinancialReport: vi.fn()
  } as any);

  return { route: routes.get('GET /api/delegates/:id/commission-history')! };
}

function context(role = 'admin') {
  return {
    get: (key: string) => key === 'user' ? { role, uid: 'admin-1' } : undefined,
    req: { param: () => 'delegate-1' },
    json: (body: unknown, status = 200) => ({ body, status })
  };
}

describe('Admin delegate commission history route', () => {
  it('returns only the selected delegate commission and settlement events in newest-first order', async () => {
    const harness = createHarness({
      events: [
        { eventId: 'commission-old', eventType: 'commission_earned', occurredAt: '2026-09-01T08:00:00.000Z', garageId: 'garage-a', payload: { delegateId: 'delegate-1', commissionAmount: 100, sourceCreditGrantId: 'grant-a' } },
        { eventId: 'settlement', eventType: 'delegate_settled', occurredAt: '2026-09-02T08:00:00.000Z', garageId: 'global', payload: { delegateId: 'delegate-1', previousRechargedAmount: 100, settlementId: 'settle-1' } },
        { eventId: 'other-delegate', eventType: 'commission_earned', occurredAt: '2026-09-03T08:00:00.000Z', payload: { delegateId: 'delegate-2', commissionAmount: 100 } },
        { eventId: 'unrelated', eventType: 'vehicle_entered', occurredAt: '2026-09-04T08:00:00.000Z', payload: { delegateId: 'delegate-1' } }
      ]
    });

    const response = await harness.route(context());
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: any) => item.eventId)).toEqual(['settlement', 'commission-old']);
    expect(response.body.items[1]).toMatchObject({
      eventType: 'commission_earned',
      commissionAmount: 100,
      sourceCreditGrantId: 'grant-a',
      garageId: 'garage-a'
    });
  });

  it('rejects non-admin access', async () => {
    const harness = createHarness();
    const response = await harness.route(context('delegate'));
    expect(response.status).toBe(403);
    expect(response.body.error).toContain('FORBIDDEN');
  });

  it('returns not found for a missing delegate', async () => {
    const harness = createHarness({ delegateExists: false });
    const response = await harness.route(context());
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('DELEGATE_NOT_FOUND');
  });
});
