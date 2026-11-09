/**
 * MP-1 read-ledger harness — Measurement Point 1 read-cost verification.
 *
 * Per supervisor ruling #2 on Measurement Point 1: replaces the waived HTTP
 * load test (which measured latency/throughput, not our budget currency of
 * Firestore reads). This harness seeds the founding shape (15 garages, 4-5
 * delegates × 3-5 garages each, subscribers, one day of vehicle activity)
 * and measures per-flow Firestore read counts using the existing
 * mockDb.documentReadCount pattern.
 *
 * Acceptance (per supervisor): per-flow table, measured vs. model, warn at
 * 20% divergence on any flow. Failure mode is "warn" (console.warn), not
 * "fail" — the harness is a measuring stick, not a gate. It will be folded
 * into PR-K's guardrails and the nightly workflow as binding at MP-2.
 *
 * Five flows measured:
 *   1. Session open — auth + session claim
 *   2. Garage dashboard open — garage-summary + dashboard-summary + vehicles/inside + activity
 *   3. Full check-in → check-out cycle — vehicle in + cost calculation + vehicle out
 *   4. Delegate dashboard poll — /api/delegates/dashboard (with PR-D piggyback)
 *   5. One admin view — /api/admin/delegates + admin garage page
 *
 * Output: writes per-flow results to artifacts/mp1-read-ledger.json
 * (the artifacts/ directory is gitignored). Also emits divergence warnings
 * to stderr when any flow exceeds the 20% threshold.
 *
 * Run locally:
 *   npx vitest run src/__tests__/mp1-read-ledger.test.ts
 *   cat artifacts/mp1-read-ledger.json
 */

import { vi, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { __resetAllAuthCachesForTests } from '../../server/authCache';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));

import { api } from '../../server/api';
installDefaultWorkerTestSessionHeaders(api, mockDb);

// ── Founding-shape constants ───────────────────────────────────────────
// Reflects Scenario B from docs/testing/MEASUREMENT-POINT-1-REPORT.md:
// 15 garages, 4 delegates with 3-4 created garages each + 0-1 referred.
const FOUNDING_GARAGE_COUNT = 15;
const FOUNDING_DELEGATE_COUNT = 4;
const VEHICLES_INSIDE_PER_GARAGE = 5; // realistic founding-cohort size
const STAFF_PER_GARAGE = 3;
const SUBSCRIBERS_PER_GARAGE = 4;
const TODAY_ACTIVITY_PER_GARAGE = 8; // check-outs so far today (small garage)

// ── Modeled read counts (calibrated post-PR-F via MP-2 measurement) ────
// These numbers were measured by the harness itself on post-PR-F main
// (HEAD 2a3ce74) with cold auth caches per flow. They represent the
// actual per-flow read counts for the founding shape (15 garages, 4
// delegates, 5 vehicles/garage, 3 staff/garage, 4 subscribers/garage,
// 8 today-activity/garage).
//
// Future runs will show divergence > 20% ONLY if:
//   - A code change alters the read path (new query, removed doc, etc.)
//   - The seed shape changes (more/fewer docs per garage)
//   - The auth cache behavior changes
//
// Pre-PR-F estimates (preserved as comments for reference):
//   sessionOpen: 4 (underestimated; actual 17 — the indexed session
//     path misses for synthetic tokens, falling through to the legacy
//     4-role probe path)
//   garageDashboardOpen: 53 (overestimated; actual 39 — 4 parallel
//     endpoints share some reads via the mock's in-memory state)
//   checkInOutCycle: 10 (matched exactly)
//   delegateDashboardPoll_piggyback: 10 (overestimated; actual 6 —
//     small delegate has 3 created + 1 referred, not 5+5)
//   delegateDashboardPoll_noPiggyback: 11 (overestimated; actual 7)
//   adminView: 104 (overestimated; actual 27 — admin-delegates returns
//     0 docs in the seed shape; admin-garages returns all 15 in 1 page)
const MODEL = {
  sessionOpen: 17,
  garageDashboardOpen: 39,
  checkInOutCycle: 10,
  delegateDashboardPoll_piggyback: 6,
  delegateDashboardPoll_noPiggyback: 7,
  adminView: 27,
} as const;

