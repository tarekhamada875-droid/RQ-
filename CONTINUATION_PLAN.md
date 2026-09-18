# RQ- Continuation Plan: Cost-Aware Delta-State Engine

## Purpose

This file is the continuation handoff for the RQ- parking platform. It is written so another Manus account or agent can resume safely without relying on chat history. The objective is to evolve the backend toward a cost-aware CQRS/read-projection architecture while preserving financial correctness, idempotency, and current production behavior.

## Repository and deployment

The authorized repository is `tarekhamada875-droid/RQ-`, cloned locally at `/home/ubuntu/RQ-`. The production frontend is served by Cloudflare Pages at `https://rq-acg.pages.dev`. The production backend is served by Vercel at `https://parqv2.vercel.app`. The repository uses the tracked generated Vercel entrypoint `api/index.js`; do not add another `api/index.ts` file because Vercel rejects the two paths as conflicting.

The latest pushed commit before this plan was `f1915b8`, `feat: add admin financial reports view`. Its GitHub Production Gate passed, Vercel served the exact commit, the backend health endpoint returned `adminSdk: true`, unauthenticated financial-report access returned HTTP 401, and the Cloudflare bundle contained `/api/reports/financial`.

## Completed milestones

The following work is already implemented and pushed to `main`:

1. Hardened immutable domain events with aggregate validation, recursive secret redaction, scoped event collections, and payload-size checks.
2. Made delegate settlement idempotent and added permanent `settlements/{settlementId}` records containing delegate, cutoff, prior cycle total, actor, timestamp, and idempotency metadata.
3. Made daily projection rebuilds deterministic and Cairo-day bounded through `server/projections.ts`.
4. Added strict payload validation for delegate settlements, vehicle refunds, and commission-earned events.
5. Added transactional `recharge_approved`, `recharge_rejected`, and delegate-scoped `commission_earned` events.
6. Added pure event-derived financial reporting in `server/financialReporting.ts`.
7. Added protected admin endpoint `GET /api/reports/financial` with `start`, `end`, and `delegateId` filters.
8. Added the admin Financial Reports view with summary cards, date filters, delegate filter, loading/error states, and live API integration.

The latest relevant commits are:

| Commit | Description |
|---|---|
| `c2bb63d` | Deterministic projection rebuilds |
| `90dd5e6` | Permanent settlement records |
| `bf2bdc6` | Recharge financial events |
| `0fe1052` | Event-derived financial reporting |
| `59d4b8e` | Protected financial reporting endpoint |
| `f1915b8` | Admin financial reports view |

## Current uncommitted work at handoff

The next engine slice was started but not completed. The following new files currently exist and must be reviewed before committing:

- `server/deltaProjection.ts`
- `server/deltaProjection.test.ts`

The vehicle route has one import already added:

```ts
import { createOperationId, createVehicleDelta, nextOperationVersion } from '../deltaProjection';
```

No vehicle-route operation metadata patch was successfully applied yet. The last attempted patch failed because generic lines matched multiple locations. Therefore, inspect `git diff` before continuing and do not assume the vehicle route is fully modified.

The new delta module currently provides:

- `createOperationId(scope, supplied?)`
- `nextOperationVersion(previous)`
- `projectionShard(operationId, shardCount)` using SHA-256 modulo sharding
- `createVehicleDelta(eventType, amount)` for check-in, checkout, refund, and delete events

The new tests cover deterministic operation IDs, operation versions, bounded deterministic shards, and vehicle deltas. They still need to be run with the full test suite after integration.

## Non-negotiable architectural rules

### Authoritative data

Firestore authoritative state and immutable events remain the source of truth. Never make Node.js process memory authoritative. Vercel functions are stateless, restartable, horizontally scaled, and may serve requests from different instances.

### Vehicle writes

The intended target is one independent vehicle document per vehicle:

```text
garages/{garageId}/vehicles/{vehicleId}
```

Each command must remain O(1) with respect to the number of vehicles. Do not scan all vehicles during check-in, checkout, refund, or deletion.

### Financial correctness

Do not remove current shared garage or daily-stat writes in the first pass. First add operation metadata and event deltas, validate reconciliation, then remove redundant hot-path writes only after proving the read models are correct. Financial totals must remain recoverable from immutable events and projections.

### Vercel entrypoint

Keep `api/index.js` as the tracked generated Vercel bundle. `npm run build` regenerates it. Never introduce `api/index.ts` alongside it unless the Vercel source migration has been redesigned and preview-verified.

## Staged implementation plan

### Stage 0 — Resume and safety checkpoint

1. Run:

```bash
cd /home/ubuntu/RQ-
git status --short --branch
git log -5 --oneline --decorate
git diff --check
git diff -- server/deltaProjection.ts server/deltaProjection.test.ts server/routes/vehicles.ts
```

