import { describe, expect, it } from 'vitest';
import { decideGarageDeletion } from './domain/garageDeletion';
import {
  ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS,
  canManageGarageScopedData,
  canRunGarageMaintenance,
  canViewFinancialReport,
} from './domain/authorization';
import { calculateDailyProjection } from './projections';

const garage = { exists: true, name: 'Synthetic Garage' };
const missingGarage = { exists: false, name: '' };
const noJob = { exists: false };

/**
 * C5 policy contract:
 * - Destructive garage deletion and maintenance are admin-only.
 * - Garage owners and staff can manage only their own garage scope.
 * - Delegates and supervisors do not inherit garage data-management authority.
 * - Reports and projections are deterministic, read-only calculations.
 */
describe('non-financial operational policy matrix', () => {
  it('allows only admins to enter garage deletion and maintenance operations', () => {
    for (const role of ['garage', 'staff', 'delegate', 'supervisor', 'backend-operator', undefined]) {
      expect(decideGarageDeletion({ callerRole: role, garageId: 'garage_1' }, garage, noJob)).toEqual({
        ok: false,
        error: 'FORBIDDEN_ADMIN_REQUIRED',
      });
      for (const operation of ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS) {
        expect(canRunGarageMaintenance({ role }, operation)).toBe(false);
      }
    }
    expect(decideGarageDeletion({ callerRole: 'admin', garageId: 'garage_1' }, garage, noJob)).toMatchObject({
      ok: true,
      value: { kind: 'delete', resume: false },
    });
    for (const operation of ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS) {
      expect(canRunGarageMaintenance({ role: 'admin' }, operation)).toBe(true);
    }
  });

  it('preserves safe deletion recovery for missing and already-completed jobs', () => {
    expect(decideGarageDeletion({ callerRole: 'admin', garageId: 'garage_1' }, missingGarage, { exists: true, status: 'completed' })).toEqual({
      ok: true,
      value: { kind: 'already_deleted', garageId: 'garage_1' },
    });
    expect(decideGarageDeletion({ callerRole: 'admin', garageId: 'garage_1' }, missingGarage, { exists: true, status: 'running' })).toEqual({
      ok: false,
      error: 'GARAGE_NOT_FOUND',
    });
    expect(decideGarageDeletion({ callerRole: 'admin', garageId: 'garage_1' }, garage, { exists: true, status: 'running' })).toMatchObject({
      ok: true,
      value: { resume: true },
    });
  });

  it('keeps garage-scoped writes limited to admins, owners, and same-garage staff', () => {
    expect(canManageGarageScopedData({ role: 'admin' }, 'garage_2')).toBe(true);
    expect(canManageGarageScopedData({ role: 'garage', garageId: 'garage_1' }, 'garage_1')).toBe(true);
    expect(canManageGarageScopedData({ role: 'staff', garageId: 'garage_1' }, 'garage_1')).toBe(true);
    for (const principal of [
      { role: 'garage', garageId: 'garage_1' },
      { role: 'staff', garageId: 'garage_1' },
      { role: 'delegate', garageId: 'garage_1' },
      { role: 'supervisor', garageId: 'garage_1' },
    ]) {
      expect(canManageGarageScopedData(principal, 'garage_2')).toBe(false);
    }
    expect(canManageGarageScopedData({ role: 'delegate', garageId: 'garage_1' }, 'garage_1')).toBe(false);
    expect(canManageGarageScopedData({ role: 'supervisor', garageId: 'garage_1' }, 'garage_1')).toBe(false);
  });

  it('keeps financial reports admin-only and projection rebuilds deterministic', () => {
    expect(canViewFinancialReport({ role: 'admin' })).toBe(true);
    for (const role of ['garage', 'staff', 'delegate', 'supervisor', 'backend-operator']) {
      expect(canViewFinancialReport({ role })).toBe(false);
    }
    const events = [
      { occurredAt: '2026-09-25T08:00:00.000Z', eventType: 'vehicle_entered' },
      { occurredAt: '2026-09-25T09:00:00.000Z', eventType: 'vehicle_exited', payload: { cost: 125.5 } },
      { occurredAt: '2026-09-26T08:00:00.000Z', eventType: 'vehicle_exited', payload: { cost: 999 } },
    ];
    const first = calculateDailyProjection(events, '2026-09-25');
    expect(first).toMatchObject({ count: 1, exitsCount: 1, grossRevenue: 125.5, revenue: 125.5 });
    expect(calculateDailyProjection([...events], '2026-09-25')).toEqual(first);
  });
});
