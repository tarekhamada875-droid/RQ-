import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workerSource = readFileSync(resolve(process.cwd(), 'server/cloudflareWorker.ts'), 'utf8');
const readRoutesSource = readFileSync(resolve(process.cwd(), 'server/readRoutes.ts'), 'utf8');

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

  it('keeps the extracted family registration point before vehicles and preserves the route count', () => {
    const registrationPoint = workerSource.indexOf('registerReadRoutes(workerApp');
    const firstVehicleRoute = workerSource.indexOf("workerApp.post('/api/vehicles/check-in'");

    expect(registrationPoint).toBeGreaterThan(-1);
    expect(registrationPoint).toBeLessThan(firstVehicleRoute);
    expect(registrations(workerSource).length + registrations(readRoutesSource).length).toBe(89);
  });

  it('keeps the global Worker export in the monolith', () => {
    expect(workerSource).toContain('workerApp.onError');
    expect(workerSource).toContain('export default {');
    expect(workerSource).toContain('fetch: workerApp.fetch');
  });
});
