import { describe, expect, it } from 'vitest';
import {
  ENTITY_COLLECTIONS,
  SECURITY_COLLECTIONS,
  getEntityDocumentId,
  getSessionConflictCode
} from './sessionPolicy';

const roles = ['admin', 'supervisor', 'delegate', 'staff', 'garage'] as const;

describe('session policy contracts', () => {
  it('maps every supported role to one entity and security collection', () => {
    for (const role of roles) {
      expect(ENTITY_COLLECTIONS[role]).toBeTruthy();
      expect(SECURITY_COLLECTIONS[role]).toBeTruthy();
    }
    expect(ENTITY_COLLECTIONS.admin).toBe('admin_settings');
    expect(SECURITY_COLLECTIONS.admin).toBe('admin_sessions');
  });

  it('uses the shared admin auth-pin document and entity IDs for other roles', () => {
    expect(getEntityDocumentId('admin', 'ignored')).toBe('auth_pin');
    for (const role of roles.filter(role => role !== 'admin')) {
      expect(getEntityDocumentId(role, `${role}-1`)).toBe(`${role}-1`);
    }
  });

  it('preserves role-specific conflict errors', () => {
    expect(getSessionConflictCode('delegate')).toBe('DELEGATE_SESSION_OCCUPIED');
    expect(getSessionConflictCode('garage')).toBe('ACCESS_DENIED_ACTIVE_SESSION_EXISTS');
    expect(getSessionConflictCode('admin')).toBe('SESSION_OCCUPIED');
    expect(getSessionConflictCode('supervisor')).toBe('SESSION_OCCUPIED');
    expect(getSessionConflictCode('staff')).toBe('SESSION_OCCUPIED');
  });
});
