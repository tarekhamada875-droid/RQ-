import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workerSource = readFileSync(resolve(process.cwd(), 'server/cloudflareWorker.ts'), 'utf8');
const sessionRoutesSource = readFileSync(resolve(process.cwd(), 'server/workerSessionRoutes.ts'), 'utf8');
const foundationRoutesSource = readFileSync(resolve(process.cwd(), 'server/workerFoundationRoutes.ts'), 'utf8');
const readRoutesSource = readFileSync(resolve(process.cwd(), 'server/readRoutes.ts'), 'utf8');
const vehicleRoutesSource = readFileSync(resolve(process.cwd(), 'server/vehicleRoutes.ts'), 'utf8');
const subscriberRoutesSource = readFileSync(resolve(process.cwd(), 'server/subscriberRoutes.ts'), 'utf8');
const financialRoutesSource = readFileSync(resolve(process.cwd(), 'server/financialRoutes.ts'), 'utf8');
const garageRoutesSource = readFileSync(resolve(process.cwd(), 'server/garageRoutes.ts'), 'utf8');

function registrations(source: string): string[] {
  return [...source.matchAll(/\b(?:workerApp|app)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
}

describe('Cross-F1 Worker route extraction inventory', () => {
  it('keeps the first read/system family in its original order and preserves aliases', () => {
    expect(registrations(readRoutesSource)).toEqual([
      'GET /api/system-config',
      'POST /api/admin/update-system-config',
      'POST /api/check-subscriber',
      'GET /api/garage-summary'
    ]);
  });

  it('keeps extracted family registration points in order and preserves the route count', () => {
    const foundationRegistrationPoint = workerSource.indexOf('registerFoundationRoutes(workerApp');
    const sessionRegistrationPoint = workerSource.indexOf('registerSessionRoutes(workerApp');
    const readRegistrationPoint = workerSource.indexOf('registerReadRoutes(workerApp');
    const vehicleRegistrationPoint = workerSource.indexOf('registerVehicleRoutes(workerApp');
    const subscriberRegistrationPoint = workerSource.indexOf('registerSubscriberRoutes(workerApp');
    const financialRegistrationPoint = workerSource.indexOf('registerFinancialRoutes(workerApp');
    const garageRegistrationPoint = workerSource.indexOf('registerGarageRoutes(workerApp');

    expect(foundationRegistrationPoint).toBeGreaterThan(-1);
    expect(foundationRegistrationPoint).toBeLessThan(sessionRegistrationPoint);
    expect(sessionRegistrationPoint).toBeLessThan(readRegistrationPoint);
    expect(readRegistrationPoint).toBeLessThan(vehicleRegistrationPoint);
    expect(vehicleRegistrationPoint).toBeLessThan(subscriberRegistrationPoint);
    expect(subscriberRegistrationPoint).toBeLessThan(financialRegistrationPoint);
    expect(financialRegistrationPoint).toBeLessThan(garageRegistrationPoint);
    expect(registrations(foundationRoutesSource)).toEqual([
      'GET /api/health',
      'GET /api/version',
      'POST /api/test-auth-verify',
      'GET /api/test-firestore-read',
      'POST /api/test-firestore-write'
    ]);
    expect(registrations(sessionRoutesSource)).toEqual([
      'POST /api/auth/verify-pin',
      'POST /api/auth/verify-admin-pin',
      'POST /api/auth/check-pin-availability',
      'POST /api/admin/update-pin',
      'POST /api/auth/claim-admin-session',
      'POST /api/auth/validate-or-refresh-session',
      'POST /api/auth/release-session',
      'POST /api/auth/release-admin-session',
      'POST /api/auth/invalidate-all-sessions',
      'GET /api/auth/sessions',
      'DELETE /api/auth/sessions/:sessionKey'
    ]);
    expect(registrations(subscriberRoutesSource)).toEqual([
      'POST /api/subscribers/add',
      'POST /api/subscribers/renew',
      'POST /api/subscribers/update',
      'POST /api/subscribers/delete'
    ]);
    expect(registrations(vehicleRoutesSource)).toEqual([
      'POST /api/vehicles/check-in',
      'POST /api/vehicles/check-out',
      'POST /api/vehicles/delete',
      'GET /api/vehicles/inside',
      'GET /api/vehicles/history'
    ]);
    expect(registrations(financialRoutesSource)).toEqual([
      'GET /api/delegate/commission-earnings',
      'GET /api/delegates/dashboard',
      'POST /api/delegate/withdraw-commission',
      'POST /api/delegates/settle-account',
      'GET /api/delegates/:id/commission-history',
      'GET /api/delegates/:id/paid-grant-history',
      'GET /api/financial-summary',
      'GET /api/reports/financial'
    ]);
    expect(registrations(garageRoutesSource)).toEqual([
      'POST /api/garages/create',
      'POST /api/garages/update',
      'POST /api/garages/delete',
      'POST /api/garages/delete-step',
      'GET /api/garages/delete-status',
      'GET /api/garages',
      'POST /api/garages/reconciliation',
      'POST /api/garages/dashboard-summary/rebuild',
      'POST /api/garages/rebuild-projections',
      'GET /api/garages/:id/dashboard-summary',
      'GET /api/garages/:id',
      'POST /api/staff/create',
      'POST /api/staff/update',
      'POST /api/staff/delete',
      'POST /api/delegates/create',
      'POST /api/delegates/update',
      'POST /api/delegates/delete',
      'POST /api/people/update-pin',
      'POST /api/garages/:id/credit-grants',
      'POST /api/garages/:id/credit-corrections',
      'GET /api/garages/:id/credit-ledger',
      'POST /api/garages/recalculate-cars-inside'
    ]);
    expect(registrations(workerSource).length
      + registrations(foundationRoutesSource).length
      + registrations(sessionRoutesSource).length
      + registrations(readRoutesSource).length
      + registrations(vehicleRoutesSource).length
      + registrations(subscriberRoutesSource).length
      + registrations(financialRoutesSource).length
      + registrations(garageRoutesSource).length
    ).toBe(60);
  });

  it('keeps the global Worker export in the monolith', () => {
    expect(workerSource).toContain('workerApp.onError');
    expect(workerSource).toContain('export default {');
    expect(workerSource).toContain('fetch: workerApp.fetch');
  });
});
