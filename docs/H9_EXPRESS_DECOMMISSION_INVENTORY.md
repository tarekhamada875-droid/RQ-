# H9 Express Decommission Inventory

**Date:** 2026-10-09  
**Production release:** `rq-unified-hono-h8-2026-10-09` (`8be859d9ed99bd4009b0dd9d7ec0b7f2c2f2c9f0`)  
**Authorized work branch:** `migration/unified-hono`  
**Rollback tag:** `rq-production-baseline-before-hono-migration` (`bb12fbe90eb97b6638546f292f5de50aab03d81a`)  
**Scope of this document:** controlled inventory and reversible decommissioning sequencing; no production behavior change.

## Current finding

Express is **not yet removable**. The unified Hono Worker is the production backend, but Express remains a live local compatibility runtime and is imported by transitional route modules, middleware, adapters, and integration/dual-runtime tests. The unused Cloud Run-specific entrypoint has now been retired after an exact repository/workflow audit found no active Cloud Run deployment.

Immediate Express deletion would break at least the local `dev:express` fallback, `build:server`, and existing Express characterization coverage. H9 must therefore proceed in reversible slices.

## Dependency and script inventory

- Runtime dependency: `express` `^5.2.1`.
- Type dependency: `@types/express` `^5.0.6`.
- Express-backed scripts:
  - `dev:express` → `tsx server.ts` (explicit compatibility fallback).
  - `build:server` → bundles `server.ts` for the Node runtime.
  - `start` → runs `dist/server.cjs`.
- Hono-first local path: `dev` and `dev:hono` → `RQ_API_RUNTIME=hono tsx server.ts`.
- Production path: Cloudflare Worker via `build:cloudflare` and the main-branch deployment workflow; it does not use Express.

## Express import census

The initial search found **31 files** importing Express directly:

### Runtime and route surface

- `server.ts`
- `server/app.ts`
- `server/auth/activeSessions.ts`
- `server/auth/adminAuth.ts`
- `server/auth/pinAuth.ts`
- `server/auth/sessionLifecycle.ts`
- `server/middleware.ts`
- `server/operationTrace.ts`
- `server/routes/auth.ts`
- `server/routes/delegates.ts`
- `server/routes/garages.ts`
- `server/routes/reports.ts`
- `server/routes/subscribers.ts`
- `server/routes/vehicles.ts`
- `server/routes/recharges/directRecharge.ts`
- `server/routes/recharges/index.ts`
- `server/routes/recharges/manualTopup.ts`
- `server/routes/recharges/referralRewards.ts`
- `server/routes/recharges/requestApproval.ts`
- `server/routes/recharges/selfSubscription.ts`

### Express integration and characterization tests

- `server/auth/pinAuthRoleScope.test.ts`
- `server/auth/sessionLifecycleRoleRetirement.test.ts`
- `server/authMaintenanceAuthorization.integration.test.ts`
- `server/authSessionRoutes.integration.test.ts`
- `server/financialReportAuthorization.integration.test.ts`
- `server/garageCreationAuthorization.integration.test.ts`
- `server/garageMaintenanceAuthorization.integration.test.ts`
- `server/manualCreditRoutes.integration.test.ts`
- `server/subscriberRoutes.integration.test.ts`
- `server/vehicleGarageScopeAuthorization.integration.test.ts`
- `server/h5DualRuntime.contract.test.ts` (uses the Express app as the comparison runtime)

## Runtime topology

`server.ts` retains Express as the code-level compatibility default, while package scripts now make Hono the local development default:

```text
`npm run dev`          -> RQ_API_RUNTIME=hono -> Fetch/Hono adapter from server/nodeAdapter.ts
`npm run dev:hono`     -> RQ_API_RUNTIME=hono -> Fetch/Hono adapter from server/nodeAdapter.ts
`npm run dev:express`  -> RQ_API_RUNTIME unset -> Express app from server/app.ts
Cloudflare Worker      -> server/cloudflareWorker.ts
Generic Node/container -> server.ts -> explicit Express fallback or Hono adapter
```

`server/app.ts` mounts the transitional Express routers for auth, vehicles, subscribers, delegates, transactions/recharges, garages, and reports, plus JSON, CORS, correlation, timeout, operation-trace, fallback, and error middleware.

## Known Express-only or maintenance capabilities

The existing route inventory identifies these Express capabilities as requiring an explicit disposition before removal:

