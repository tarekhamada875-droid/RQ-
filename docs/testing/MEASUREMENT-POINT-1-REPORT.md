# Measurement Point 1 — Post-PR-D Capacity Model & Supervisor Ruling

**Date**: 2026-11-09 (UTC+8)
**Codebase HEAD**: `f733756` (post-PR-D, main synced)
**PRs merged this sequence**: PR-L (#675), PR-B2 (#676), PR-A (#677), PR-C (#678), PR-D (#679)
**Supervisor instruction**: *"PR-D 后重跑 tools/ten-garage-load-test.mjs + capacity model，若实测 vs 模型偏差 >20% 停止并报告"*

---

## ✅ Measurement Point Status: PASSED — Supervisor Ruling Received

**Three rulings** (verbatim summary):

1. **Scenario B (realistic 15-garage founding cohort) governs.** This was the standing calibration rule. Scenario A (worst-case 10-garage) stays as a **stress ceiling, not a gate**. MP-1 **PASSES** on the model half. Tripwire recorded: when garage #16 exists (post-founding), delegate page size gets revisited — logged, not actioned now. Supervisor's independent model agrees within ~13% at 15 garages (mine 15,520/31%; supervisor's 17,820/36%) — convergence noted, models cross-validated.

2. **HTTP load test waived; instrument replaced.** Operator cannot provision staging infrastructure; the HTTP test was the wrong instrument anyway (it measures latency/throughput, but our budget currency is Firestore reads). **Replaced with the MP-1 read-ledger harness**: an integration test that seeds the founding shape and prints per-flow read counts using the existing `mockDb.documentReadCount` pattern. Acceptance: per-flow table, measured vs. model, warn at 20% divergence on any flow. Due before Measurement Point 2 (post-PR-F). Folded into PR-K's guardrails and the nightly workflow.

3. **PR-E: GO now, in parallel with the harness.** `src/firebase.ts:38` `memoryLocalCache()` → `persistentMultipleTabManager()` with graceful fallback when IndexedDB is unavailable. Zero file overlap with the harness. Acceptance: reopen no longer re-reads ~30 docs; multi-tab verified; full gate.

**Sequence position**: PR-E + harness ∥ → PR-F → **MP-2 (harness is now the measuring stick)** → PR-G → PR-H → PR-I → PR-J → PR-K.

---

## Historical context (preserved for reference)

This report was originally written as a "STOPPING for operator input" brief when the HTTP load test could not be run locally. The supervisor's ruling converted the stop into a pass and replaced the HTTP instrument with the read-ledger harness. The capacity model results below are unchanged.

---

## Capacity Model Results

### Scenario A — Worst-case 10-garage baseline (now classified as STRESS CEILING, not a gate)

| Component | Reads/day |
| --- | --- |
| Garage dashboard refreshes (10 garages × 10 refreshes × 53 reads/refresh) | 5,300 |
| Vehicle operations (10 × 30 ops × 5 reads/op) | 1,500 |
| Delegate dashboard poll (1 delegate × 160 polls × 104 reads/poll — **worst case 50 docs/section**) | 16,640 |
| Admin dashboard views (1 × 5 views × 104 reads/view) | 520 |
| **Total modeled reads/day** | **23,960** |
| Free-tier budget (50K reads/day) | 50,000 |
| Budget utilization | **47.9%** |
| Budget headroom | 26,040 reads/day |
| Max garages at current pattern | ~48 |

**Supervisor target**: ≤25% of 50K for 10 garages = ≤12,500 reads/day
**Actual**: 23,960 reads/day = **1.92× target** — **EXCEEDS** worst-case target

**Root cause of excess**: the delegate dashboard poll dominates (16,640/23,960 = 69.5%). At worst-case page size (50 docs/section × 2 sections + 2 sentinels + 2 queries = 104 reads/poll), 160 polls/8h yields 16,640 reads. The PR-D piggyback saved the delegate doc read (−1/poll) and the cadence extension saved 80 polls/8h, but the page-size-50 assumption dominates.

### Scenario B — Realistic 15-garage founding cohort (small delegates, 3-5 garages each)

| Component | Reads/day |
| --- | --- |
| Garage dashboard refreshes (15 × 10 × 53) | 7,950 |
| Vehicle operations (15 × 30 × 5) | 2,250 |
| Delegate dashboard poll (3 delegates × 160 polls × **10 reads/poll** — realistic 5 created + 1 referred + 2 queries + 2 sentinels) | 4,800 |
| Admin dashboard views (1 × 5 × 104) | 520 |
| **Total modeled reads/day** | **15,520** |
| Free-tier budget (50K reads/day) | 50,000 |
| Budget utilization | **31.0%** |
| Budget headroom | 34,480 reads/day |

**Supervisor target**: ≤40% of 50K for 15 garages = ≤20,000 reads/day
**Actual**: 15,520 reads/day = **0.78× target** — **WITHIN** target ✓

**Key insight**: the worst-case (Scenario A) exceeds the target because it models a delegate with a FULL page of 50 created garages. The founding cohort has small delegates (3-5 garages each), so the actual delegate footprint is much lower (10 reads/poll vs 104). Under realistic founding-cohort assumptions, the 15-garage target is comfortably met.

---

## Pre-PR-D vs Post-PR-D Comparison (worst-case 10-garage scenario)

| Metric | Pre-PR-D | Post-PR-D | Savings |
| --- | --- | --- | --- |
| Today-activity reads/refresh | 200 | 50 (PR-C) | −150/refresh |
| Delegate poll cadence | 120s (240 polls/8h) | 180s (160 polls/8h) (PR-D) | −80 polls/8h |
| Delegate doc read per poll | 1 | 0 (PR-D piggyback) | −1/poll |
| Total modeled reads/day (worst-case 10 garages) | 47,520 | 23,960 | **−23,560 (−49.6%)** |

The PR-D changes cut the worst-case daily read total nearly in half. The remaining excess over the 25% target is driven by the delegate page-size-50 assumption, which is unrealistic for the founding cohort.

---

## Per-PR Read Impact Summary

| PR | Read impact | Notes |
| --- | --- | --- |
| PR-L (#675) | None (correctness) | F2 immutable staff-pin, F6 grace-window helper |
| PR-B2 (#676) | None (dead code) | Deleted unused financial-summary routes; bundle −7,004 B |
| PR-A (#677) | None (CPU only) | C1 init guard restores CryptoKey cache; eliminates per-request CPU work, no Firestore read change |
| PR-C (#678) | **−150 reads/garage-refresh** | Today-transactions 200→50; +defensive 500-cap on day-scoped events queries |
| PR-D (#679) | **−1 read/delegate-poll + −80 polls/8h** | Piggyback + cadence 120s→180s |

---

## Static-analysis Method

The capacity model (`scripts/measurement-point-1.mjs`) computes reads/day by walking the actual code paths in `src/services/vehicleService.ts`, `src/hooks/useGarageSync.ts`, `src/services/delegateService.ts`, `server/financialRoutes.ts`, and `server/garageRoutes.ts` as of main HEAD `f733756`. Per-operation read counts are derived from:
- Firestore query billing: 1 read per query + 1 read per returned doc
- onSnapshot initial delivery: 1 read per doc delivered (subsequent updates free for the listener)
- Pagination sentinel: `pageSize + 1` docs fetched for hasMore detection

Full JSON model output: `download/measurement-point-1-post-prd.json`

---

## What the HTTP load test would measure (that this model cannot)

The `tools/ten-garage-load-test.mjs` HTTP load test hits four read-only endpoints (`/api/garage-summary`, `/api/garages/{id}/dashboard-summary`, `/api/vehicles/inside`, `/api/vehicles/history`) against a deployed staging Worker with 10 synthetic garage tokens. It measures:
- HTTP p95/p99 latency under concurrency
- Error rate
- Per-route and per-garage request distribution
- Cloudflare Worker CPU/memory (must be collected separately from the provider)

It does **NOT** directly measure Firestore reads — those come from the GCP/Firebase console billing dashboard. The supervisor's deviation check (实测 vs 模型 >20%) would compare the load test's request counts and the Firestore billing reads against this model's predictions.

**Per supervisor ruling #2, the HTTP load test is waived** and replaced with the MP-1 read-ledger harness (integration test using `mockDb.documentReadCount`). The harness measures Firestore reads directly — our budget currency — and runs in CI with zero operator infrastructure.

---

## Sequence progress

- ✅ PR-L (#675), PR-B2 (#676), PR-A (#677), PR-C (#678), PR-D (#679) — all merged, supervisor-verified
- ✅ **Measurement Point 1** — capacity model PASSED (Scenario B governs, supervisor's independent model converges within ~13%)
- 🔄 **PR-E** (`src/firebase.ts:38` memoryLocalCache → persistentMultipleTabManager with IDB fallback) — GO, in parallel with the harness
- 🔄 **MP-1 read-ledger harness** — building now; due before MP-2
- ⏳ PR-F (Worker auth caches: role 5-min TTL + session 30s TTL) — after PR-E
- ⏳ Measurement Point 2 (post-PR-F; harness is the measuring stick)
- ⏳ PR-G through PR-K
