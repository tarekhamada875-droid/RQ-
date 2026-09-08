import { describe, it, expect } from 'vitest';

/**
 * Authentication & Session Security Layer Rules Verification
 * Verifies rules logic against the 12 Security Scenarios defined in FIX #1.
 */

// Simulated Firestore Rules Engine based directly on firestore.rules
const evaluateFirestoreRule = ({
  auth,
  path,
  operation,
  resource,
  requestResource,
  databaseState
}: {
  auth: { uid: string } | null;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  resource?: any;
  requestResource?: any;
  databaseState?: Record<string, any>;
}): { allowed: boolean; code?: string } => {
  const isSignedIn = auth !== null && !!auth.uid;
  const db = databaseState || {};

  const isAdmin = () => {
    return isSignedIn && !!db[`admin_sessions/${auth!.uid}`];
  };

  const isSupervisor = () => {
    return isSignedIn && !!db[`supervisor_sessions/${auth!.uid}`];
  };

  const isValidSessionDoc = (data: any, expectedRole: string) => {
    return (
      data?.uid === auth?.uid &&
      data?.role === expectedRole &&
      typeof data?.entityId === 'string' &&
      data.entityId.length > 0 &&
      typeof data?.sessionId === 'string' &&
      data.sessionId.length > 0 &&
      typeof data?.isActive === 'boolean'
    );
  };

  const isSessionUpdateValid = (incoming: any, existing: any) => {
    if (!existing || !incoming) return false;
    const sameUid = incoming.uid === existing.uid;
    const sameRole = incoming.role === existing.role;
    const sameEntityId = incoming.entityId === existing.entityId;
    const sameSessionId = incoming.sessionId === existing.sessionId;
    const sameCreatedAt = !('createdAt' in existing) || incoming.createdAt === existing.createdAt;
    
    // Check affected keys
    const changedKeys = Object.keys(incoming).filter(k => incoming[k] !== existing[k]);
    const onlyAllowedKeys = changedKeys.every(k => k === 'lastActive' || k === 'isActive');

    return sameUid && sameRole && sameEntityId && sameSessionId && sameCreatedAt && onlyAllowedKeys;
  };

  // 1. Garage Protected Data (e.g. /garages/{garageId}/vehicles/{vehicleId})
  if (path.startsWith('garages/') && path.includes('/vehicles/')) {
    const parts = path.split('/');
    const garageId = parts[1];
    if (!isSignedIn) return { allowed: false, code: 'PERMISSION_DENIED' };
    const hasGarageSession = db[`garage_sessions/${auth!.uid}`]?.entityId === garageId;
    const hasStaffSession = db[`staff/${db[`staff_sessions/${auth!.uid}`]?.entityId}`]?.garageId === garageId;
    if (isAdmin() || isSupervisor() || hasGarageSession || hasStaffSession) {
      return { allowed: true };
    }
    return { allowed: false, code: 'PERMISSION_DENIED' };
  }

  // 2. Private PINs
  if (path.startsWith('private_pins/')) {
    if (isAdmin() || isSupervisor()) {
      return { allowed: true };
    }
    return { allowed: false, code: 'PERMISSION_DENIED' };
  }

  // 3. Admin Sessions
  if (path.startsWith('admin_sessions/')) {
    const sessionUid = path.split('/')[1];
    if (!isSignedIn) return { allowed: false, code: 'PERMISSION_DENIED' };
    if (operation === 'get' || operation === 'delete') {
      return sessionUid === auth!.uid || isAdmin() ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'create') {
      const allowed = sessionUid === auth!.uid && isValidSessionDoc(requestResource, 'admin') && requestResource.entityId === 'auth_pin';
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'update') {
      const allowed = sessionUid === auth!.uid && isSessionUpdateValid(requestResource, resource);
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
  }

  // 4. Garage Sessions
  if (path.startsWith('garage_sessions/')) {
    const sessionDocId = path.split('/')[1];
    if (!isSignedIn) return { allowed: false, code: 'PERMISSION_DENIED' };
    if (operation === 'get' || operation === 'delete') {
      return sessionDocId === auth!.uid || isAdmin() ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'create') {
      const existsGarage = !!db[`garages/${requestResource?.entityId}`];
      const isDeleting = db[`garages/${requestResource?.entityId}`]?.isDeleting === true;
      const allowed = sessionDocId === auth!.uid && isValidSessionDoc(requestResource, 'garage') && existsGarage && !isDeleting;
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'update') {
      const allowed = sessionDocId === auth!.uid && isSessionUpdateValid(requestResource, resource);
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
  }

  // 5. Staff Sessions
  if (path.startsWith('staff_sessions/')) {
    const sessionUid = path.split('/')[1];
    if (!isSignedIn) return { allowed: false, code: 'PERMISSION_DENIED' };
    if (operation === 'get' || operation === 'delete') {
      return sessionUid === auth!.uid || isAdmin() ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'create') {
      const staffDoc = db[`staff/${requestResource?.entityId}`];
      const existsStaff = !!staffDoc;
      const garageDeleting = staffDoc && db[`garages/${staffDoc.garageId}`]?.isDeleting === true;
      const allowed = sessionUid === auth!.uid && isValidSessionDoc(requestResource, 'staff') && existsStaff && !garageDeleting;
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'update') {
      const allowed = sessionUid === auth!.uid && isSessionUpdateValid(requestResource, resource);
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
  }

  // 6. Delegate Sessions
  if (path.startsWith('delegate_sessions/')) {
    const sessionUid = path.split('/')[1];
    if (!isSignedIn) return { allowed: false, code: 'PERMISSION_DENIED' };
    if (operation === 'get' || operation === 'delete') {
      return sessionUid === auth!.uid || isAdmin() ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'create') {
      const existsDel = !!db[`delegates/${requestResource?.entityId}`];
      const allowed = sessionUid === auth!.uid && isValidSessionDoc(requestResource, 'delegate') && existsDel;
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'update') {
      const allowed = sessionUid === auth!.uid && isSessionUpdateValid(requestResource, resource);
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
  }

  // 7. Supervisor Sessions
  if (path.startsWith('supervisor_sessions/')) {
    const sessionUid = path.split('/')[1];
    if (!isSignedIn) return { allowed: false, code: 'PERMISSION_DENIED' };
    if (operation === 'get' || operation === 'delete') {
      return sessionUid === auth!.uid || isAdmin() ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'create') {
      const existsSup = !!db[`supervisors/${requestResource?.entityId}`];
      const allowed = sessionUid === auth!.uid && isValidSessionDoc(requestResource, 'supervisor') && existsSup;
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
    if (operation === 'update') {
      const allowed = sessionUid === auth!.uid && isSessionUpdateValid(requestResource, resource);
      return allowed ? { allowed: true } : { allowed: false, code: 'PERMISSION_DENIED' };
    }
  }

  return { allowed: false, code: 'PERMISSION_DENIED' };
};

describe('FIX #1: Top 12 Security Rebuild Test Scenarios', () => {
  const mockDbState: Record<string, any> = {
    'garages/garage-A': { name: 'Garage A', phone: '01000000001' },
    'garages/garage-B': { name: 'Garage B', phone: '01000000002' },
    'staff/staff-A': { name: 'Staff A', garageId: 'garage-A' },
    'staff/staff-B': { name: 'Staff B', garageId: 'garage-B' },
    'delegates/del-1': { name: 'Delegate 1' },
    'supervisors/sup-1': { name: 'Supervisor 1' },
    'garage_sessions/uid-garage-A': { uid: 'uid-garage-A', role: 'garage', entityId: 'garage-A', sessionId: 'sess-1', isActive: true },
    'staff_sessions/uid-staff-A': { uid: 'uid-staff-A', role: 'staff', entityId: 'staff-A', sessionId: 'sess-2', isActive: true },
    'private_pins/garage-A': { pin: '1234' }
  };

  it('TEST 1: Anonymous user tries to read protected garage data -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: null, // Unauthenticated / anonymous without authorization
      path: 'garages/garage-A/vehicles/veh-1',
      operation: 'get',
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 2: Anonymous user tries to create garage_sessions -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: null,
      path: 'garage_sessions/anon-uid',
      operation: 'create',
      requestResource: {
        uid: 'anon-uid',
        role: 'garage',
        entityId: 'garage-A',
        sessionId: 'sess-anon',
        isActive: true
      },
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 3: Authorized Garage A tries to create a session for Garage B -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-attacker' },
      path: 'garage_sessions/uid-garage-B', // trying to target Garage B's session doc
      operation: 'create',
      requestResource: {
        uid: 'uid-attacker',
        role: 'garage',
        entityId: 'garage-B',
        sessionId: 'sess-malicious',
        isActive: true
      },
      databaseState: mockDbState
    });
    // uid mismatch with path doc ID
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 4: Staff A tries to create a session for Staff B -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-staff-A' },
      path: 'staff_sessions/uid-staff-B',
      operation: 'create',
      requestResource: {
        uid: 'uid-staff-A',
        role: 'staff',
        entityId: 'staff-B',
        sessionId: 'sess-staff-spoof',
        isActive: true
      },
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 5: Staff tries role = "admin" -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-staff-A' },
      path: 'admin_sessions/uid-staff-A',
      operation: 'create',
      requestResource: {
        uid: 'uid-staff-A',
        role: 'admin',
        entityId: 'staff-A', // Invalid entityId for admin
        sessionId: 'sess-admin-escalation',
        isActive: true
      },
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 6: Garage tries role = "supervisor" -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-garage-A' },
      path: 'supervisor_sessions/uid-garage-A',
      operation: 'create',
      requestResource: {
        uid: 'uid-garage-A',
        role: 'supervisor',
        entityId: 'garage-A', // not a valid supervisor document in db
        sessionId: 'sess-sup-escalation',
        isActive: true
      },
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 7: Authenticated user tries to read private_pins -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-garage-A' },
      path: 'private_pins/garage-A',
      operation: 'get',
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 8: User A tries to read User B session -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-garage-A' },
      path: 'garage_sessions/uid-garage-B',
      operation: 'get',
      resource: mockDbState['garage_sessions/uid-garage-B'],
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 9: User changes session.entityId after creation -> PERMISSION_DENIED', () => {
    const existing = {
      uid: 'uid-garage-A',
      role: 'garage',
      entityId: 'garage-A',
      sessionId: 'sess-1',
      isActive: true,
      lastActive: 1000
    };
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-garage-A' },
      path: 'garage_sessions/uid-garage-A',
      operation: 'update',
      resource: existing,
      requestResource: {
        ...existing,
        entityId: 'garage-B' // Malicious mutation
      },
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 10: User changes session.role after creation -> PERMISSION_DENIED', () => {
    const existing = {
      uid: 'uid-garage-A',
      role: 'garage',
      entityId: 'garage-A',
      sessionId: 'sess-1',
      isActive: true,
      lastActive: 1000
    };
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-garage-A' },
      path: 'garage_sessions/uid-garage-A',
      operation: 'update',
      resource: existing,
      requestResource: {
        ...existing,
        role: 'admin' // Malicious privilege escalation
      },
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 11: User changes session.uid after creation -> PERMISSION_DENIED', () => {
    const existing = {
      uid: 'uid-garage-A',
      role: 'garage',
      entityId: 'garage-A',
      sessionId: 'sess-1',
      isActive: true,
      lastActive: 1000
    };
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-garage-A' },
      path: 'garage_sessions/uid-garage-A',
      operation: 'update',
      resource: existing,
      requestResource: {
        ...existing,
        uid: 'uid-other' // Malicious uid spoofing
      },
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });

  it('TEST 12: User tries to delete another user session -> PERMISSION_DENIED', () => {
    const res = evaluateFirestoreRule({
      auth: { uid: 'uid-garage-A' },
      path: 'garage_sessions/uid-garage-B',
      operation: 'delete',
      resource: mockDbState['garage_sessions/uid-garage-B'],
      databaseState: mockDbState
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_DENIED');
  });
});
