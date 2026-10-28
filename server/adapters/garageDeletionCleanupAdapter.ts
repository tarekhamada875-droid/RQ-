const GARAGE_DELETE_PAGE_SIZE = 200;
const GARAGE_DELETE_LEASE_MS = 5 * 60 * 1000;

const GARAGE_SUBCOLLECTIONS = [
  'vehicles',
  'subscribers',
  'daily_counts',
  'daily_stats',
  'events',
  'projection_buckets'
] as const;

function garageOwnedQueries(adminDb: any, garageId: string): any[] {
  return [
    ...GARAGE_SUBCOLLECTIONS.map((name) => adminDb.collection(`garages/${garageId}/${name}`)),
    adminDb.collection('activity_logs').where('garageId', '==', garageId),
    // Financial history is garage-owned data and must be removed atomically with the garage.
    adminDb.collection('credit_ledger').where('garageId', '==', garageId),
    adminDb.collection('recharge_requests').where('garageId', '==', garageId),
    adminDb.collection('payment_reference_markers').where('garageId', '==', garageId),
    adminDb.collection('staff').where('garageId', '==', garageId),
    adminDb.collection('garage_sessions').where('entityId', '==', garageId),
    adminDb.collection('private_pins').where('entityId', '==', garageId).where('entityType', '==', 'garages'),
    adminDb.collection('pin_reservations').where('entityId', '==', garageId).where('entityType', '==', 'garages')
  ];
}

export interface GarageDeletionStepResult {
  readonly status: 'running' | 'completed';
  readonly phase: 'deleting' | 'finalizing' | 'complete';
  readonly processedRecords: number;
  readonly deletedThisStep: number;
}

export interface GarageDeletionActor {
  readonly uid?: string;
  readonly role?: string;
  readonly displayName?: string;
}

/**
 * Processes at most one Firestore page per call. Each page's deletes and job
 * progress update commit in the same transaction, so a retry cannot double-count
 * or skip records. This avoids relying on a post-response Worker waitUntil task
 * for the full garage cleanup.
 */
export async function processGarageDeletionStep(
  adminDb: any,
  garageId: string,
  claimToken: string,
  actor: GarageDeletionActor
): Promise<GarageDeletionStepResult> {
  const jobRef = adminDb.doc(`garage_deletion_jobs/${garageId}`);
  const garageRef = adminDb.doc(`garages/${garageId}`);
  const queries = garageOwnedQueries(adminDb, garageId);
  const fallbackAuditLogId = adminDb.collection('activity_logs').doc().id;

  return adminDb.runTransaction(async (transaction: any): Promise<GarageDeletionStepResult> => {
    const jobSnapshot = await transaction.get(jobRef);
    const job = jobSnapshot.exists ? jobSnapshot.data() || {} : {};

    if (!jobSnapshot.exists) throw new Error('GARAGE_DELETION_IN_PROGRESS');
    if (job.status === 'completed') {
      return {
        status: 'completed',
        phase: 'complete',
        processedRecords: Math.max(0, Number(job.processedRecords) || 0),
        deletedThisStep: 0
      };
    }
    if (job.status !== 'running' || job.leaseToken !== claimToken) {
      throw new Error('GARAGE_DELETION_IN_PROGRESS');
    }

    const storedIndex = Number(job.cleanupCollectionIndex);
    let collectionIndex = Number.isFinite(storedIndex)
      ? Math.max(0, Math.min(queries.length, Math.floor(storedIndex)))
      : 0;
    const processedRecords = Number.isFinite(Number(job.processedRecords))
      ? Math.max(0, Number(job.processedRecords))
      : 0;
    const now = new Date();

    for (; collectionIndex < queries.length; collectionIndex += 1) {
      const page = await transaction.get(queries[collectionIndex].limit(GARAGE_DELETE_PAGE_SIZE));
      if (page.empty) continue;

      for (const document of page.docs) transaction.delete(document.ref);
      const nextProcessedRecords = processedRecords + page.docs.length;
      transaction.set(jobRef, {
        status: 'running',
        phase: 'deleting',
        cleanupCollectionIndex: collectionIndex,
        processedRecords: nextProcessedRecords,
        errorCode: null,
        updatedAt: now,
        leaseExpiresAt: new Date(now.getTime() + GARAGE_DELETE_LEASE_MS)
      }, { merge: true });
      return {
        status: 'running',
        phase: 'deleting',
        processedRecords: nextProcessedRecords,
        deletedThisStep: page.docs.length
      };
    }

    if (job.phase !== 'finalizing') {
      transaction.set(jobRef, {
        status: 'running',
        phase: 'finalizing',
        cleanupCollectionIndex: queries.length,
        updatedAt: now,
        leaseExpiresAt: new Date(now.getTime() + GARAGE_DELETE_LEASE_MS)
      }, { merge: true });
      return { status: 'running', phase: 'finalizing', processedRecords, deletedThisStep: 0 };
    }

    // Payment reference markers are keyed per-garage (garageId:paymentReference).
    // Query all markers for this garage and delete them in the finalizing step.
    const referralAwardRef = adminDb.doc(`credit_referral_awards/${garageId}`);
    const garageSnapshot = await transaction.get(garageRef);
    const paymentMarkersQuery = adminDb.collection('payment_reference_markers').where('garageId', '==', garageId).limit(GARAGE_DELETE_PAGE_SIZE);
    const paymentMarkersSnap = await transaction.get(paymentMarkersQuery);
    const referralAwardSnapshot = await transaction.get(referralAwardRef);
    const garageData = garageSnapshot.exists ? garageSnapshot.data() || {} : {};
    if (garageSnapshot.exists && garageData.isDeleting !== true) {
      throw new Error('GARAGE_DELETION_TARGET_CHANGED');
    }

    const garageName = typeof job.garageName === 'string' && job.garageName
      ? job.garageName
      : garageId;
    const auditLogId = typeof job.auditLogId === 'string' && job.auditLogId
      ? job.auditLogId
      : fallbackAuditLogId;

    transaction.set(adminDb.doc(`activity_logs/${auditLogId}`), {
      garageId,
      garageName,
      staffId: actor.uid || null,
      staffName: actor.displayName || 'الإدارة',
      actionType: 'garage_delete',
      plateNumber: `حذف جراج: ${garageName}`,
      timestamp: now,
      amount: 0,
      details: {
        deletedByRole: actor.role || 'admin',
        deletedByUid: actor.uid || null
      }
    });
    for (const markerDoc of paymentMarkersSnap.docs) transaction.delete(markerDoc.ref);
    if (referralAwardSnapshot.exists) transaction.delete(referralAwardRef);
    transaction.delete(garageRef);
    transaction.set(jobRef, {
      garageId,
      auditLogId,
      status: 'completed',
      phase: 'complete',
      processedRecords,
      errorCode: null,
      updatedAt: now,
      completedAt: now,
      completedBy: actor.uid || null,
      leaseToken: null,
      leaseExpiresAt: null
    }, { merge: true });

    return { status: 'completed', phase: 'complete', processedRecords, deletedThisStep: 0 };
  });
}