- `POST /api/garages/reconciliation` — a Fetch-native Hono mirror and synthetic read-only contract coverage have been added on `migration/unified-hono`; the Express handler remains mounted pending telemetry comparison and operational owner confirmation.
- `POST /api/garages/dashboard-summary/rebuild` — a Fetch-native Hono mirror and synthetic Express/Hono characterization are now present on `migration/unified-hono`; the Express route remains mounted pending an isolated operational rehearsal and separate retirement review.
- `POST /api/garages/rebuild-projections` — a Fetch-native Hono mirror and synthetic Express/Hono replay/retry characterization are present on `migration/unified-hono`; Express remains mounted. **Preview rehearsal is on HOLD:** preview and production Wrangler configs currently specify the same Firebase project/database identifiers, so do not perform authenticated preview Firestore operations until an isolated synthetic data/auth target and rollback process are verified.
- `POST /api/auth/invalidate-all-sessions`

These are not ordinary frontend routes. H9 must either preserve them behind a supported Hono maintenance route or explicitly retire them with owner-approved operational documentation and tests.

Retired in the current H9 slice: the Express `GET /api/delegates/dashboard` handler. The frontend already calls this exact path, and the Hono Worker owns the replacement with the same response shape plus explicit PIN-field sanitization. Fetch-native coverage now verifies scoped delegate-session resolution, the delegate and two garage sources, the request list, and absence of PIN fields. The explicit `dev:express` fallback no longer serves this legacy dashboard alias; all other delegate mutation and settlement routes remain mounted.

Retired in this slice: the Express `GET /api/garages/:id/dashboard-summary` handler. It was read-only but returned operational and revenue metrics, so removal was gated on Hono coverage for live projection data, fresh stored-summary fallback, stale-summary rejection, and cross-garage denial. The Hono route remains the active frontend path; garage mutations and admin projection/reconciliation maintenance routes remain mounted.

Also retired in this slice: the Express `POST /api/garages/trial-decision` handler. This non-financial state transition is now covered by Fetch-native tests for owner continuation, admin clearing, activity-log creation, invalid decisions, and staff denial. The Hono route remains the active path; financial, vehicle, subscriber, delegate-settlement, and maintenance mutations remain mounted.

Also retired in this slice: both duplicate Express fair-use handlers (`POST /api/garages/:id/extend-fair-use` and `POST /api/admin/garages/:id/extend-fair-use`). Hono now owns both paths. Retirement was gated on Hono boundary coverage plus dual-runtime idempotency replay and key-reuse tests; the frontend continues using the legacy path as a Hono alias.

Also retired in this H9 continuation: the Express `POST /api/garages/recalculate-cars-inside` handler after synthetic dual-runtime response/state, authorization, and malformed-input characterization and explicit owner authorization to transfer maintenance ownership. The Hono handler remains supported and tested; the Express fallback now returns 404 for this path. Focused post-retirement validation passed **5 files / 66 tests**; the full local suite passed **103 files / 609 tests**, along with lint, builds, `npm run ci:check`, maintainability, and whitespace checks. Express itself and all other maintenance routes remain unchanged.

Added the Fetch-native Hono mirror for `POST /api/garages/dashboard-summary/rebuild` with dual-runtime synthetic tests for projection aggregation, event consistency and day boundaries, persisted summary shape, authorization, and errors. Focused characterization passes **10 tests**; the full local suite passes **103 files / 613 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks. The Express route remains available as fallback/characterization; no preview or live rebuild was executed.

Added the Fetch-native Hono mirror for `POST /api/garages/rebuild-projections` with synthetic Express/Hono tests for event replay, Cairo-day boundaries, event watermark, merge preservation, authorization, invalid input, and repeat-request stability. Focused validation passed **3 files / 34 tests**; the full suite passed **103 files / 616 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks green. Express remains mounted as fallback/characterization; no real or preview rebuild was run.

The 2026-10-09 operational review found that the preview Worker uses the same Firebase project and Firestore database identifiers as production. The passing H5 run deployed the Worker and tested health/version plus unauthenticated protection only; it performed no authenticated route call or Firestore operation. Preview data rehearsal and Express retirement remain blocked pending a genuinely isolated synthetic Firebase target and exact rollback evidence.

