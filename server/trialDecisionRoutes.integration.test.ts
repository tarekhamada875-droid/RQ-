import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from './middleware';

const harness = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('./firebaseAdmin', () => ({
  get adminDb() {
    return harness.db;
  },
  adminAuth: null,
  firebaseConfig: {}
}));

vi.mock('./middleware', () => ({
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    const authReq = req as AuthRequest;
    authReq.user = {
      uid: req.header('x-test-uid') || 'owner_uid',
      role: req.header('x-test-role') || 'garage',
      garageId: req.header('x-test-garage-id') || 'garage_1'
    };
    next();
  },
  financialRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next()
}));

vi.mock('./utils', () => ({
  saveEntityPin: vi.fn(),
  checkPinAvailabilityAcrossAll: vi.fn()
}));

vi.mock('./unlimitedFairUse', () => ({
  manualAdminExtendFairUse: vi.fn(),
  initializeFairUse: vi.fn()
}));

vi.mock('./projections', () => ({ calculateDailyProjection: vi.fn() }));
vi.mock('./dashboardSummary', () => ({
  aggregateProjectionBuckets: vi.fn(),
  isFreshDashboardSummary: vi.fn(),
  isValidDateKey: vi.fn(),
  reconcileDashboardSummary: vi.fn()
}));
vi.mock('./summaryTelemetry', () => ({ recordSummaryRead: vi.fn() }));

import garagesRouter from './routes/garages';

class TrialDecisionFirestore {
  readonly garages = new Map<string, Record<string, unknown>>();
  readonly activityLogs: Record<string, unknown>[] = [];
  private sequence = 0;

  collection(collectionName: string) {
    return {
      doc: (id?: string) => {
        const documentId = id || `generated_${++this.sequence}`;
        return {
          get: async () => {
            const record = collectionName === 'garages' ? this.garages.get(documentId) : undefined;
            return { exists: record !== undefined, data: () => record };
          },
          update: async (changes: Record<string, unknown>) => {
            const record = this.garages.get(documentId);
            if (!record) throw new Error('GARAGE_NOT_FOUND');
            this.garages.set(documentId, { ...record, ...changes });
          },
          set: async (value: Record<string, unknown>) => {
            if (collectionName === 'activity_logs') this.activityLogs.push(value);
          }
        };
      }
    };
  }

  reset() {
    this.garages.clear();
    this.activityLogs.length = 0;
    this.garages.set('garage_1', { name: 'Garage One', trialDecision: null });
    this.garages.set('garage_2', { name: 'Garage Two', trialDecision: null });
  }
}

const db = new TrialDecisionFirestore();
let server: Server;
let baseUrl: string;

async function post(body: Record<string, unknown>, options: { role?: string; garageId?: string } = {}) {
  const url = new URL('/api/garages/trial-decision', baseUrl);
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const payload = JSON.stringify(body);
    const request = httpRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'x-test-role': options.role || 'garage',
        'x-test-garage-id': options.garageId || 'garage_1'
      }
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode || 0, body: responseBody }));
    });
    request.on('error', rejectResponse);
    request.end(payload);
  });
  return { status: response.status, json: JSON.parse(response.body) as Record<string, unknown> };
}

beforeAll(async () => {
  harness.db = db;
  const app = express();
  app.use(express.json());
  app.use('/api/garages', garagesRouter);
  server = createServer(app);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
});

beforeEach(() => db.reset());

describe('garage trial decision route', () => {
  it('lets the matching garage owner record continuation and logs it', async () => {
    const response = await post({ garageId: 'garage_1', trialDecision: 'continued' });

    expect(response.status).toBe(200);
    expect(response.json).toEqual({ success: true });
    expect(db.garages.get('garage_1')?.trialDecision).toBe('continued');
    expect(db.activityLogs).toHaveLength(1);
    expect(db.activityLogs[0]?.actionType).toBe('update_trial_decision');
  });

  it('lets the matching garage owner record a decline', async () => {
    const response = await post({ garageId: 'garage_1', trialDecision: 'declined' });

    expect(response.status).toBe(200);
    expect(db.garages.get('garage_1')?.trialDecision).toBe('declined');
  });

  it('denies a garage owner attempting to change another garage', async () => {
    const response = await post({ garageId: 'garage_2', trialDecision: 'continued' });

    expect(response.status).toBe(403);
    expect(db.garages.get('garage_2')?.trialDecision).toBeNull();
    expect(db.activityLogs).toHaveLength(0);
  });

  it('denies staff and preserves admin authority to clear a decision', async () => {
    const staffResponse = await post({ garageId: 'garage_1', trialDecision: 'continued' }, { role: 'staff' });
    expect(staffResponse.status).toBe(403);

    const adminResponse = await post({ garageId: 'garage_1', trialDecision: null }, { role: 'admin' });
    expect(adminResponse.status).toBe(200);
    expect(db.garages.get('garage_1')?.trialDecision).toBeNull();
  });
});

export {};
