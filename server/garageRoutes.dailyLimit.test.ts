import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGarageRoutes } from './garageRoutes';
import { getCairoDayBounds } from './projections';

afterEach(() => {
  vi.useRealTimers();
});

function createGarageRouteHarness() {
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

  const queryCalls: unknown[][] = [];
  const query: any = {
    where: vi.fn((...args: unknown[]) => {
      queryCalls.push(args);
      return query;
    }),
    limit: vi.fn(() => query),
    get: vi.fn(async () => ({ size: 3 }))
  };
  const db = {
    collection: vi.fn(() => query),
    runTransaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback({}))
  };

  const dependencies: any = {
    getAdminDb: () => db,
    requireWorkerAuth: vi.fn(),
    enforceWorkerFinancialRateLimit: vi.fn(),
    canSubmitGarageApplication: () => true,
    sanitizePayload: (body: unknown) => body,
    validateString: (value: unknown) => value,
    validateNumber: (value: unknown) => value,
    ValidationError: class extends Error {},
    validateNewPin: (value: unknown) => value,
    validateIdempotencyKey: (value: unknown) => value,
    computeLookupHash: () => 'pin-lookup-hash',
    checkPinAvailabilityAcrossAll: async () => ({ taken: false }),
    createRequestFingerprint: () => 'request-fingerprint',
    checkIdempotencyInTransaction: async () => ({ isDuplicate: false }),
    saveEntityPinInTransaction: vi.fn(),
    maintainedGarageSummaryRef: vi.fn(),
    maintainedAdminSummaryRef: vi.fn(),
    MAINTAINED_SUMMARY_VERSION: 1,
    writeMaintainedAdminDelta: vi.fn(),
    storeIdempotencyInTransaction: vi.fn(),
    mapDomainErrorToStatus: () => ({ statusCode: 500, message: 'unexpected error' }),
    parseMoneyAmount: vi.fn(),
    parseFirestorePageRequest: vi.fn(),
    firestorePageStartAfter: vi.fn(),
    buildFirestorePage: vi.fn(),
    canRunGarageMaintenance: () => false,
    validateId: vi.fn(),
    getCairoDayBounds,
    reconcileGarageState: vi.fn(),
    isValidDateKey: vi.fn(),
    calculateDailyProjection: vi.fn(),
    aggregateProjectionBuckets: vi.fn(),
    reconcileDashboardSummary: vi.fn(),
    decideGarageScope: vi.fn(),
    isFreshDashboardSummary: vi.fn(),
    normalizeStoredDashboardMoney: vi.fn(),
    canManageStaffForGarage: vi.fn(),
    deleteEntityPinInTransaction: vi.fn(),
    canManageDelegates: vi.fn(),
    saveEntityPin: vi.fn(),
    canUpdateEntityPin: vi.fn(),
    validatePackageCatalogRecord: vi.fn(),
    grantPaidCredits: vi.fn(),
    grantTrialCredits: vi.fn(),
    awardReferralCredits: vi.fn(),
    materializeCreditLedgerEntry: vi.fn(),
    recordDomainEventInTransaction: vi.fn(),
    startGarageDeletionRoute: vi.fn(),
    advanceGarageDeletionRoute: vi.fn(),
    readGarageDeletionStatusRoute: vi.fn()
  };

  registerGarageRoutes(app, dependencies);
  return { createGarage: routes.get('POST /api/garages/create'), queryCalls, query, db };
}

describe('delegate daily garage creation limit', () => {
  it('uses the full Cairo-local calendar day during standard time', async () => {
    vi.useFakeTimers();
    // 00:30 in Cairo on 11 December 2026 (UTC+02:00).
    vi.setSystemTime(new Date('2026-12-10T22:30:00.000Z'));

    const harness = createGarageRouteHarness();
    expect(harness.createGarage).toBeTypeOf('function');

    const response = await harness.createGarage!({
      get: (key: string) => key === 'user' ? {
        role: 'delegate',
        uid: 'delegate-1',
        entityId: 'delegate-1',
        displayName: 'Delegate'
      } : undefined,
      req: {
        json: async () => ({
          name: 'Test Garage',
          pin: '1234',
          idempotencyKey: 'create-garage-at-boundary'
        }),
        header: () => undefined
      },
      json: (body: unknown, status = 200) => ({ body, status })
    });

    const expectedBounds = getCairoDayBounds('2026-12-11');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' });
    expect(harness.queryCalls).toEqual([
      ['createdByDelegateId', '==', 'delegate-1'],
      ['createdAt', '>=', expectedBounds.start],
      ['createdAt', '<', expectedBounds.end]
    ]);
  });
});
