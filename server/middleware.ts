import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { adminAuth, adminDb } from './firebaseAdmin';
import { validateIdempotencyKey } from './validation';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    role: string;
    garageId?: string;
    entityId?: string;
    sessionId?: string;
    displayName?: string;
  };
  correlationId?: string;
  idempotencyKey?: string;
}

/**
 * Standardized error sender helper that provides both top-level string 'error'
 * for client backward-compatibility, and standard envelope fields (code, statusCode, timestamp, correlationId).
 */
export function sendApiError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  correlationId?: string,
  details?: Record<string, any>
) {
  const payload: Record<string, any> = {
    success: false,
    error: message,
    code,
    statusCode,
    timestamp: new Date().toISOString(),
  };
  if (correlationId) {
    payload.correlationId = correlationId;
  }
  if (details) {
    payload.details = details;
  }
  return res.status(statusCode).json(payload);
}

/**
 * Correlation ID Middleware: assigns a unique trace ID to every incoming request
 */
export const correlationMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const headerId = req.headers['x-correlation-id'];
  const correlationId = typeof headerId === 'string' && headerId.trim() ? headerId.trim() : crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
};

/**
 * Timeout Middleware: prevents hanging connections (15s limit)
 */
export const requestTimeoutMiddleware = (timeoutMs = 15000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        const correlationId = (req as AuthRequest).correlationId;
        sendApiError(res, 504, 'REQUEST_TIMEOUT', 'REQUEST_TIMEOUT: Operation timed out on server', correlationId);
      }
    });
    next();
  };
};

/**
 * Idempotency Key Validation Middleware (Phase 1)
 * Extracts and validates the idempotency key from headers or request body.
 * If required = true and key is missing or invalid, immediately returns 400.
 */
export const idempotencyMiddleware = (required = false) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const rawKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey;
    if (!rawKey) {
      if (required) {
        return sendApiError(
          res,
          400,
          'INVALID_IDEMPOTENCY_KEY',
          'IDEMPOTENCY_KEY_REQUIRED: An idempotency key is required for this operation',
          req.correlationId
        );
      }
      return next();
    }

    try {
      const validated = validateIdempotencyKey(rawKey);
      req.idempotencyKey = validated || undefined;
      next();
    } catch (err: any) {
      return sendApiError(
        res,
        400,
        err?.code || 'INVALID_IDEMPOTENCY_KEY',
        err?.message || 'Invalid idempotency key',
        req.correlationId
      );
    }
  };
};

/**
 * Rate limiter for financial & critical endpoints (Firestore-backed with in-memory fallback)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const financialRateLimiter = (maxRequests = 30, windowMs = 60000) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const key = req.user?.uid || req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const now = Date.now();

    if (!adminDb) {
      const entry = rateLimitMap.get(key);
      if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (entry.count >= maxRequests) {
        return sendApiError(
          res,
          429,
          'RATE_LIMIT_EXCEEDED',
          'TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.',
          req.correlationId
        );
      }
      entry.count += 1;
      return next();
    }

    const docId = crypto.createHash('sha256').update(`fin:${key}`).digest('hex');
    const ref = adminDb.doc(`rate_limits/${docId}`);

    try {
      const allowed = await adminDb.runTransaction(async (t: any) => {
        const snap = await t.get(ref);
        const data = snap.exists ? snap.data() || {} : null;

        if (!data || now > data.resetAt) {
          t.set(ref, { count: 1, resetAt: now + windowMs, expiresAt: new Date(now + windowMs) });
          return true;
        }
        if (data.count >= maxRequests) {
          return false;
        }
        t.update(ref, { count: data.count + 1 });
        return true;
      });

      if (!allowed) {
        return sendApiError(
          res,
          429,
          'RATE_LIMIT_EXCEEDED',
          'TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.',
          req.correlationId
        );
      }
      next();
    } catch (e) {
      console.warn('[Financial Rate Limiter] Database transaction fallback to memory:', e);
      const entry = rateLimitMap.get(key);
      if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (entry.count >= maxRequests) {
        return sendApiError(
          res,
          429,
          'RATE_LIMIT_EXCEEDED',
          'TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.',
          req.correlationId
        );
      }
      entry.count += 1;
      next();
    }
  };
};

/**
 * Verifies Firebase Auth ID token for authentication routes (e.g. verify-pin, check-pin-availability).
 * Does not require an existing session document in Firestore, but verifies the caller has a valid Firebase Auth user.
 */