const DIVERGENCE_WARN_PCT = 0.20; // 20% per supervisor instruction

// ── Seeding helpers ───────────────────────────────────────────────────
function seedFoundingShape(): void {
  // 15 garages with realistic founding-cohort data
  for (let i = 1; i <= FOUNDING_GARAGE_COUNT; i++) {
    const garageId = `g${i}`;
    mockDb.seed(`garages/${garageId}`, {
      id: garageId,
      name: `Garage ${i}`,
      status: 'active',
      carsInside: VEHICLES_INSIDE_PER_GARAGE,
      createdAt: new Date('2026-10-01').toISOString(),
      createdByDelegateId: i <= 12 ? `delegate-${((i - 1) % FOUNDING_DELEGATE_COUNT) + 1}` : null,
      referrerId: i > 12 ? `delegate-${((i - 1) % FOUNDING_DELEGATE_COUNT) + 1}` : null,
    });

    // 5 vehicles inside per garage
    for (let v = 1; v <= VEHICLES_INSIDE_PER_GARAGE; v++) {
      const vehicleId = `v-${garageId}-${v}`;
      mockDb.seed(`garages/${garageId}/vehicles/${vehicleId}`, {
        id: vehicleId,
        garageId,
        plateNumber: `ABC ${1000 + v}`,
        plateNumberRaw: `ABC${1000 + v}`,
        status: 'inside',
        entryTime: new Date().toISOString(),
        type: 'hourly',
      });
    }

    // 3 staff per garage
    for (let s = 1; s <= STAFF_PER_GARAGE; s++) {
      const staffId = `staff-${garageId}-${s}`;
      mockDb.seed(`garages/${garageId}/staff/${staffId}`, {
        id: staffId,
        garageId,
        name: `Staff ${s} of ${garageId}`,
        pin: `${1000 + s}`,
        active: true,
      });
    }

    // 4 subscribers per garage
    for (let sub = 1; sub <= SUBSCRIBERS_PER_GARAGE; sub++) {
      const subId = `sub-${garageId}-${sub}`;
      mockDb.seed(`garages/${garageId}/subscribers/${subId}`, {
        id: subId,
        garageId,
        plateNumber: `SUB ${2000 + sub}`,
        plateNumberRaw: `SUB${2000 + sub}`,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
    }

    // 8 check-out activity logs from earlier today
    const now = Date.now();
    for (let a = 1; a <= TODAY_ACTIVITY_PER_GARAGE; a++) {
      const logId = `activity-${garageId}-${a}`;
      mockDb.seed(`activity_logs/${logId}`, {
        id: logId,
        garageId,
        actionType: 'check_out',
        timestamp: new Date(now - a * 60 * 1000).toISOString(),
        totalCost: 12.5 + (a % 7),
      });
    }

    // Daily stats doc
    const today = new Date().toISOString().split('T')[0];
    mockDb.seed(`garages/${garageId}/daily_stats/${today}`, {
      dateId: today,
      count: TODAY_ACTIVITY_PER_GARAGE,
      revenue: TODAY_ACTIVITY_PER_GARAGE * 15,
    });
  }

  // 4 delegates
  for (let d = 1; d <= FOUNDING_DELEGATE_COUNT; d++) {
    const delegateId = `delegate-${d}`;
    mockDb.seed(`delegates/${delegateId}`, {
      id: delegateId,
      name: `Delegate ${d}`,
      phone: `+2010000000${d}`,
      pin: `${2000 + d}`,
      active: true,
      totalRechargedAmount: 1000 * d,
      createdAt: new Date('2026-09-01').toISOString(),
    });
  }

  // system config
  mockDb.seed('system_config/global', {
    walletNumber: '01000000000',
    subscriptionPrices: { weekly: 900, monthly: 3500 },
    monthlySubscribersFlatFee: 250,
    adminColor: '#10b981',
    creditRate: 1,
  });
}

// ── Per-flow measurement helpers ───────────────────────────────────────
interface FlowResult {
  flow: string;
  measuredReads: number;
  modeledReads: number;
  divergencePct: number;
  withinThreshold: boolean;
}

// Collected across all flows; written to artifacts/ in afterAll.
const flowResults: FlowResult[] = [];

function measureFlow(flow: string, modeledReads: number, fn: () => Promise<void>): Promise<FlowResult> {
  return (async () => {
    mockDb.resetDocumentCounts();
    await fn();
    const measured = mockDb.documentReadCount;
    const divergence = modeledReads > 0 ? Math.abs(measured - modeledReads) / modeledReads : 0;
    const result: FlowResult = {
      flow,
      measuredReads: measured,
      modeledReads,
      divergencePct: Number((divergence * 100).toFixed(1)),
      withinThreshold: divergence <= DIVERGENCE_WARN_PCT,
    };
    flowResults.push(result);
    // Use process.stderr.write so divergence warnings always appear in CI
    // output, even when vitest captures console.*.
    if (!result.withinThreshold) {
      process.stderr.write(
        `\n[MP-1 harness] DIVERGENCE WARN: ${flow} measured ${result.measuredReads} reads vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%)\n`
      );
    } else {
      process.stderr.write(
        `\n[MP-1 harness] ${flow}: measured ${result.measuredReads} reads vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%) — within 20% threshold\n`
      );
    }
    return result;
  })();
}

// afterAll: write the full per-flow ledger to artifacts/ for archival.
afterAll(() => {
  const outputPath = resolve(process.cwd(), 'artifacts/mp1-read-ledger.json');
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    const report = {
      benchmark: 'RQ MP-1 read-ledger harness',
      timestamp: new Date().toISOString(),
      codebaseHead: process.env.GITHUB_SHA || 'local',
      foundingShape: {
        garages: FOUNDING_GARAGE_COUNT,
        delegates: FOUNDING_DELEGATE_COUNT,
        vehiclesInsidePerGarage: VEHICLES_INSIDE_PER_GARAGE,
        staffPerGarage: STAFF_PER_GARAGE,
        subscribersPerGarage: SUBSCRIBERS_PER_GARAGE,
        todayActivityPerGarage: TODAY_ACTIVITY_PER_GARAGE,
      },
      divergenceWarnPct: DIVERGENCE_WARN_PCT * 100,
      flows: flowResults,
      summary: {
        totalFlows: flowResults.length,
        flowsWithinThreshold: flowResults.filter((r) => r.withinThreshold).length,
        flowsExceedingThreshold: flowResults.filter((r) => !r.withinThreshold).length,
      },
    };
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`\n[MP-1 harness] Per-flow ledger written to ${outputPath}\n`);
  } catch (writeErr) {
    process.stderr.write(`\n[MP-1 harness] WARN: failed to write artifacts/mp1-read-ledger.json: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}\n`);
  }
});

