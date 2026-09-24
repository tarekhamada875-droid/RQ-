import { Router } from 'express';
import { requireAuth, AuthRequest, sendApiError } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { validateId } from '../validation';
import { calculateFinancialReport } from '../financialReporting';
import { canViewFinancialReport } from '../domain/authorization';

const router = Router();

function parseBoundary(value: unknown, field: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
    const error: any = new Error(`INVALID_${field.toUpperCase()}`);
    error.statusCode = 400;
    error.code = `INVALID_${field.toUpperCase()}`;
    throw error;
  }
  return value;
}

router.get('/financial', requireAuth, async (req: AuthRequest, res: any) => {
  if (!canViewFinancialReport(req.user)) {
    return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
  }
  try {
    if (!adminDb) return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    const start = parseBoundary(req.query.start, 'start');
    const end = parseBoundary(req.query.end, 'end');
    const delegateId = req.query.delegateId ? validateId(req.query.delegateId, 'delegateId', true) : undefined;
    if (start && end && new Date(start) >= new Date(end)) {
      return sendApiError(res, 400, 'INVALID_RANGE', 'START_MUST_PRECEDE_END', req.correlationId);
    }

    const [eventsSnap, settlementsSnap] = await Promise.all([
      adminDb.collectionGroup('events').get(),
      adminDb.collection('settlements').get()
    ]);
    const events = eventsSnap.docs.map((doc: any) => doc.data() || {});
    const settlements = settlementsSnap.docs.map((doc: any) => doc.data() || {});
    const report = calculateFinancialReport(events, settlements, { start, end, delegateId });

    return res.json({
      success: true,
      data: {
        report,
        filters: { start: start || null, end: end || null, delegateId: delegateId || null },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Server Reports] Error generating financial report:', error);
    const status = error?.statusCode || 500;
    const code = error?.code || 'INTERNAL_ERROR';
    return sendApiError(res, status, code, error?.message || 'REPORT_GENERATION_FAILED', req.correlationId);
  }
});

export default router;