The remaining Express garage handlers are documented in [`docs/H9_SENSITIVE_ROUTE_DISPOSITION.md`](H9_SENSITIVE_ROUTE_DISPOSITION.md). They include account creation (now hardened and synthetically characterized across both runtimes), destructive deletion (now lease-protected against overlapping runs and synthetically characterized), entitlement extension, and projection/reconciliation maintenance. The Express `POST /api/garages/update` handler has been retired locally after synthetic coverage and explicit owner approval; Hono remains the supported route.

## Safe H9 sequence

1. **Inventory complete:** retain this document and the existing H1 route inventory as the source of truth.
2. **Characterization conversion:** add Fetch/Hono equivalents for any still-required Express-only tests; keep Express tests until their replacement coverage passes.
3. **Runtime default decision:** switch local `dev` to Hono only after local development, static serving, and Node adapter checks pass; retain an explicit legacy compatibility command temporarily.
4. **Route retirement:** remove Express routers only in groups whose behavior is covered by shared domain tests and Hono route tests. Do not remove financial or maintenance paths based only on frontend absence.
5. **Dependency removal:** remove `express`, `@types/express`, and related middleware only after the import census reaches zero for required runtime and test code.
6. **Full gate:** run tests, lint, web/Node/Cloudflare builds, CI, maintainability, preview smoke, production smoke, and rollback verification.

## First reversible slice

The first implementation slice should be **test and runtime decoupling, not Express deletion**:

- Identify tests whose assertions are already covered by Worker/Fetch suites.
- Add or strengthen Fetch-native tests for the shared session and route contracts.
- Keep the Express comparison suite as a characterization guard during this slice.
- Do not change production configuration, Firestore rules, financial behavior, or role policy.

The first slice added Fetch-native Worker coverage for valid garage-session refresh and expiry in `src/__tests__/workerSessionRoutes.test.ts`, while retaining the five Express session characterization tests. The focused pair passes **2 files / 11 tests**. The Hono implementation intentionally treats the security session as authoritative during refresh and returns the Hono `error` envelope for expiry; the older Express suite remains the record of the transitional runtime's legacy behavior and is not relabeled as identical. The second slice makes `npm run dev` Hono-first and preserves `npm run dev:express` as the explicit fallback. The third slice retires `server/cloudRun.ts` and `build:cloudrun`; Dockerfile and Express local/container compatibility remain until their consumers are separately retired. The fourth slice retires the redundant Express delegate dashboard handler after focused Hono replacement coverage passed (**3 files / 22 tests**); financial, settlement, and maintenance routes remain untouched. The fifth slice strengthens Hono garage-summary coverage for stored/live/stale data and scope denial. The sixth slice retires the Express garage dashboard-summary handler after the expanded Hono authorization matrix passed (**3 files / 36 tests**); financial writes and projection/reconciliation maintenance routes remain untouched. The seventh slice retires the Express trial-decision handler after Fetch-native state-transition and authorization coverage passed (**4 files / 52 tests**); remaining financial and maintenance mutation surfaces are unchanged.

## H9 status

**H9 in progress.** Cloud Run-specific entrypoint/build support, the redundant Express delegate dashboard handler, the Express garage dashboard-summary handler, the Express trial-decision handler, the Express cars-inside recalculation handler, and the Express garage-update handler are retired. Express remains required for local/container compatibility, remaining route groups, and characterization tests. The H8 production release and rollback tag remain unchanged.

### Read-only garage reconciliation slice — 2026-10-09

`server/cloudflareWorker.ts` now exposes the existing Admin-only `POST /api/garages/reconciliation` capability through the Fetch-native Worker. The implementation uses the existing pure `reconcileGarageState` reducer, performs only garage/vehicle/daily-stat/event reads, applies the Africa/Cairo day boundary, and preserves the Express response/error contract. `src/__tests__/cloudflareWorkerGarageRoutes.test.ts` adds synthetic coverage for response parity, day boundaries, authorization, validation, missing-garage behavior, and absence of writes. The Express characterization handler is intentionally retained; this does not retire the route or authorize production deployment.

Focused route/domain/authorization and dual-runtime validation passed **5 files / 67 tests**. Full local validation passed **103 files / 610 tests**, TypeScript lint, web/Node/Cloudflare builds, `npm run ci:check`, maintainability, and whitespace checks before this documentation-only update. Telemetry equivalence and operational owner confirmation remain unresolved gates before retiring the Express reconciliation route.

### Cars-inside recalculation characterization — 2026-10-09

