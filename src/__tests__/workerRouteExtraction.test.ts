import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workerSource = readFileSync(resolve(process.cwd(), 'server/cloudflareWorker.ts'), 'utf8');
const readRoutesSource = readFileSync(resolve(process.cwd(), 'server/readRoutes.ts'), 'utf8');
const vehicleRoutesSource = readFileSync(resolve(process.cwd(), 'server/vehicleRoutes.ts'), 'utf8');

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
      'GET /api/garage-summary',
      'GET /api/admin/summary',
      'GET /api/admin/monthly-subscribers-summary',
      'GET /api/admin/subscribers',
      'GET /api/admin/delegates',
      'GET /api/admin/delegates/:id'
    ]);
  });

  it('keeps extracted family registration points in order and preserves the route count', () => {
    const readRegistrationPoint = workerSource.indexOf('registerReadRoutes(workerApp');
    const vehicleRegistrationPoint = workerSource.indexOf('registerVehicleRoutes(workerApp');
    const subscriberRegistrationPoint = workerSource.indexOf("workerApp.post('/api/subscribers/add'");

    expect(readRegistrationPoint).toBeGreaterThan(-1);
    expect(readRegistrationPoint).toBeLessThan(vehicleRegistrationPoint);
    expect(vehicleRegistrationPoint).toBeLessThan(subscriberRegistrationPoint);
    expect(registrations(vehicleRoutesSource)).toEqual([
      'POST /api/vehicles/check-in',
      'POST /api/vehicles/check-out',
      'POST /api/vehicles/delete',
      'POST /api/vehicles/refund',
      'GET /api/vehicles/inside',
      'GET /api/vehicles/history'
    ]);
    expect(registrations(workerSource).length + registrations(readRoutesSource).length + registrations(vehicleRoutesSource).length).toBe(89);
  });

  it('keeps the global Worker export in the monolith', () => {
    expect(workerSource).toContain('workerApp.onError');
    expect(workerSource).toContain('export default {');
    expect(workerSource).toContain('fetch: workerApp.fetch');
  });
});
