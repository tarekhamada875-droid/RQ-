import { adminDb } from './firebaseAdmin';
import { claimGarageDeletion, markGarageDeletionFailed } from './adapters/garageDeletionAdapter';
import { processGarageDeletionStep } from './adapters/garageDeletionCleanupAdapter';
import { mapDomainErrorToStatus } from './routes/helpers';
import { validateId } from './validation';

function deletionRateLimitScope(context: any, user: any): { actorKey: string; collection: string } {
  const environment = String(context.env?.ENVIRONMENT || 'production').trim() || 'production';
  const actor = user?.uid || context.req.header('cf-connecting-ip') || context.req.header('x-forwarded-for') || 'unknown';
  return {
    actorKey: environment === 'production' ? String(actor) : `${environment}:${actor}`,
    collection: environment === 'production' ? 'rate_limits' : `rate_limits_${environment}_v2`
  };
}

export async function startGarageDeletionRoute(context: any) {
  try {
    const user = context.get('user');
    if (user?.role !== 'admin') {
      return context.json({ success: false, code: 'FORBIDDEN', error: 'FORBIDDEN: Admin role required', statusCode: 403 }, 403);
    }
    const body = await context.req.json().catch(() => ({}));
    const garageId = validateId(body?.garageId, 'garageId', true);
    if (!adminDb) {
      return context.json({ success: false, code: 'ADMIN_SDK_NOT_INITIALIZED', error: 'ADMIN_SDK_NOT_INITIALIZED', statusCode: 500 }, 500);
    }

    const claim = await claimGarageDeletion(
      adminDb,
      garageId,
      user?.role,
      user?.uid,
      deletionRateLimitScope(context, user)
    );
    if (claim.kind === 'forbidden') {
      return context.json({ success: false, code: 'FORBIDDEN', error: 'FORBIDDEN: Admin role required', statusCode: 403 }, 403);
    }
    if (claim.kind === 'not_found') {
      return context.json({ success: false, code: 'GARAGE_NOT_FOUND', error: 'GARAGE_NOT_FOUND', statusCode: 404 }, 404);
    }
    if (claim.kind === 'already_deleted') {
      return context.json({ success: true, alreadyDeleted: true });
    }
    if (claim.kind === 'in_progress') {
      return context.json({
        success: false,
        code: 'GARAGE_DELETION_STILL_RUNNING',
        error: 'GARAGE_DELETION_STILL_RUNNING',
        statusCode: 409
      }, 409);
    }
    if (claim.kind === 'rate_limited') {
      context.header('Retry-After', String(claim.retryAfterSeconds));
      return context.json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        retryAfterSeconds: claim.retryAfterSeconds
      }, 429);
    }

    return context.json({
      success: true,
      garageId,
      status: 'running',
      phase: 'preparing',
      processedRecords: claim.processedRecords,
      jobToken: claim.claimToken
    }, 202);
  } catch (error: any) {
    console.error('[Worker GarageDeletion] Start failed:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return context.json({ success: false, code, error: message, statusCode }, statusCode as any);
  }
}

