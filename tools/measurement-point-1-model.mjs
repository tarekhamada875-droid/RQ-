// Measurement Point 1 — post-PR-D capacity model
//
// Supervisor FINAL SEQUENCE: "PR-D 后重跑 tools/ten-garage-load-test.mjs +
// capacity model，若实测 vs 模型偏差 >20% 停止并报告"
//
// This script is the "capacity model" half. The HTTP load test half
// (tools/ten-garage-load-test.mjs) requires operator infrastructure
// (staging URL + 10 synthetic auth tokens) and is requested separately.
//
// The model reflects the codebase state AFTER these PRs are merged:
//   PR-A (#677): C1 init guard — restores CryptoKey cache, eliminates
//                 per-request initializeFirebaseAdmin work (CPU only,
//                 no Firestore read impact; not modeled here).
//   PR-B2 (#676): delete dead financial-summary routes (no client caller;
//                 no read impact; not modeled here).
//   PR-L (#675):  F2 immutable staff-pin update + F6 grace-window helper
//                 (correctness; no read impact; not modeled here).
//   PR-C (#678):  B1 day-scoped events queries capped at 500 reads/call
//                 (defensive; normal garages unaffected). B2 today-
//                 transactions page size 200 → 50 (−150 reads/refresh).
//   PR-D (#679):  Delegate dashboard piggyback on session-guard onSnapshot
//                 (−1 read/poll × 160 polls/8h per delegate session).
//                 Cadence 120s → 180s (−33% polls).

const GARAGE_COUNT = 10;
const FREE_TIER_READS_PER_DAY = 50_000;
const WORKDAY_HOURS = 8;

// Per-garage dashboard baseline (garage-owner view).
// Modeled against actual code paths in src/services/vehicleService.ts and
// src/hooks/useGarageSync.ts as of main HEAD = f733756 (post-PR-D).
const PER_GARAGE_REFRESH = {
  // garageService.subscribeToGarage → onSnapshot(doc garages/{id}) — 1 doc read
  // delivered as real-time snapshot. Counts as 1 read on initial delivery
  // (subsequent updates are free in Firestore billing for the listener itself;
  // the doc read is billed once per listener establishment).
  garageDocOnSnapshot: 1,
  // vehicleService.subscribeToActiveVehicles → onSnapshot(garages/{id}/vehicles
  // where status==inside) — 1 query read, returns N doc snapshots.
  // The query itself is 1 read; each returned doc is 1 read. Typical garage
  // has ~10-20 vehicles inside at peak; model 15.
  vehiclesInsideQuery: 1,
  vehiclesInsideDocs: 15,
  // vehicleService.subscribeToTodayTransactions → onSnapshot(activity_logs
  // where garageId+actionType==check_out+timestamp>=dayStart) limit 50.
  // PR-C trimmed this from 200 to 50. The query is 1 read; each returned doc
  // is 1 read. Typical garage has ~30-50 check-outs/day; model 30.
  todayActivityQuery: 1,
  todayActivityDocs: 30,
  // staffService.getStaffByGarageOnce — one-shot getDocs(staff where garageId).
  // Query is 1 read; each staff doc is 1 read. Typical garage has 3-5 staff.
  staffQuery: 1,
  staffDocs: 4,
};

const PER_GARAGE_REFRESH_TOTAL =
  PER_GARAGE_REFRESH.garageDocOnSnapshot +
  PER_GARAGE_REFRESH.vehiclesInsideQuery +
  PER_GARAGE_REFRESH.vehiclesInsideDocs +
  PER_GARAGE_REFRESH.todayActivityQuery +
  PER_GARAGE_REFRESH.todayActivityDocs +
  PER_GARAGE_REFRESH.staffQuery +
  PER_GARAGE_REFRESH.staffDocs;

// Refresh cadence: garage owner actively uses the dashboard ~10×/day
// (open, check-in/out, reopen, etc.). Real-time onSnapshot updates don't
// incur additional reads after establishment; the 10× is one-shot re-fetches
// (page reload, garage switch, etc.).
const GARAGE_REFRESHES_PER_DAY = 10;

