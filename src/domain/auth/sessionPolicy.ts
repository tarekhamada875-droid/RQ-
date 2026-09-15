import type { EntityRole } from '../../types';

export const ENTITY_COLLECTIONS: Record<EntityRole, string> = {
  admin: 'admin_settings',
  supervisor: 'supervisors',
  delegate: 'delegates',
  staff: 'staff',
  garage: 'garages'
};

export const SECURITY_COLLECTIONS: Record<EntityRole, string> = {
  admin: 'admin_sessions',
  supervisor: 'supervisor_sessions',
  delegate: 'delegate_sessions',
  staff: 'staff_sessions',
  garage: 'garage_sessions'
};

export const getEntityDocumentId = (role: EntityRole, entityId: string): string =>
  role === 'admin' ? 'auth_pin' : entityId;

export const getSessionConflictCode = (role: EntityRole): string => {
  if (role === 'delegate') return 'DELEGATE_SESSION_OCCUPIED';
  if (role === 'garage') return 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS';
  return 'SESSION_OCCUPIED';
};