export async function advanceGarageDeletionRoute(context: any) {
  const user = context.get('user');
  if (user?.role !== 'admin') {
    return context.json({ success: false, code: 'FORBIDDEN', error: 'FORBIDDEN: Admin role required', statusCode: 403 }, 403);
  }
  if (!adminDb) {
    return context.json({ success: false, code: 'ADMIN_SDK_NOT_INITIALIZED', error: 'ADMIN_SDK_NOT_INITIALIZED', statusCode: 500 }, 500);
  }

  const body = await context.req.json().catch(() => ({}));
  let garageId = '';
  try {
    garageId = validateId(body?.garageId, 'garageId', true);
  } catch (error: any) {
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return context.json({ success: false, code, error: message, statusCode }, statusCode as any);
  }
  const jobToken = typeof body?.jobToken === 'string' ? body.jobToken : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobToken)) {
    return context.json({ success: false, code: 'INVALID_DELETION_JOB_TOKEN', error: 'INVALID_DELETION_JOB_TOKEN', statusCode: 400 }, 400);
  }

  try {
    const step = await processGarageDeletionStep(adminDb, garageId, jobToken, {
      uid: user?.uid,
      role: user?.role,
      displayName: user?.displayName
    });
    return context.json({ success: true, garageId, ...step });
  } catch (error: any) {
    if (error?.message === 'GARAGE_DELETION_IN_PROGRESS') {
      return context.json({ success: false, code: 'GARAGE_DELETION_STILL_RUNNING', error: 'GARAGE_DELETION_STILL_RUNNING', statusCode: 409 }, 409);
    }

    const message = typeof error?.message === 'string' ? error.message : '';
    const errorCode = message.startsWith('FIRESTORE_QUERY_FAILED:')
      ? 'GARAGE_DELETION_QUERY_FAILED'
      : message.startsWith('FIRESTORE_WRITE_FAILED:')
        ? 'GARAGE_DELETION_WRITE_FAILED'
        : message.startsWith('FIRESTORE_TRANSACTION_')
          ? 'GARAGE_DELETION_TRANSACTION_FAILED'
          : message === 'GARAGE_DELETION_TARGET_CHANGED'
            ? 'GARAGE_DELETION_TARGET_CHANGED'
            : 'GARAGE_DELETION_FAILED';
    console.error('[Worker GarageDeletion] Step failed:', errorCode, error);
    await markGarageDeletionFailed(adminDb, garageId, jobToken, errorCode).catch((markError) => {
      console.error('[Worker GarageDeletion] Failed to persist failure state:', markError);
    });
    const statusCode = errorCode === 'GARAGE_DELETION_TARGET_CHANGED' ? 409 : 500;
    return context.json({ success: false, code: errorCode, error: errorCode, statusCode }, statusCode as any);
  }
}

export async function readGarageDeletionStatusRoute(context: any) {
  try {
    const user = context.get('user');
    if (user?.role !== 'admin') {
      return context.json({ success: false, code: 'FORBIDDEN', error: 'FORBIDDEN: Admin role required', statusCode: 403 }, 403);
    }
    if (!adminDb) {
      return context.json({ success: false, code: 'ADMIN_SDK_NOT_INITIALIZED', error: 'ADMIN_SDK_NOT_INITIALIZED', statusCode: 500 }, 500);
    }
    const garageId = validateId(context.req.query('garageId'), 'garageId', true);
    const snapshot = await adminDb.doc(`garage_deletion_jobs/${garageId}`).get();
    if (!snapshot.exists) {
      return context.json({ success: false, code: 'DELETION_JOB_NOT_FOUND', error: 'DELETION_JOB_NOT_FOUND', statusCode: 404 }, 404);
    }

    const job = snapshot.data() || {};
    const expiresValue = job.leaseExpiresAt?.toDate?.() ?? job.leaseExpiresAt;
    const expiresAtMs = expiresValue instanceof Date
      ? expiresValue.getTime()
      : (expiresValue ? new Date(expiresValue).getTime() : NaN);
    const isStale = job.status === 'running' && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
    const status = isStale ? 'stale' : (typeof job.status === 'string' ? job.status : 'unknown');
    return context.json({
      success: true,
      garageId,
      status,
      phase: isStale ? 'failed' : (job.phase || status),
      processedRecords: Number.isFinite(Number(job.processedRecords)) ? Math.max(0, Number(job.processedRecords)) : 0,
      errorCode: typeof job.errorCode === 'string' ? job.errorCode : null,
      retryable: status === 'failed' || status === 'stale'
    });
  } catch (error: any) {
    console.error('[Worker GarageDeletion] Status read failed:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return context.json({ success: false, code, error: message, statusCode }, statusCode as any);
  }
}