export async function requireFirebaseUser(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';

  if (!token) {
    return sendApiError(
      res,
      401,
      'UNAUTHORIZED',
      'UNAUTHORIZED: Missing Firebase ID Token',
      req.correlationId
    );
  }

  if (!adminAuth) {
    return sendApiError(
      res,
      503,
      'SERVICE_UNAVAILABLE',
      'ADMIN_SDK_NOT_INITIALIZED',
      req.correlationId
    );
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = { uid: decoded.uid, role: 'anonymous' };
    next();
  } catch (err) {
    return sendApiError(
      res,
      401,
      'UNAUTHORIZED',
      'UNAUTHORIZED: Invalid token',
      req.correlationId
    );
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split('Bearer ')[1]?.trim();
    }

    if (!token) {
      return sendApiError(
        res,
        401,
        'UNAUTHORIZED',
        'UNAUTHORIZED: Missing Firebase ID Token',
        req.correlationId
      );
    }

    if (!adminAuth || !adminDb) {
      return sendApiError(
        res,
        500,
        'INTERNAL_ERROR',
        'ADMIN_SDK_NOT_INITIALIZED',
        req.correlationId
      );
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // Determine Role based on Active Session
    let foundRole = '';
    let assignedGarageId = '';
    let foundEntityId = '';
    let foundSessionId = '';
    let foundDisplayName = '';

    const secCollMap = [
      { role: 'admin', coll: 'admin_sessions' },
      { role: 'supervisor', coll: 'supervisor_sessions' },
      { role: 'delegate', coll: 'delegate_sessions' },
      { role: 'garage', coll: 'garage_sessions' },
      { role: 'staff', coll: 'staff_sessions' }
    ];

    const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

    for (const { role, coll } of secCollMap) {
      const secSnap = await adminDb.doc(`${coll}/${uid}`).get();
      if (secSnap.exists) {
        const secData = secSnap.data() || {};
        if (secData.isActive) {
          // Check session freshness (15-minute inactivity timeout)
          const rawLastActive = secData.lastActive;
          const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
          if (lastActive > 0 && (Date.now() - lastActive > SESSION_TIMEOUT_MS)) {
            return sendApiError(
              res,
              401,
              'SESSION_EXPIRED',
              'SESSION_EXPIRED: Inactivity timeout',
              req.correlationId
            );
          }

          foundRole = role;
          foundEntityId = secData.entityId || '';
          foundSessionId = secData.sessionId || '';
          foundDisplayName = secData.displayName || '';

          if (role === 'garage') {
            assignedGarageId = secData.garageId || secData.entityId || '';
          } else if (role === 'staff') {
            assignedGarageId = secData.garageId || '';
            if (!assignedGarageId && secData.entityId) {
              const staffSnap = await adminDb.doc(`staff/${secData.entityId}`).get();
              if (staffSnap.exists) {
                const staffDocData = staffSnap.data() || {};
                assignedGarageId = staffDocData.garageId || '';
                if (!foundDisplayName && staffDocData.name) {
                  foundDisplayName = staffDocData.name;
                }
              }
            }
          }
          break; // Found active session
        }
      }
    }

    if (!foundRole) {
      return sendApiError(
        res,
        401,
        'SESSION_REVOKED',
        'SESSION_REVOKED: No active session found',
        req.correlationId
      );
    }

    req.user = {
      uid,
      role: foundRole,
      garageId: assignedGarageId,
      entityId: foundEntityId,
      sessionId: foundSessionId,
      displayName: foundDisplayName
    };
    next();
  } catch (e: any) {
    console.warn('[Server Auth] Middleware validation failed:', e);
    return sendApiError(
      res,
      401,
      'UNAUTHORIZED',
      'UNAUTHORIZED: Invalid token or session',
      req.correlationId
    );
  }
};
