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
      readonly processedRecords: number;
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

    const processedRecords = Number.isFinite(Number(jobData.processedRecords))
      ? Math.max(0, Number(jobData.processedRecords))
      : 0;
    const jobGarageName = typeof jobData.garageName === 'string' ? jobData.garageName : '';
    const garageName = typeof garageData.name === 'string'
      ? garageData.name
      : (jobGarageName || decision.value.garageName || garageId);

    if (isGarageDeletionClaimActive(jobState, now.getTime())) {
      if (jobData.executionMode === 'client_steps' && typeof jobData.leaseToken === 'string' && jobData.leaseToken) {
        return { kind: 'claimed', garageName, claimToken: jobData.leaseToken, processedRecords };
      }
      // Do not overlap an older release's waitUntil-based job. It can be reclaimed
      // safely once its existing lease expires.
      return { kind: 'in_progress' };
    }

    const resumeAudit = (jobState.status === 'running' || jobState.status === 'failed')
      && typeof jobData.auditLogId === 'string';
    const auditLogId = resumeAudit ? String(jobData.auditLogId) : proposedAuditLogId;
    const startedAt = jobData.startedAt || now;
    const startedBy = jobData.startedBy || callerUid || null;
    const storedCollectionIndex = Number(jobData.cleanupCollectionIndex);
    const cleanupCollectionIndex = Number.isFinite(storedCollectionIndex)
      ? Math.max(0, Math.floor(storedCollectionIndex))
      : 0;

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
      phase: 'preparing',
      executionMode: 'client_steps',
      cleanupCollectionIndex,
      processedRecords,
      errorCode: null,
      updatedAt: now,
      startedAt,
      startedBy,
      leaseToken: claimToken,
      leaseExpiresAt: new Date(now.getTime() + GARAGE_DELETION_LEASE_MS)
    }, { merge: true });

    return { kind: 'claimed', garageName, claimToken, processedRecords };
  });
}

export async function markGarageDeletionFailed(
  adminDb: any,
  garageId: string,
  claimToken: string,
  errorCode = 'GARAGE_DELETION_FAILED'
): Promise<void> {
  const jobRef = adminDb.doc(`garage_deletion_jobs/${garageId}`);
  await adminDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.exists ? snapshot.data() || {} : {};
    if (!snapshot.exists || job.status !== 'running' || job.leaseToken !== claimToken) return;
    transaction.set(jobRef, {
      status: 'failed',
      phase: 'failed',
      errorCode,
      updatedAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null
    }, { merge: true });
  });
}