// Per-delegate dashboard baseline (delegate view). PR-D changes:
//   - Cadence 120s → 180s: 8h × (3600/180) = 160 polls (was 240)
//   - Piggyback: each poll skips the delegate doc read (−1/poll)
const PER_DELEGATE_POLL = {
  // delegateService.getDashboardData (with PR-D piggyback: includeDelegate=false
  // when session-guard snapshot is fresh ≤10s old). The delegate doc read
  // is skipped; only the two garage pages are fetched.
  // Each page = 1 query read + N doc reads.
  // CreatedGarages page: 51 reads (50 docs + 1 sentinel for hasMore).
  // ReferredGarages page: 51 reads.
  createdGaragesQuery: 1,
  createdGaragesDocs: 50, // page size 50
  createdGaragesSentinel: 1, // pageSize+1 for hasMore detection
  referredGaragesQuery: 1,
  referredGaragesDocs: 50,
  referredGaragesSentinel: 1,
  delegateDoc: 0, // PR-D piggyback: skipped when snapshot is fresh
};

const PER_DELEGATE_POLL_TOTAL =
  PER_DELEGATE_POLL.createdGaragesQuery +
  PER_DELEGATE_POLL.createdGaragesDocs +
  PER_DELEGATE_POLL.createdGaragesSentinel +
  PER_DELEGATE_POLL.referredGaragesQuery +
  PER_DELEGATE_POLL.referredGaragesDocs +
  PER_DELEGATE_POLL.referredGaragesSentinel +
  PER_DELEGATE_POLL.delegateDoc;

const DELEGATE_POLLS_PER_8H = Math.floor((WORKDAY_HOURS * 3600) / 180); // 160

// Admin dashboard baseline. Admin lists load once per admin view transition.
const PER_ADMIN_VIEW = {
  // garageService.getAdminGaragesPage(50) — 1 query + 51 docs (sentinel)
  adminGaragesQuery: 1,
  adminGaragesDocs: 50,
  adminGaragesSentinel: 1,
  // delegateService.getAdminDelegatesPage(50) — 1 query + 51 docs (sentinel)
  adminDelegatesQuery: 1,
  adminDelegatesDocs: 50,
  adminDelegatesSentinel: 1,
};

const PER_ADMIN_VIEW_TOTAL =
  PER_ADMIN_VIEW.adminGaragesQuery +
  PER_ADMIN_VIEW.adminGaragesDocs +
  PER_ADMIN_VIEW.adminGaragesSentinel +
  PER_ADMIN_VIEW.adminDelegatesQuery +
  PER_ADMIN_VIEW.adminDelegatesDocs +
  PER_ADMIN_VIEW.adminDelegatesSentinel;

const ADMIN_VIEWS_PER_DAY = 5; // admin checks dashboard ~5×/day

// Vehicle operations (check-in/check-out). Each op is ~5 reads + 2-3 writes.
// Writes are billed separately (20K/day free tier); this model tracks reads.
const PER_VEHICLE_OP_READS = 5;
const VEHICLE_OPS_PER_GARAGE_PER_DAY = 30; // ~30 vehicles/garage/day

// Compute totals for the 10-garage baseline scenario.
// Assumption: 10 garage owners active, 1 delegate active, 1 admin active.
const garageReadsPerDay = GARAGE_COUNT * GARAGE_REFRESHES_PER_DAY * PER_GARAGE_REFRESH_TOTAL;
const vehicleOpsReadsPerDay = GARAGE_COUNT * VEHICLE_OPS_PER_GARAGE_PER_DAY * PER_VEHICLE_OP_READS;
const delegateReadsPerDay = 1 * DELEGATE_POLLS_PER_8H * PER_DELEGATE_POLL_TOTAL;
const adminReadsPerDay = 1 * ADMIN_VIEWS_PER_DAY * PER_ADMIN_VIEW_TOTAL;

const totalModeledReadsPerDay = garageReadsPerDay + vehicleOpsReadsPerDay + delegateReadsPerDay + adminReadsPerDay;

