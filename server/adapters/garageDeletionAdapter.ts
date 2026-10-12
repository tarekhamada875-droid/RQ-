import {
  decideGarageDeletion,
  GARAGE_DELETION_LEASE_MS,
  isGarageDeletionClaimActive,
  type GarageDeletionGarageState,
  type GarageDeletionJobState
} from '../domain/garageDeletion';

export type LegacyGarageDeletionRecord = Readonly<Record<string, unknown>>;

export type GarageDeletionClaim =
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'already_deleted' }
  | { readonly kind: 'in_progress' }
  | {
      readonly kind: 'claimed';
      readonly garageName: string;
      readonly claimToken: string;
      readonly auditLogId: string;
    };

export function garageDocumentToDeletionState(document: LegacyGarageDeletionRecord | null): GarageDeletionGarageState {
  return {
    exists: document !== null,
    name: typeof document?.name === 'string' ? document.name : '',
  };
}

export function deletionJobDocumentToState(document: LegacyGarageDeletionRecord | null): GarageDeletionJobState {
  if (!document) return { exists: false };
  return {
    exists: true,
    ...(typeof document.status === 'string' ? { status: document.status } : {}),
    ...(typeof document.garageName === 'string' ? { garageName: document.garageName } : {}),
    ...(document.updatedAt !== undefined ? { updatedAt: document.updatedAt } : {}),
    ...(document.leaseExpiresAt !== undefined ? { leaseExpiresAt: document.leaseExpiresAt } : {}),
  };
}

export async function claimGarageDeletion(
  adminDb: any,
  garageId: string,
  callerRole: string | undefined,
  callerUid: string | undefined
): Promise<GarageDeletionClaim> {
  const garageRef = adminDb.doc(`garages/${garageId}`);
  const jobRef = adminDb.doc(`garage_deletion_jobs/${garageId}`);
  const claimToken = globalThis.crypto.randomUUID();
  const proposedAuditLogId = adminDb.collection('activity_logs').doc().id;
  const now = new Date();

  return adminDb.runTransaction(async (transaction: any): Promise<GarageDeletionClaim> => {
    const [garageSnapshot, jobSnapshot] = await Promise.all([
      transaction.get(garageRef),
      transaction.get(jobRef)
    ]);
    const garageData = garageSnapshot.exists ? garageSnapshot.data() || {} : {};
    const jobData = jobSnapshot.exists ? jobSnapshot.data() || {} : {};
    const jobState = deletionJobDocumentToState(jobSnapshot.exists ? jobData : null);
    const decision = decideGarageDeletion(
      { callerRole, garageId },
      garageDocumentToDeletionState(garageSnapshot.exists ? garageData : null),
      jobState
    );

    if (decision.ok === false) {
      return decision.error === 'FORBIDDEN_ADMIN_REQUIRED'
        ? { kind: 'forbidden' }
        : { kind: 'not_found' };
    }
    if (decision.value.kind === 'already_deleted') return { kind: 'already_deleted' };
    if (isGarageDeletionClaimActive(jobState, now.getTime())) return { kind: 'in_progress' };

    const jobGarageName = typeof jobData.garageName === 'string' ? jobData.garageName : '';
    const garageName = typeof garageData.name === 'string'
      ? garageData.name
      : (jobGarageName || decision.value.garageName || garageId);
    const reuseJobAudit = (jobState.status === 'running' || jobState.status === 'failed')
      && typeof jobData.auditLogId === 'string';
    const auditLogId = reuseJobAudit ? String(jobData.auditLogId) : proposedAuditLogId;
    const startedAt = jobData.startedAt || now;
    const startedBy = jobData.startedBy || callerUid || null;

    if (garageSnapshot.exists) {
      transaction.set(garageRef, {
        isDeleting: true,
        deletionStartedAt: startedAt,
        deletionStartedBy: startedBy
      }, { merge: true });
    }
    transaction.set(jobRef, {
      garageId,
      garageName,
      auditLogId,
      status: 'running',
      updatedAt: now,
      startedAt,
      startedBy,
      leaseToken: claimToken,
      leaseExpiresAt: new Date(now.getTime() + GARAGE_DELETION_LEASE_MS)
    }, { merge: true });

    return { kind: 'claimed', garageName, claimToken, auditLogId };
  });
}

export async function renewGarageDeletionLease(adminDb: any, garageId: string, claimToken: string): Promise<void> {
  const jobRef = adminDb.doc(`garage_deletion_jobs/${garageId}`);
  await adminDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.exists ? snapshot.data() || {} : {};
    if (!snapshot.exists || job.status !== 'running' || job.leaseToken !== claimToken) {
      throw new Error('GARAGE_DELETION_IN_PROGRESS');
    }
    const now = new Date();
    transaction.set(jobRef, {
      updatedAt: now,
      leaseExpiresAt: new Date(now.getTime() + GARAGE_DELETION_LEASE_MS)
    }, { merge: true });
  });
}

export async function markGarageDeletionFailed(adminDb: any, garageId: string, claimToken: string): Promise<void> {
  const jobRef = adminDb.doc(`garage_deletion_jobs/${garageId}`);
  await adminDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.exists ? snapshot.data() || {} : {};
    if (!snapshot.exists || job.status !== 'running' || job.leaseToken !== claimToken) return;
    transaction.set(jobRef, {
      status: 'failed',
      updatedAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null
    }, { merge: true });
  });
}

export async function finalizeGarageDeletion(
  adminDb: any,
  garageId: string,
  claimToken: string,
  auditLogId: string,
  completedBy: string | undefined,
  activityLog: Record<string, any>
): Promise<void> {
  const garageRef = adminDb.doc(`garages/${garageId}`);
  const jobRef = adminDb.doc(`garage_deletion_jobs/${garageId}`);
  const auditLogRef = adminDb.doc(`activity_logs/${auditLogId}`);

  await adminDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.exists ? snapshot.data() || {} : {};
    if (!snapshot.exists || job.status !== 'running' || job.leaseToken !== claimToken) {
      throw new Error('GARAGE_DELETION_IN_PROGRESS');
    }

    const now = new Date();
    transaction.set(auditLogRef, activityLog);
    transaction.delete(garageRef);
    transaction.set(jobRef, {
      garageId,
      status: 'completed',
      updatedAt: now,
      completedAt: now,
      completedBy: completedBy || null,
      leaseToken: null,
      leaseExpiresAt: null
    }, { merge: true });
  });
}