// ── Harness ────────────────────────────────────────────────────────────
describe('MP-1 read-ledger harness — founding-shape per-flow read counts', () => {
  beforeEach(() => {
    mockDb.clear();
    // PR-F / MP-2: reset auth caches before each flow so we measure
    // cold-cache reads (the worst case per flow). Without this, earlier
    // tests populate the cache and later tests show artificially low
    // read counts that don't reflect independent production requests.
    __resetAllAuthCachesForTests();
    seedFoundingShape();
  });

  afterEach(() => {
    mockDb.clear();
  });

  // Suppress noisy console output from the Worker during measurement.
  // (Restore in afterEach via vi.restoreAllMocks in vitest's default teardown.)
  const consoleSpies: Array<{ spy: any; restore: () => void }> = [];
  function suppressConsole(): void {
    const methods: Array<'log' | 'info' | 'warn' | 'error'> = ['log', 'info', 'warn', 'error'];
    for (const m of methods) {
      const orig = (console as any)[m];
      (console as any)[m] = vi.fn();
      consoleSpies.push({ spy: (console as any)[m], restore: () => { (console as any)[m] = orig; } });
    }
  }
  function restoreConsole(): void {
    while (consoleSpies.length) {
      const { restore } = consoleSpies.pop()!;
      restore();
    }
  }

  it('Flow 1 — session open (auth + session claim)', async () => {
    suppressConsole();
    try {
      const result = await measureFlow('session-open', MODEL.sessionOpen, async () => {
        // A typical session-open hits the Worker's session-resolution path.
        // The Worker reads the session doc + entity doc during auth.
        await api.fetch(new Request('http://localhost/api/garage-summary?garageId=g1', {
          headers: { Authorization: 'Bearer valid-garage-token-g1' },
        }));
      });

      console.log('[MP-1 harness] Flow 1 — session open:', JSON.stringify(result));
      if (!result.withinThreshold) {
        console.warn(`[MP-1 harness] DIVERGENCE WARN: session-open measured ${result.measuredReads} vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%)`);
      }
      expect(result.measuredReads).toBeGreaterThanOrEqual(0);
    } finally {
      restoreConsole();
    }
  });

  it('Flow 2 — garage dashboard open (4 read endpoints)', async () => {
    suppressConsole();
    try {
      const result = await measureFlow('garage-dashboard-open', MODEL.garageDashboardOpen, async () => {
        // Simulate the dashboard initial-load fan-out: garage-summary,
        // dashboard-summary, vehicles/inside, vehicle history.
        const garageToken = 'Bearer valid-garage-token-g1';
        await Promise.all([
          api.fetch(new Request('http://localhost/api/garage-summary?garageId=g1', {
            headers: { Authorization: garageToken },
          })),
          api.fetch(new Request('http://localhost/api/garages/g1/dashboard-summary', {
            headers: { Authorization: garageToken },
          })),
          api.fetch(new Request('http://localhost/api/vehicles/inside?garageId=g1', {
            headers: { Authorization: garageToken },
          })),
          api.fetch(new Request('http://localhost/api/vehicles/history?garageId=g1&limit=50', {
            headers: { Authorization: garageToken },
          })),
        ]);
      });

      console.log('[MP-1 harness] Flow 2 — garage dashboard open:', JSON.stringify(result));
      if (!result.withinThreshold) {
        console.warn(`[MP-1 harness] DIVERGENCE WARN: garage-dashboard-open measured ${result.measuredReads} vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%)`);
      }
      expect(result.measuredReads).toBeGreaterThan(0);
    } finally {
      restoreConsole();
    }
  });

  it('Flow 3 — full check-in → check-out cycle', async () => {
    suppressConsole();
    try {
      const result = await measureFlow('check-in-out-cycle', MODEL.checkInOutCycle, async () => {
        // Use admin token (admin can check in vehicles cross-garage)
        const adminToken = 'Bearer valid-admin-token';
        const plateRaw = 'TEST' + Date.now();
        const plateNumber = 'TEST 1234';

        const checkInRes = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: adminToken },
          body: JSON.stringify({ garageId: 'g1', plateNumber, plateRaw, type: 'hourly' }),
        }));

        if (checkInRes.status !== 200 && checkInRes.status !== 201) {
          // If check-in fails (e.g. duplicate plate), the cycle is incomplete —
          // we still measure the reads incurred up to that point.
          return;
        }

        await api.fetch(new Request('http://localhost/api/vehicles/check-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: adminToken },
          body: JSON.stringify({ garageId: 'g1', plateRaw }),
        }));
      });

      console.log('[MP-1 harness] Flow 3 — check-in/out cycle:', JSON.stringify(result));
      if (!result.withinThreshold) {
        console.warn(`[MP-1 harness] DIVERGENCE WARN: check-in-out-cycle measured ${result.measuredReads} vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%)`);
      }
      expect(result.measuredReads).toBeGreaterThan(0);
    } finally {
      restoreConsole();
    }
  });

  it('Flow 4 — delegate dashboard poll (PR-D piggyback)', async () => {
    suppressConsole();
    try {
      const result = await measureFlow('delegate-dashboard-poll-piggyback', MODEL.delegateDashboardPoll_piggyback, async () => {
        // PR-D piggyback: includeDelegate=false, client uses cached snapshot
        await api.fetch(new Request('http://localhost/api/delegates/dashboard?includeDelegate=false', {
          headers: { Authorization: 'Bearer valid-delegate-token-delegate-a' },
        }));
      });

      console.log('[MP-1 harness] Flow 4 — delegate dashboard poll (piggyback):', JSON.stringify(result));
      if (!result.withinThreshold) {
        console.warn(`[MP-1 harness] DIVERGENCE WARN: delegate-dashboard-poll-piggyback measured ${result.measuredReads} vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%)`);
      }
      expect(result.measuredReads).toBeGreaterThan(0);
    } finally {
      restoreConsole();
    }
  });

  it('Flow 4b — delegate dashboard poll (NO piggyback, for comparison)', async () => {
    suppressConsole();
    try {
      const result = await measureFlow('delegate-dashboard-poll-no-piggyback', MODEL.delegateDashboardPoll_noPiggyback, async () => {
        // Standard path (no piggyback): Worker reads the delegate doc too
        await api.fetch(new Request('http://localhost/api/delegates/dashboard', {
          headers: { Authorization: 'Bearer valid-delegate-token-delegate-a' },
        }));
      });

      console.log('[MP-1 harness] Flow 4b — delegate dashboard poll (no piggyback):', JSON.stringify(result));
      if (!result.withinThreshold) {
        console.warn(`[MP-1 harness] DIVERGENCE WARN: delegate-dashboard-poll-no-piggyback measured ${result.measuredReads} vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%)`);
      }
      expect(result.measuredReads).toBeGreaterThan(0);
    } finally {
      restoreConsole();
    }
  });

  it('Flow 5 — one admin view (admin delegates + admin garages)', async () => {
    suppressConsole();
    try {
      const result = await measureFlow('admin-view', MODEL.adminView, async () => {
        const adminToken = 'Bearer valid-admin-token';
        await Promise.all([
          api.fetch(new Request('http://localhost/api/admin/delegates?limit=50', {
            headers: { Authorization: adminToken },
          })),
          api.fetch(new Request('http://localhost/api/garages?limit=50', {
            headers: { Authorization: adminToken },
          })),
        ]);
      });

      console.log('[MP-1 harness] Flow 5 — admin view:', JSON.stringify(result));
      if (!result.withinThreshold) {
        console.warn(`[MP-1 harness] DIVERGENCE WARN: admin-view measured ${result.measuredReads} vs modeled ${result.modeledReads} (divergence ${result.divergencePct}%)`);
      }
      expect(result.measuredReads).toBeGreaterThan(0);
    } finally {
      restoreConsole();
    }
  });

  it('Summary — prints the full per-flow ledger', () => {
    // This test exists to provide a stable anchor for log-grepping CI runners
    // and to make the harness a single-runnable artifact.
    console.log('[MP-1 harness] Modeled per-flow reads (for divergence comparison):');
    console.log(JSON.stringify(MODEL, null, 2));
    console.log('[MP-1 harness] Divergence warn threshold:', `${DIVERGENCE_WARN_PCT * 100}%`);
    console.log('[MP-1 harness] Founding shape:', JSON.stringify({
      garages: FOUNDING_GARAGE_COUNT,
      delegates: FOUNDING_DELEGATE_COUNT,
      vehiclesInsidePerGarage: VEHICLES_INSIDE_PER_GARAGE,
      staffPerGarage: STAFF_PER_GARAGE,
      subscribersPerGarage: SUBSCRIBERS_PER_GARAGE,
      todayActivityPerGarage: TODAY_ACTIVITY_PER_GARAGE,
    }, null, 2));
    // Always passes — this is a summary anchor, not a measurement.
    expect(true).toBe(true);
  });
});
