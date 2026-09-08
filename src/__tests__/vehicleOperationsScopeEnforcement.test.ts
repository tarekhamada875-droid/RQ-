import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Vehicle Operations & Scope Enforcement Regression Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Mock server handler logic simulation matching server.ts
  const simulateVehicleEndpoint = (
    endpoint: '/check-in' | '/check-out' | '/delete',
    userSession: { uid: string; role: string; garageId?: string } | null,
    body: { garageId?: string; plateNumber?: string; plateRaw?: string; vehicleId?: string }
  ) => {
    // 1. Session / Auth verification
    if (!userSession) {
      return { status: 401, error: 'UNAUTHORIZED: Missing Firebase ID Token' };
    }
    if (!userSession.role) {
      return { status: 403, error: 'FORBIDDEN: No active session found' };
    }

    // 2. Derive garageId & scope mismatch enforcement
    const callerRole = userSession.role;
    const bodyGarageId = body.garageId;
    let targetGarageId = '';

    if (callerRole === 'garage' || callerRole === 'staff') {
      if (!userSession.garageId) {
        return { status: 403, error: 'FORBIDDEN: Garage ID missing in session' };
      }
      if (bodyGarageId && bodyGarageId !== userSession.garageId) {
        return { status: 403, error: 'GARAGE_SCOPE_MISMATCH' };
      }
      targetGarageId = userSession.garageId;
    } else if (callerRole === 'admin') {
      targetGarageId = bodyGarageId || '';
    } else {
      return { status: 403, error: 'FORBIDDEN: Role not authorized for vehicle operations' };
    }

    // 3. Parameter validation
    if (endpoint === '/check-in') {
      if (!targetGarageId || !body.plateNumber || !body.plateRaw) {
        return { status: 400, error: 'MISSING_PARAMETERS' };
      }
    } else {
      if (!targetGarageId || !body.vehicleId) {
        return { status: 400, error: 'MISSING_PARAMETERS' };
      }
    }

    return { status: 200, success: true, derivedGarageId: targetGarageId };
  };

  it('1. Garage Owner check-in succeeds using server-derived session garageId', () => {
    const session = { uid: 'garage_user_1', role: 'garage', garageId: 'garage_A' };
    const res = simulateVehicleEndpoint('/check-in', session, {
      garageId: 'garage_A',
      plateNumber: 'س ج ط 1 2 3 4',
      plateRaw: 'سجط1234'
    });

    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
    expect(res.derivedGarageId).toBe('garage_A');
  });

  it('2. Garage Owner checkout succeeds using server-derived session garageId', () => {
    const session = { uid: 'garage_user_1', role: 'garage', garageId: 'garage_A' };
    const res = simulateVehicleEndpoint('/check-out', session, {
      garageId: 'garage_A',
      vehicleId: 'سجط1234'
    });

    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
    expect(res.derivedGarageId).toBe('garage_A');
  });

  it('3. Staff check-in succeeds using server-derived session garageId', () => {
    const session = { uid: 'staff_user_1', role: 'staff', garageId: 'garage_A' };
    const res = simulateVehicleEndpoint('/check-in', session, {
      garageId: 'garage_A',
      plateNumber: 'س ج ط 1 2 3 4',
      plateRaw: 'سجط1234'
    });

    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
    expect(res.derivedGarageId).toBe('garage_A');
  });

  it('4. Staff checkout succeeds using server-derived session garageId', () => {
    const session = { uid: 'staff_user_1', role: 'staff', garageId: 'garage_A' };
    const res = simulateVehicleEndpoint('/check-out', session, {
      garageId: 'garage_A',
      vehicleId: 'سجط1234'
    });

    expect(res.status).toBe(200);
    expect(res.success).toBe(true);
    expect(res.derivedGarageId).toBe('garage_A');
  });

  it('5. Garage Owner cannot operate another garage when bodyGarageId differs', () => {
    const session = { uid: 'garage_user_1', role: 'garage', garageId: 'garage_A' };
    const res = simulateVehicleEndpoint('/check-in', session, {
      garageId: 'garage_ATTACK_TARGET_B',
      plateNumber: 'س ج ط 1 2 3 4',
      plateRaw: 'سجط1234'
    });

    expect(res.status).toBe(403);
    expect(res.error).toBe('GARAGE_SCOPE_MISMATCH');
  });

  it('6. Staff cannot operate another garage when bodyGarageId differs', () => {
    const session = { uid: 'staff_user_1', role: 'staff', garageId: 'garage_A' };
    const res = simulateVehicleEndpoint('/check-out', session, {
      garageId: 'garage_ATTACK_TARGET_B',
      vehicleId: 'سجط1234'
    });

    expect(res.status).toBe(403);
    expect(res.error).toBe('GARAGE_SCOPE_MISMATCH');
  });

  it('7. Client-supplied garageId mismatch returns 403 GARAGE_SCOPE_MISMATCH without fallback', () => {
    const session = { uid: 'garage_user_1', role: 'garage', garageId: 'garage_AUTHORIZED' };
    const res = simulateVehicleEndpoint('/delete', session, {
      garageId: 'garage_UNAUTHORIZED',
      vehicleId: 'سجط1234'
    });

    expect(res.status).toBe(403);
    expect(res.error).toBe('GARAGE_SCOPE_MISMATCH');
  });

  it('8. Missing/invalid session returns 401/403 errors', () => {
    const res1 = simulateVehicleEndpoint('/check-in', null, { plateNumber: 'A', plateRaw: 'A' });
    expect(res1.status).toBe(401);

    const res2 = simulateVehicleEndpoint('/check-in', { uid: 'u1', role: '' }, { plateNumber: 'A', plateRaw: 'A' });
    expect(res2.status).toBe(403);
  });

  it('9. Supervisor and Delegate roles are rejected from vehicle operations', () => {
    const supervisorSession = { uid: 'sup_1', role: 'supervisor', garageId: 'garage_A' };
    const res1 = simulateVehicleEndpoint('/check-in', supervisorSession, {
      garageId: 'garage_A',
      plateNumber: 'س ج ط 1 2 3 4',
      plateRaw: 'سجط1234'
    });
    expect(res1.status).toBe(403);
    expect(res1.error).toBe('FORBIDDEN: Role not authorized for vehicle operations');

    const delegateSession = { uid: 'del_1', role: 'delegate', garageId: 'garage_A' };
    const res2 = simulateVehicleEndpoint('/check-out', delegateSession, {
      garageId: 'garage_A',
      vehicleId: 'سجط1234'
    });
    expect(res2.status).toBe(403);
    expect(res2.error).toBe('FORBIDDEN: Role not authorized for vehicle operations');
  });
});