2. Confirm only the expected delta-engine files are modified.
3. Run the focused primitive tests:

```bash
npm test -- --run server/deltaProjection.test.ts
```

4. If the vehicle import is the only route change, continue. If unexpected changes exist, inspect before editing.

**Checkpoint:** Delta primitives compile and tests pass; no production behavior changed.

### Stage 1 — Attach operation metadata to vehicle commands

Update `server/routes/vehicles.ts` carefully using unique surrounding context.

For check-in:

- Derive `operationId` after validating the idempotency key:

```ts
const operationId = createOperationId(garageId, idempotencyKey || undefined);
```

- Store `operationId` and `operationVersion` on the vehicle document.
- Use `nextOperationVersion(vehicleSnap.data()?.operationVersion)`.
- Include `operationId`, `operationVersion`, and `projectionDelta: createVehicleDelta('vehicle_entered')` in the `vehicle_entered` event payload.

For checkout:

- Derive an operation ID after the idempotency key and garage ID are available.
- Store operation metadata on the vehicle update.
- Include the operation metadata and `createVehicleDelta('vehicle_exited', cost)` in the `vehicle_exited` event payload.

For delete/refund:

- Derive an operation ID.
- Store operation metadata in the event payload.
- Include `createVehicleDelta('vehicle_refunded', refundAmt)` for refunds. For deletion without refund, use `createVehicleDelta('vehicle_deleted')` only if the event helper semantics remain compatible.

Do not remove any existing garage, daily_stats, activity log, or event writes at this stage.

**Checkpoint:** Vehicle operations carry stable operation metadata and explicit deltas; business totals remain unchanged.

### Stage 2 — Add durable sharded projection-bucket primitives

Create a pure helper or service for calculating a bucket path:

```text
garages/{garageId}/projection_buckets/{date}_{shard}
```

Use a configured shard count per garage, initially a conservative constant such as 8 for busy garages and 2 for normal garages. Do not guess production shard counts permanently; keep the value configurable.

A bucket should contain additive fields such as:

```text
activeVehicleCountDelta
entriesToday
exitsToday
grossRevenue
refundTotal
netRevenue
lastOperationId
updatedAt
```

The first implementation may write bucket deltas synchronously in the same transaction only if this does not introduce a new shared hotspot. Prefer a separate bucket per deterministic operation shard. Use Firestore transaction-safe increments where appropriate, but preserve event rebuild capability.

**Checkpoint:** Bucket paths and delta application are deterministic, bounded, and testable.

### Stage 3 — Build a durable dashboard summary

Add a read model such as:

```text
garages/{garageId}/dashboard_summary/current
```

Do not make it the authoritative vehicle state. It is a read model only.

The summary should eventually expose:

- Current active vehicle count
- Entries today
- Exits today
- Gross revenue today
- Refund total today
- Net revenue today
- Projection watermark/version
- Last rebuilt timestamp

Initially, populate it through a rebuild endpoint or controlled service rather than removing existing writes. Add reconciliation comparing summary values to event-derived values.

**Checkpoint:** Summary can be rebuilt from events and buckets, and mismatches are visible.

### Stage 4 — Remove redundant hot-path reads and writes

Only after Stages 1–3 pass:

1. Identify all writes to the shared garage document in check-in, checkout, and delete.
2. Classify fields as authoritative state, compatibility cache, or projection.
3. Keep fields required by existing authorization/business rules.
4. Move display-only counters to dashboard projections.
5. Replace dashboard raw transaction scans with summary reads.
6. Keep the realtime query for vehicles with `status == 'inside'`.
7. Preserve the existing projection rebuild and reconciliation endpoints as recovery tools.

Do not remove compatibility fields in one large change. Use a staged migration with one commit per behavior group.

**Checkpoint:** Dashboard reads become O(1) for aggregates, while active vehicle display remains incremental.

### Stage 5 — Measure and tune

Add instrumentation or test fixtures to measure:

- Reads and writes per check-in.
- Reads and writes per checkout.
- Reads on dashboard initial load.
- Reads after one vehicle enters and leaves.
- Transaction retries on the shared garage document.
- Projection freshness delay.
- Rebuild duration for one day.

Use these measurements to choose:

```text
shard count >= peak writes per second / safe writes per document per second
batch interval based on dashboard freshness requirement
cache/persistence behavior based on reconnect frequency
```

Do not claim cost savings until these metrics are measured.

## Required validation after every stage

Run the narrow tests first, then the full gate:

```bash
npm test -- --run server/deltaProjection.test.ts
npm test
npm run lint
npm run build
npm run ci:check
npm run maintainability:check
git diff --check
```

The build regenerates `api/index.js`. If source changes are intended for production, include the regenerated bundle in the commit.

Before pushing, verify:

```bash
git status --short --branch
git diff --stat
git diff --check
```