Before retirement, direct synthetic dual-runtime characterization for `POST /api/garages/recalculate-cars-inside` compared Admin status/body and resulting `carsInside`, non-Admin denial without writes, and missing/empty ID handling. Following explicit owner approval, only the Express route registration was removed. Hono continues as the supported owner with synthetic count, authorization, and validation tests; Express fallback coverage asserts this endpoint returns 404. No preview or live data was mutated.


### Garage creation synthetic characterization — 2026-10-10

Added six local dual-runtime characterization tests for `POST /api/garages/create` in `server/garageReconciliationParity.integration.test.ts`. They cover active-role authorization, Admin trial initialization, delegate attribution and the three-per-Cairo-day quota, duplicate PIN rejection, invalid idempotency-key validation, and repeated valid-key behavior. All Firestore interactions use the in-memory `MockFirestore`; neither route implementation changed.

Hono and Express matched on the tested garage/trial fields, delegate attribution/quota, PIN collision response, and invalid-key response at this initial checkpoint. The two then-open gaps—activity-log `details` parity and valid-key replay protection—were resolved in the following hardening slice; see below. The Express fallback remains mounted pending a separate route-retirement review.

Focused validation at the initial characterization checkpoint passed **3 files / 39 tests**. The full local suite at that checkpoint passed **103 files / 622 tests**; lint, web/Node/Worker builds, `npm run ci:check`, maintainability, and whitespace checks passed. No preview or live data operation, cloud access, route retirement, or production change occurred.

### Garage creation hardening — 2026-10-10

Closed the two `POST /api/garages/create` gaps identified in the initial characterization. Hono and Express now emit matching activity-log `details`. Both implementations use the same sanitized request fingerprint (with the raw PIN omitted), and perform idempotency checking/storage, private PIN and unique reservation writes, garage creation, and activity-log creation in one Firestore transaction. Same-key/same-request retries replay the saved result; same-key/different-request reuse is rejected. A concurrent same-key dual-runtime synthetic test verifies a single garage and activity log are created. The transaction also checks the PIN reservation before writing it. Hono additionally now matches Express's normal-operation 30-per-user/IP-per-minute create limit through a transactionally updated `rate_limits` document; Hono fails closed on limiter-storage failure, while Express retains its process-memory fallback.

Focused validation at the hardening checkpoint passed **4 files / 43 tests**; the full suite then passed **103 files / 624 tests**. Later rate-limit validation and current totals are recorded below. Tests used only in-memory `MockFirestore`; no Firebase/Cloudflare access, preview rehearsal, live data operation, push, or deployment occurred. Express create remains mounted pending a distinct route-retirement review and explicit approval.

### Garage creation Hono rate-limit parity — 2026-10-10

Added the same normal-operation rate cap as Express to Hono garage creation: 30 requests per authenticated UID per fixed 60-second window (client IP fallback), enforced transactionally in the shared hashed `rate_limits` document. The 31st request returns a compatible 429 without creating garage data. Expired-window reset and fail-closed 503 behavior for limiter-storage failure are also covered using in-memory `MockFirestore`. The Hono outage policy is intentionally fail-closed rather than using Express's process-local memory fallback.

Focused integration passed **1 file / 31 tests**. A simultaneous near-limit test verifies that, with 28 requests already counted, three concurrent requests result in exactly two accepted creations, one 429, and a counter fixed at 30. The full local suite passed **103 files / 636 tests**; `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` passed. No Firebase/Cloudflare access or deployment occurred. Express create stays mounted; retirement is not part of this approved slice.

### Garage update characterization and Express retirement — 2026-10-10

Three synthetic dual-runtime tests characterized `POST /api/garages/update`: the Hono allowlist for all current fields, ignored input fields, no-write denials for non-Admin roles, and Admin validation/missing-document behavior. They exposed and fixed Express's authorization-before-validation ordering. After explicit owner approval, only the Express handler was removed. Hono remains supported; tests preserve its allowlist/authorization/error contracts and verify the Express fallback now returns 404. The former Express parser's 400 body for top-level JSON `null` differed from Hono's route-level error; that legacy route behavior is no longer served.

The focused integration file passed **1 file / 28 tests**; the final full local suite passed **103 files / 633 tests**, with `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` green after retirement. Tests use only in-memory `MockFirestore`; no Firebase/Cloudflare access, preview rehearsal, live operation, push, or deployment occurred. This removes only the local Express update handler; Express and all other routes remain.

