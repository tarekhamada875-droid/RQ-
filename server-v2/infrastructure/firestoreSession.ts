import type { Firestore } from 'firebase-admin/firestore';
import { SessionSchema, type Session } from '../contracts/entities.js';

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const ROLE_COLLECTIONS = [
  { role: 'admin' as const, sessions: 'admin_sessions', entities: 'admin_settings', fixedEntityId: 'auth_pin' },
  { role: 'supervisor' as const, sessions: 'supervisor_sessions', entities: 'supervisors' },
  { role: 'delegate' as const, sessions: 'delegate_sessions', entities: 'delegates' },
  { role: 'garage' as const, sessions: 'garage_sessions', entities: 'garages' },
  { role: 'staff' as const, sessions: 'staff_sessions', entities: 'staff' }
] as const;

function toIso(value: unknown, fallback: Date): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = Reflect.get(value, 'toDate');
    if (typeof toDate === 'function') {
      const date = toDate.call(value);
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return fallback.toISOString();
}

function entityHasSession(data: Record<string, unknown>, sessionId: string): boolean {
  const activeSessionIds = Array.isArray(data.activeSessionIds) ? data.activeSessionIds : [];
  return activeSessionIds.includes(sessionId) || data.currentSessionId === sessionId;
}

export interface V2SessionRepository {
  getSession(uid: string, sessionId: string): Promise<Session | undefined>;
}

export class FirestoreSessionRepository implements V2SessionRepository {
  constructor(private readonly firestore: Firestore, private readonly inactivityMs = SESSION_TIMEOUT_MS) {}

  async getSession(uid: string, sessionId: string): Promise<Session | undefined> {
    for (const definition of ROLE_COLLECTIONS) {
      const legacySnapshot = await this.firestore.doc(`${definition.sessions}/${uid}`).get();
      const deviceSnapshot = await this.firestore.doc(`${definition.sessions}/${uid}/sessions/${sessionId}`).get();
      const snapshot = deviceSnapshot.exists ? deviceSnapshot : legacySnapshot;
      if (!snapshot.exists) continue;
      const data = snapshot.data() ?? {};
      if (data.isActive !== true || data.sessionId !== sessionId) continue;
      const entityId = ('fixedEntityId' in definition ? definition.fixedEntityId : undefined) ?? String(data.entityId ?? '');
      if (!entityId) continue;
      const entitySnapshot = await this.firestore.doc(`${definition.entities}/${entityId}`).get();
      if (!entitySnapshot.exists || !entityHasSession(entitySnapshot.data() ?? {}, sessionId)) continue;
      const entityData = entitySnapshot.data() ?? {};
      const now = new Date();
      const garageId = definition.role === 'garage'
        ? String(data.garageId ?? data.entityId ?? '')
        : definition.role === 'staff'
          ? String(data.garageId ?? entityData.garageId ?? '')
          : undefined;
      const delegateGarageIds = definition.role === 'delegate'
        ? (Array.isArray(entityData.garageIds) ? entityData.garageIds.filter((value): value is string => typeof value === 'string') : [])
        : [];
      return SessionSchema.parse({
        id: sessionId,
        uid,
        role: definition.role,
        ...(garageId ? { garageId } : {}),
        delegateGarageIds,
        expiresAt: toIso(data.expiresAt, new Date(now.getTime() + this.inactivityMs)),
        lastActiveAt: toIso(data.lastActive, new Date(0)),
        revoked: data.revoked === true || data.isActive !== true
      });
    }
    return undefined;
  }
}