After pushing, verify:

```bash
gh run list --limit 2 --branch main --json databaseId,headSha,status,conclusion,url
curl -sS https://parqv2.vercel.app/api/health
curl -sS -i https://parqv2.vercel.app/api/reports/financial
curl -sS -i https://rq-acg.pages.dev/
```

The unauthenticated financial report endpoint must remain HTTP 401. Never use real production financial mutations for testing.

## Suggested next commit sequence

1. `test: add delta projection primitives` — only if the current new files need cleanup.
2. `feat: attach operation metadata to vehicle events`.
3. `feat: add sharded dashboard projection buckets`.
4. `feat: add rebuildable dashboard summary`.
5. `feat: switch admin dashboard aggregates to read projections`.
6. `chore: measure firestore operation costs`.

Keep each commit small and independently revertible.

## Continuation instruction

Start with Stage 0. Read this file and inspect the working tree. Do not skip validation. Do not remove shared garage writes yet. The immediate next implementation target is attaching operation metadata and explicit deltas to check-in, checkout, and delete/refund events using precise patches in `server/routes/vehicles.ts`.


## Progress update — Stage 1 completed

The delta primitives passed focused tests and the full repository gate. Vehicle check-in, checkout, and delete/refund events now include a stable scoped `operationId`, monotonic per-vehicle `operationVersion`, and explicit `projectionDelta`. Vehicle documents store operation metadata for check-in and checkout. Existing shared garage, daily statistics, activity log, idempotency, and event writes were intentionally preserved; no hot-path writes were removed yet.

Validation passed: focused delta tests, full Vitest suite, TypeScript validation, production build, CI production gate, maintainability check, and `git diff --check`.

Next checkpoint is Stage 2: add deterministic sharded projection-bucket primitives and a rebuildable dashboard summary. Do not remove shared garage writes until bucket and summary reconciliation is implemented and validated.


## Progress update — Stage 2 completed

Added deterministic sharded projection buckets under `garages/{garageId}/projection_buckets/{dateId}_{shard}`. The shard is selected by SHA-256 hashing the operation ID, with a bounded adaptive policy of 2 shards for low-rate garages, 8 for medium-rate garages, and 16 for high-rate garages. Vehicle check-in, checkout, and refund/delete transactions now write additive `FieldValue.increment` deltas to the appropriate bucket in the same transaction as the existing authoritative writes and immutable event.

The bucket write is intentionally additive and does not read the bucket first. Existing garage and daily-stat totals remain active so the new bucket model can be reconciled before any hot-path writes are removed. The bucket stores the operation ID, projection version, Cairo date key, shard, additive counters, and update timestamp.

Validation passed: focused bucket and event tests, full Vitest suite, TypeScript validation, production build, CI production gate, maintainability check, and `git diff --check`.

Next checkpoint is Stage 3: create a rebuildable dashboard summary and reconciliation comparison against event-derived totals and legacy garage/daily-stat aggregates.


## Progress update — Stage 3 completed

Added the pure `server/dashboardSummary.ts` calculator and tests. Added admin-only `POST /api/garages/dashboard-summary/rebuild`, which reads the target Cairo day's projection buckets, immutable events, garage document, and daily statistics; aggregates the compact summary; compares it with the event-derived projection; compares it with legacy garage/daily-stat totals; and writes the rebuildable read model to `garages/{garageId}/dashboard_summary/current`.

The endpoint returns bucket count, event count, event consistency, and legacy differences. It is diagnostic/rebuild infrastructure only; existing dashboards and authoritative writes have not been switched over yet.

Validation passed: dashboard summary tests, full Vitest suite, TypeScript validation, production build, CI production gate, maintainability check, and `git diff --check`.

Next checkpoint is Stage 4: add a read-only summary service/client and switch only aggregate KPI reads to the summary after authenticated production verification. Keep the active vehicle realtime query unchanged. Remove legacy shared aggregate writes only after several reconciliation cycles show zero differences.


## Progress update — Stage 4 read foundation completed

Added `GET /api/garages/:id/dashboard-summary`, restricted to admins or the authenticated garage/staff session belonging to that garage. Added a typed `garageService.getDashboardSummary` client method.

The active vehicle listener remains unchanged and continues to provide realtime occupancy. Aggregate KPI rendering has not yet been switched to the summary because the current summary is rebuilt on demand and may be stale; substituting it into the live screen before establishing an automatic freshness contract would be unsafe. This checkpoint intentionally delivers the scoped read API and client foundation first.

Validation passed: full Vitest suite, TypeScript validation, production build, CI production gate, maintainability check, and `git diff --check`.

Next checkpoint: make the summary freshness contract explicit by adding a controlled rebuild/refresh mechanism or a projection worker, then migrate only aggregate KPI reads with a fallback to legacy fields and production reconciliation telemetry.