// Pre-PR-D baseline (for delta calculation)
const PRE_PRD = {
  perGarageRefresh: PER_GARAGE_REFRESH_TOTAL + 150, // today-activity was 200 not 50
  delegatePollsPer8h: Math.floor((WORKDAY_HOURS * 3600) / 120), // 240 polls at 120s
  perDelegatePoll: PER_DELEGATE_POLL_TOTAL + 1, // +1 delegate doc read
};
const prePrdGarageReads = GARAGE_COUNT * GARAGE_REFRESHES_PER_DAY * PRE_PRD.perGarageRefresh;
const prePrdDelegateReads = 1 * PRE_PRD.delegatePollsPer8h * PRE_PRD.perDelegatePoll;
const prePrdTotal = prePrdGarageReads + vehicleOpsReadsPerDay + prePrdDelegateReads + adminReadsPerDay;

const savingsPrd = prePrdTotal - totalModeledReadsPerDay;
const budgetUtilization = (totalModeledReadsPerDay / FREE_TIER_READS_PER_DAY) * 100;
const budgetHeadroom = FREE_TIER_READS_PER_DAY - totalModeledReadsPerDay;

// Capacity estimate: how many garages fit within 50K reads/day at this usage pattern
const perGarageDailyFootprint = (garageReadsPerDay + vehicleOpsReadsPerDay) / GARAGE_COUNT;
const fixedOverhead = delegateReadsPerDay + adminReadsPerDay;
const maxGaragesAtCurrentPattern = Math.floor((FREE_TIER_READS_PER_DAY - fixedOverhead) / perGarageDailyFootprint);

// Supervisor's target: ≤25% of 50K for 10 garages (≤12,500 reads/day)
const SUPERVISOR_TARGET_10_GARAGES = FREE_TIER_READS_PER_DAY * 0.25;
const actualVsTargetRatio = totalModeledReadsPerDay / SUPERVISOR_TARGET_10_GARAGES;
const withinTarget = totalModeledReadsPerDay <= SUPERVISOR_TARGET_10_GARAGES;

const report = {
  benchmark: 'RQ post-PR-D capacity model (Measurement Point 1)',
  modelType: 'static-analysis',
  codebaseHead: 'f733756 (post-PR-D)',
  prsReflected: ['PR-L (#675)', 'PR-B2 (#676)', 'PR-A (#677)', 'PR-C (#678)', 'PR-D (#679)'],
  scenario: {
    garages: GARAGE_COUNT,
    delegates: 1,
    admins: 1,
    workdayHours: WORKDAY_HOURS,
    freeTierReadsPerDay: FREE_TIER_READS_PER_DAY,
    supervisorTarget10Garages: SUPERVISOR_TARGET_10_GARAGES,
    supervisorTargetPct: 25,
  },
  perGarageRefreshBreakdown: PER_GARAGE_REFRESH,
  perGarageRefreshTotal: PER_GARAGE_REFRESH_TOTAL,
  garageRefreshesPerDay: GARAGE_REFRESHES_PER_DAY,
  perDelegatePollBreakdown: PER_DELEGATE_POLL,
  perDelegatePollTotal: PER_DELEGATE_POLL_TOTAL,
  delegatePollsPer8h: DELEGATE_POLLS_PER_8H,
  perAdminViewBreakdown: PER_ADMIN_VIEW,
  perAdminViewTotal: PER_ADMIN_VIEW_TOTAL,
  adminViewsPerDay: ADMIN_VIEWS_PER_DAY,
  perVehicleOpReads: PER_VEHICLE_OP_READS,
  vehicleOpsPerGaragePerDay: VEHICLE_OPS_PER_GARAGE_PER_DAY,
  totals: {
    garageReadsPerDay,
    vehicleOpsReadsPerDay,
    delegateReadsPerDay,
    adminReadsPerDay,
    totalModeledReadsPerDay,
  },
  comparison: {
    prePrdTotal,
    savingsPrd,
    savingsPrdPct: Number(((savingsPrd / prePrdTotal) * 100).toFixed(1)),
  },
  budget: {
    freeTierReadsPerDay: FREE_TIER_READS_PER_DAY,
    budgetUtilizationPct: Number(budgetUtilization.toFixed(1)),
    budgetHeadroom,
    maxGaragesAtCurrentPattern,
  },
  supervisorTarget: {
    target10Garages: SUPERVISOR_TARGET_10_GARAGES,
    actual: totalModeledReadsPerDay,
    actualVsTargetRatio: Number(actualVsTargetRatio.toFixed(2)),
    withinTarget,
  },
  note: 'Static-analysis capacity model. The HTTP load test half (tools/ten-garage-load-test.mjs) requires operator infrastructure (staging URL + 10 synthetic auth tokens) and is requested separately. This model reflects actual code paths as of post-PR-D main HEAD f733756.',
};