### Garage deletion dual-runtime characterization — 2026-10-10

Added five local synthetic dual-runtime tests for `POST /api/garages/delete`. Coverage verifies scoped cleanup, preservation of unrelated records, audit/job parity, authorization and input/not-found behavior, completed-job replay, resume after the root is absent, recovery after a simulated lost batch acknowledgment, and a concurrent duplicate request receiving 409 while the first operation completes only once. A shared Firestore transaction claims the garage with a five-minute renewable lease; failures become retryable, expired legacy jobs can be reclaimed, and final audit/root/job completion is atomic. Express mirrors Hono's persisted metadata and recovery contract; Hono uses the shared error map. Hono now also applies the same 30-per-user/IP-per-minute financial limiter used by Express before entering the destructive handler; it shares the create-route fail-closed storage policy.

Focused validation passed **1 file / 28 tests**; final full local validation passed **103 files / 633 tests**, including `npm run ci:check`, maintainability, and whitespace checks. All destructive operations and fault injection were confined to in-memory `MockFirestore`; no external database, preview/live data, route retirement, push, or deployment was involved.

**Still open:** lease and transaction behavior has only been verified against `MockFirestore`; no isolated Firebase rehearsal occurred. The current client sends only `garageId`, so replay/serialization relies on the garage-scoped lease/job state rather than a separate request key. Keep Express mounted until operational review and any route-retirement decision is explicitly approved.

### Garage deletion Hono rate-limit parity — 2026-10-10

Extracted the Hono financial limiter into shared middleware and applied it to `POST /api/garages/delete`, matching Express's fixed 30-request/60-second cap for authenticated user IDs (client IP fallback). Synthetic tests seed the hashed shared `rate_limits` document at count 29; both runtimes allow the next deletion, reject the following request with the compatible 429 contract, and leave business records unchanged on the blocked request. The existing same-garage overlap synchronization was updated for the added limiter transaction and continues to pass.

Focused integration passed **1 file / 32 tests**; full local validation passed **103 files / 637 tests**, CI/release checks, maintainability, and `git diff --check`. All state was synthetic in-memory Firestore. Express deletion remains mounted; no Firebase/Cloudflare access, preview/live deletion, push, or deployment occurred.

### Maintenance null-body validation parity — 2026-10-10

Local characterization exposed a Hono 500 for JSON `null` on `POST /api/garages/reconciliation`, `/api/garages/dashboard-summary/rebuild`, and `/api/garages/rebuild-projections`, while Express returned 400. Hono now normalizes null to an empty request and returns 400 without business-data writes. Because Express rejects top-level JSON `null` in its parser and returns an HTML error envelope, the cross-runtime assertion for this case is status/no-write parity; ordinary JSON validation cases still compare response bodies exactly.

Focused H9 integration passed **1 file / 32 tests**; the full suite passed **103 files / 637 tests**. CI/release checks, maintainability, and `git diff --check` passed. This was entirely local and synthetic; all three Express maintenance handlers remain mounted, with no cloud rehearsal, push, or deployment.

### DST-aware Cairo maintenance boundaries — 2026-10-10

Both Express and Hono maintenance handlers previously used fixed `UTC+03:00` query windows. A winter synthetic fixture showed that this included a prior-local-day event and omitted a late target-day event. A shared helper now computes actual `Africa/Cairo` day boundaries for reconciliation, dashboard-summary rebuild, and projection rebuild; it derives the next local day's start separately rather than assuming a 24-hour UTC interval.

Unit tests verify winter and summer offsets. Dual-runtime synthetic summary/projection rebuild tests verify the winter-day event count, totals, and watermark. Focused validation passed **2 files / 38 tests**; full validation passed **103 files / 639 tests**, CI/release, maintainability, and whitespace checks. All data remained in `MockFirestore`; no Firebase/Cloudflare access, live/preview operation, route retirement, push, or deployment occurred.

### Multi-page garage deletion lease stress — 2026-10-10

Added a synthetic 805-vehicle deletion case to force three 400-document cleanup pages in each runtime. The test observed exactly three lease renewals, no remaining owned vehicles, one audit record, a completed job, and a released lease for both Hono and Express. Focused stress coverage passed; full local validation passed **103 files / 640 tests**, including CI/release, maintainability, and whitespace checks. This remains `MockFirestore`-only evidence; Express deletion stays mounted and no cloud/live/preview action was performed.
