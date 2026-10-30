import type { WorkerApp } from './cloudflareWorker';
import { adminDb, adminAuth } from './firebaseAdmin';

/**
 * Foundation routes: /api/health, /api/version.
 * Plus CF2 Runtime Compatibility Spike Endpoints (Pre-production only,
 * disabled in production via authorizeSpikeEndpoint).
 *
 * Extracted from cloudflareWorker.ts to keep that file focused on
 * middleware + route registration wiring.
 */

const SPIKE_DIAGNOSTIC_HEADER = 'x-rq-diagnostic-token';
const SPIKE_WRITE_MAX_BODY_BYTES = 2048;
const SPIKE_WRITE_MAX_PAYLOAD_LENGTH = 512;
const SPIKE_MIN_DIAGNOSTIC_TOKEN_LENGTH = 32;

function constantTimeStringEquals(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function authorizeSpikeEndpoint(c: any): Response | null {
  const environment = String(c.env?.ENVIRONMENT ?? '').trim().toLowerCase();
  if (environment === 'production') {
    return c.json({ success: false, error: 'SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION' }, 403);
  }

  const allowedEnvironments = String(c.env?.SPIKE_ENVIRONMENT_ALLOWLIST ?? '')
    .split(',')
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean);
  const expectedToken = String(c.env?.SPIKE_DIAGNOSTIC_TOKEN ?? '');
  if (!environment || !allowedEnvironments.includes(environment) || expectedToken.length < SPIKE_MIN_DIAGNOSTIC_TOKEN_LENGTH) {
    return c.json({ success: false, error: 'SPIKE_ENDPOINT_DISABLED' }, 403);
  }

  const suppliedToken = String(c.req.header(SPIKE_DIAGNOSTIC_HEADER) ?? '').trim();
  if (!suppliedToken) {
    return c.json({ success: false, error: 'DIAGNOSTIC_CREDENTIAL_REQUIRED' }, 401);
  }
  if (!constantTimeStringEquals(suppliedToken, expectedToken)) {
    return c.json({ success: false, error: 'DIAGNOSTIC_CREDENTIAL_INVALID' }, 403);
  }

  return null;
}

export function registerFoundationRoutes(workerApp: WorkerApp): void {
  // Foundation Routes
  workerApp.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      runtime: 'cloudflare-worker',
      timestamp: new Date().toISOString(),
      environment: c.env?.ENVIRONMENT || 'production',
      adminSdk: !!(adminDb && adminAuth),
      version: c.env?.WORKER_VERSION || process.env.WORKER_VERSION || '1.0.0',
      commitSha: c.env?.WORKER_COMMIT_SHA || process.env.WORKER_COMMIT_SHA || 'unknown'
    });
  });

  workerApp.get('/api/version', (c) => {
    return c.json({
      version: c.env?.WORKER_VERSION || process.env.WORKER_VERSION || '1.0.0',
      commitSha: c.env?.WORKER_COMMIT_SHA || process.env.WORKER_COMMIT_SHA || 'unknown',
      environment: c.env?.ENVIRONMENT || 'production',
      runtime: 'cloudflare-worker',
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  });

  // CF2 Runtime Compatibility Spike Endpoints (Pre-production only, disabled in production)
  workerApp.post('/api/test-auth-verify', async (c) => {
    const authorizationFailure = authorizeSpikeEndpoint(c);
    if (authorizationFailure) return authorizationFailure;

    const authHeader = c.req.header('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return c.json({ success: false, error: 'TOKEN_REQUIRED' }, 401);
    }

    if (!adminAuth) {
      return c.json({ success: false, error: 'ADMIN_AUTH_NOT_INITIALIZED' }, 503);
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      return c.json({
        success: true,
        uid: decoded.uid,
        email: decoded.email || null,
        role: decoded.role || null,
        runtime: 'cloudflare-worker',
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: 'AUTH_VERIFICATION_FAILED',
        message: err?.message || 'Token verification error'
      }, 401);
    }
  });

  workerApp.get('/api/test-firestore-read', async (c) => {
    const authorizationFailure = authorizeSpikeEndpoint(c);
    if (authorizationFailure) return authorizationFailure;

    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);
    }

    try {
      const docRef = adminDb.collection('_spike_tests').doc('synthetic_doc');
      const snap = await docRef.get();
      return c.json({
        success: true,
        exists: snap.exists,
        data: snap.exists ? snap.data() : null,
        databaseId: c.env?.FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || 'default',
        runtime: 'cloudflare-worker',
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: 'FIRESTORE_READ_FAILED',
        message: err?.message || 'Firestore read error'
      }, 500);
    }
  });

  workerApp.post('/api/test-firestore-write', async (c) => {
    const authorizationFailure = authorizeSpikeEndpoint(c);
    if (authorizationFailure) return authorizationFailure;

    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);
    }

    try {
      const contentLengthHeader = c.req.header('content-length');
      if (contentLengthHeader !== undefined) {
        const contentLength = Number(contentLengthHeader);
        if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
          return c.json({ success: false, error: 'INVALID_CONTENT_LENGTH' }, 400);
        }
        if (contentLength > SPIKE_WRITE_MAX_BODY_BYTES) {
          return c.json({ success: false, error: 'SPIKE_PAYLOAD_TOO_LARGE' }, 413);
        }
      }

      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return c.json({ success: false, error: 'INVALID_SPIKE_PAYLOAD' }, 400);
      }
      const serializedBody = JSON.stringify(body);
      if (new TextEncoder().encode(serializedBody).byteLength > SPIKE_WRITE_MAX_BODY_BYTES) {
        return c.json({ success: false, error: 'SPIKE_PAYLOAD_TOO_LARGE' }, 413);
      }
      const payload = (body as Record<string, unknown>).payload === undefined
        ? 'synthetic_spike_value'
        : (body as Record<string, unknown>).payload;
      if (typeof payload !== 'string' || payload.length > SPIKE_WRITE_MAX_PAYLOAD_LENGTH) {
        return c.json({ success: false, error: 'INVALID_SPIKE_PAYLOAD' }, 400);
      }

      const testDocId = `spike_${Date.now()}`;
      const testRef = adminDb.collection('_spike_tests').doc(testDocId);

      // Test both direct write and atomic transaction
      await adminDb.runTransaction(async (t: any) => {
        t.set(testRef, {
          synthetic: true,
          testPayload: payload,
          createdAt: new Date(),
          runtime: 'cloudflare-worker'
        });
      });

      return c.json({
        success: true,
        docId: testDocId,
        path: `_spike_tests/${testDocId}`,
        transactionSupported: true,
        runtime: 'cloudflare-worker',
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      return c.json({
        success: false,
        error: 'FIRESTORE_WRITE_FAILED',
        message: err?.message || 'Firestore write error'
      }, 500);
    }
  });
}