console.log(JSON.stringify(report, null, 2));

// ── Realistic scenario (founding 15 garages, small delegates) ──────────
// The worst-case model above assumes 50 docs per delegate section (page size).
// Real founding-cohort delegates have ~3-5 created garages + 0-2 referred.
// Recompute with realistic small-delegate assumption.
console.error('\n--- Realistic scenario (founding 15 garages, 3-5 garages/delegate) ---');
const REALISTIC_GARAGES = 15;
const REALISTIC_DELEGATES = 3; // 3 delegates each with ~5 garages
const REALISTIC_GARAGES_PER_DELEGATE_SECTION = 5; // createdGarages ~5, referredGarages ~0-2
const REALISTIC_REFERRER_GARAGES = 1; // referredGarages ~0-2, model 1

const realisticPerDelegatePoll = {
  createdGaragesQuery: 1,
  createdGaragesDocs: REALISTIC_GARAGES_PER_DELEGATE_SECTION,
  createdGaragesSentinel: 1,
  referredGaragesQuery: 1,
  referredGaragesDocs: REALISTIC_REFERRER_GARAGES,
  referredGaragesSentinel: 1,
  delegateDoc: 0, // PR-D piggyback
};
const realisticPerDelegatePollTotal =
  realisticPerDelegatePoll.createdGaragesQuery +
  realisticPerDelegatePoll.createdGaragesDocs +
  realisticPerDelegatePoll.createdGaragesSentinel +
  realisticPerDelegatePoll.referredGaragesQuery +
  realisticPerDelegatePoll.referredGaragesDocs +
  realisticPerDelegatePoll.referredGaragesSentinel +
  realisticPerDelegatePoll.delegateDoc;

const realisticDelegateReadsPerDay = REALISTIC_DELEGATES * DELEGATE_POLLS_PER_8H * realisticPerDelegatePollTotal;
const realisticGarageReadsPerDay = REALISTIC_GARAGES * GARAGE_REFRESHES_PER_DAY * PER_GARAGE_REFRESH_TOTAL;
const realisticVehicleOpsReadsPerDay = REALISTIC_GARAGES * VEHICLE_OPS_PER_GARAGE_PER_DAY * PER_VEHICLE_OP_READS;
const realisticAdminReadsPerDay = 1 * ADMIN_VIEWS_PER_DAY * PER_ADMIN_VIEW_TOTAL;
const realisticTotal = realisticGarageReadsPerDay + realisticVehicleOpsReadsPerDay + realisticDelegateReadsPerDay + realisticAdminReadsPerDay;

const realisticReport = {
  benchmark: 'RQ post-PR-D capacity model — REALISTIC 15-garage founding cohort',
  scenario: { garages: REALISTIC_GARAGES, delegates: REALISTIC_DELEGATES, admins: 1 },
  perDelegatePollTotal_realistic: realisticPerDelegatePollTotal,
  delegateReadsPerDay: realisticDelegateReadsPerDay,
  garageReadsPerDay: realisticGarageReadsPerDay,
  vehicleOpsReadsPerDay: realisticVehicleOpsReadsPerDay,
  adminReadsPerDay: realisticAdminReadsPerDay,
  totalModeledReadsPerDay: realisticTotal,
  budgetUtilizationPct: Number(((realisticTotal / FREE_TIER_READS_PER_DAY) * 100).toFixed(1)),
  budgetHeadroom: FREE_TIER_READS_PER_DAY - realisticTotal,
  supervisorTarget15Garages_pct: 40,
  supervisorTarget15Garages_reads: FREE_TIER_READS_PER_DAY * 0.40,
  withinSupervisorTarget: realisticTotal <= FREE_TIER_READS_PER_DAY * 0.40,
  actualVsTargetRatio: Number((realisticTotal / (FREE_TIER_READS_PER_DAY * 0.40)).toFixed(2)),
};
console.log(JSON.stringify(realisticReport, null, 2));
