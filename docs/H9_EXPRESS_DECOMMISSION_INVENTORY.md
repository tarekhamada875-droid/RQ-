# H9 Express Decommission Inventory

**Date:** 2026-10-12
**Production release:** `rq-unified-hono-h8-2026-10-09` (`8be859d9ed99bd4009b0dd9d7ec0b7f2c2f2c9f0`)  
**Authorized work branch:** `migration/unified-hono`  
**Rollback tag:** `rq-production-baseline-before-hono-migration` (`bb12fbe90eb97b6638546f292f5de50aab03d81a`)  
**Scope of this document:** controlled inventory and reversible decommissioning sequencing; no production behavior change.

## Current finding

Express is **not yet removable**. The unified Hono Worker is the production backend, but Express remains a live local compatibility runtime and is imported by transitional route modules, middleware, adapters, and integration/dual-runtime tests. The unused Cloud Run-specific entrypoint has now been retired after an exact repository/workflow audit found no active Cloud Run deployment.

Immediate Express deletion would break at least the local `dev:express` fallback, `build:server`, and existing Express characterization coverage. H9 must therefore proceed in reversible slices.

The one-pass 2026-10-12 census is complete. It found 51 active Express API registrations before the source cut; the projection slice removes only `POST /api/garages/rebuild-projections` from Express, leaving 50 registrations and the Express local compatibility runtime. The current Hono candidate additionally implements the Admin-only `POST /api/auth/invalidate-all-sessions` mirror; this is not an Express route retirement. The full route/import census and remaining parity blockers are recorded in the final dated sections below.

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

The **2026-10-09 baseline search** recorded 31 files importing Express directly. That list is historical: a repeatable search at H9 census head `51f6f5445fd04734a2743d7f4f4d471186fb3326` found 30, and the current post-retirement direct-import list has 28 files (see the final dated section).

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

`server/app.ts` mounts the remaining transitional Express routers for auth, delegates, transactions/recharges, and reports, plus JSON, CORS, correlation, timeout, operation-trace, fallback, and error middleware. Vehicle, subscriber, and staff/people mutation registrations have been removed; their Hono replacements are the supported paths and the Express fallback returns 404.

## Known Express-only or maintenance capabilities

The existing route inventory identifies these Express capabilities as requiring an explicit disposition before removal:

- `POST /api/garages/reconciliation` — **Express retired in this slice** after read-only Hono contract/no-write coverage, focused retirement assertions, full local gates, and explicit owner approval; Hono remains the supported diagnostic path.
- `POST /api/garages/dashboard-summary/rebuild` — **Express retired in this slice** after the isolated synthetic operational rehearsal and full local gates; Hono is the sole supported owner.
- `POST /api/garages/rebuild-projections` — **Express retired in the 2026-10-12 source slice.** Hono remains the supported owner at the same path; the local Hono contract and Express-app 404 regression remain. The isolated rehearsal remains prepared but not dispatched. **Per the approved finite closeout, an authenticated Firestore rehearsal is not a prerequisite for source retirement**; do not dispatch it or access Firestore for this work.
- `POST /api/auth/invalidate-all-sessions`
- `POST /api/recharge-requests/create` — Hono now enforces garage/delegate scope, payload sanitization, request-type/amount validation, transactionally idempotent creation, and the shared financial rate limit. Dual-runtime compatibility remains until the Express route census/retirement pass; this correction does not retire the Express financial surface.

These are not ordinary frontend routes. H9 must either preserve them behind a supported Hono maintenance route or explicitly retire them with documented synthetic coverage and an owner-approved source disposition. A real-data operation is a separate decision, not an implicit source-retirement gate.

Retired in the current H9 slice: the Express `GET /api/delegates/dashboard` handler. The frontend already calls this exact path, and the Hono Worker owns the replacement with the same response shape plus explicit PIN-field sanitization. Fetch-native coverage now verifies scoped delegate-session resolution, the delegate and two garage sources, the request list, and absence of PIN fields. The explicit `dev:express` fallback no longer serves this legacy dashboard alias; all other delegate mutation and settlement routes remain mounted.

Retired in this slice: the Express `GET /api/garages/:id/dashboard-summary` handler. It was read-only but returned operational and revenue metrics, so removal was gated on Hono coverage for live projection data, fresh stored-summary fallback, stale-summary rejection, and cross-garage denial. The Hono route remains the active frontend path; garage mutations and admin projection/reconciliation maintenance routes remain mounted.

Also retired in this slice: the Express `POST /api/garages/trial-decision` handler. This non-financial state transition is now covered by Fetch-native tests for owner continuation, admin clearing, activity-log creation, invalid decisions, and staff denial. The Hono route remains the active path; financial, delegate-settlement, and remaining maintenance mutations remain mounted.

Also retired in this slice: both duplicate Express fair-use handlers (`POST /api/garages/:id/extend-fair-use` and `POST /api/admin/garages/:id/extend-fair-use`). Hono now owns both paths. Retirement was gated on Hono boundary coverage plus dual-runtime idempotency replay and key-reuse tests; the frontend continues using the legacy path as a Hono alias.

Also retired in this H9 continuation: the Express `POST /api/garages/recalculate-cars-inside` handler after synthetic dual-runtime response/state, authorization, and malformed-input characterization and explicit owner authorization to transfer maintenance ownership. The Hono handler remains supported and tested; the Express fallback now returns 404 for this path. Focused post-retirement validation passed **5 files / 66 tests**; the full local suite passed **103 files / 609 tests**, along with lint, builds, `npm run ci:check`, maintainability, and whitespace checks. Express itself and all other maintenance routes remain unchanged.

Added the Fetch-native Hono mirror for `POST /api/garages/dashboard-summary/rebuild` with dual-runtime synthetic tests for projection aggregation, event consistency and day boundaries, persisted summary shape, authorization, and errors. Focused characterization passes **10 tests**; the full local suite passes **103 files / 613 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks. The Express route remains available as fallback/characterization; no preview or live rebuild was executed.

Added the Fetch-native Hono mirror for `POST /api/garages/rebuild-projections` with synthetic Express/Hono tests for event replay, Cairo-day boundaries, event watermark, merge preservation, authorization, invalid input, and repeat-request stability. Focused validation passed **3 files / 34 tests**; the full suite passed **103 files / 616 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks green. Express remains mounted as fallback/characterization; no real or preview rebuild was run.

The 2026-10-09 operational review found that the preview Worker then used the same Firebase project and Firestore database identifiers as production. That configuration was subsequently replaced with the isolated `rq-hono-preview-isolated` target and verified by the H5 deployment workflow. No authenticated route call or Firestore operation was performed by the current source-closeout slice. The protected projection rehearsal remains prepared but unrun and is not required by the finite source-retirement plan.

At the earlier checkpoint represented by this paragraph, the remaining Express garage handlers were documented in [`docs/H9_SENSITIVE_ROUTE_DISPOSITION.md`](H9_SENSITIVE_ROUTE_DISPOSITION.md). The date-specific route retirements are preserved as historical evidence; the current state is that all garage handlers represented in that matrix are retired from Express, with Hono as owner. This does not retire unrelated Express route groups or the Express runtime.

## Safe H9 sequence

1. **One-pass H9 route/runtime/import/test census completed 2026-10-12:** see the final dated sections. The later operational retirement batch reduces the active Express registration count from 50 to 39 and leaves direct Express route modules only as characterization/test consumers, with the runtime and remaining route groups still active.
2. **Characterization conversion:** add Fetch/Hono equivalents for any still-required Express-only tests; keep Express tests until their replacement coverage passes.
3. **Runtime default decision:** switch local `dev` to Hono only after local development, static serving, and Node adapter checks pass; retain an explicit legacy compatibility command temporarily.
4. **Route retirement:** remove Express routers only in groups whose behavior is covered by shared domain tests and Hono route tests. Do not remove financial or maintenance paths based only on frontend absence.
5. **Dependency removal:** remove `express`, `@types/express`, and related middleware only after the import census reaches zero for required runtime and test code.
6. **Full gate:** run tests, lint, web/Node/Cloudflare builds, CI, maintainability, and whitespace checks; perform only non-mutating preview health/version checks if a preview deployment is required. Do not perform production smoke, authenticated preview operations, Firestore rehearsal, or rollback mutation as part of this source migration.

## First reversible slice

The first implementation slice should be **test and runtime decoupling, not Express deletion**:

- Identify tests whose assertions are already covered by Worker/Fetch suites.
- Add or strengthen Fetch-native tests for the shared session and route contracts.
- Keep the Express comparison suite as a characterization guard during this slice.
- Do not change production configuration, Firestore rules, or business policy. A migration correction to enforce the already-documented Hono/Express authorization, validation, idempotency, rate-limit, or 24-hour session contract is in scope when backed by synthetic tests.

The first slice added Fetch-native Worker coverage for valid garage-session refresh and expiry in `src/__tests__/workerSessionRoutes.test.ts`, while retaining the five Express session characterization tests. The focused pair passes **2 files / 11 tests**. The Hono implementation intentionally treats the security session as authoritative during refresh and returns the Hono `error` envelope for expiry; the older Express suite remains the record of the transitional runtime's legacy behavior and is not relabeled as identical. The second slice makes `npm run dev` Hono-first and preserves `npm run dev:express` as the explicit fallback. The third slice retires `server/cloudRun.ts` and `build:cloudrun`; Dockerfile and Express local/container compatibility remain until their consumers are separately retired. The fourth slice retires the redundant Express delegate dashboard handler after focused Hono replacement coverage passed (**3 files / 22 tests**); financial, settlement, and maintenance routes remain untouched. The fifth slice strengthens Hono garage-summary coverage for stored/live/stale data and scope denial. The sixth slice retires the Express garage dashboard-summary handler after the expanded Hono authorization matrix passed (**3 files / 36 tests**); financial writes and projection/reconciliation maintenance routes remain untouched. The seventh slice retires the Express trial-decision handler after Fetch-native state-transition and authorization coverage passed (**4 files / 52 tests**); remaining financial and maintenance mutation surfaces are unchanged.

## H9 status

**H9 in progress.** First closeout source checkpoint `c1d186e35c37a600d7929923726fde88930fc9d1` hardened Hono recharge creation and aligned PIN-session authorization; its recorded local gate passed **104 files / 647 tests**. The complete one-pass census at `51f6f5445fd04734a2743d7f4f4d471186fb3326` found 51 Express routes; the current slice retires only the Express projection-rebuild route, leaving 50 API registrations and 28 direct Express imports. Previously retired Cloud Run, delegate dashboard, garage dashboard-summary/rebuild, trial-decision, cars-inside recalculation, garage-update, and reconciliation Express surfaces remain retired. Hono parity gaps still block broader auth/session, financial, reporting/middleware, vehicle/staff, and whole-runtime deletion; local Node/Vite/static/container consumers remain. The earlier isolated dashboard-summary run and rollback are documented above; the prepared projection rehearsal was not dispatched. The H8 production release and rollback tag remain unchanged.

### Read-only garage reconciliation slice — 2026-10-09

`server/cloudflareWorker.ts` exposes the Admin-only `POST /api/garages/reconciliation` capability through the Fetch-native Worker. The implementation uses the existing pure `reconcileGarageState` reducer, performs only garage/vehicle/daily-stat/event reads, applies the Africa/Cairo day boundary, and preserves the former Express response/error contract. Fetch-native tests cover response shape, day boundaries, authorization, validation, missing-garage behavior, and absence of writes. With explicit owner approval, only the Express registration was removed; the Express fallback returns 404 and Hono remains the supported owner.

Focused route/domain/authorization validation passed before retirement; the post-retirement focused and full local gate results are recorded in the succession handoff. No preview/live mutation or production deployment was performed.

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


### Isolated Hono preview wiring — 2026-10-10

The former preview/production Firebase identifier collision is now corrected on `migration/unified-hono`: `wrangler.preview.toml` targets project `rq-hono-preview-isolated` and database `(default)`, while `src/firebase.ts` selects a separate preview web-app config only when `VITE_RQ_FIREBASE_TARGET=preview`. The selector has focused tests for explicit preview selection and production-safe fallback. The already-existing isolated Firebase project now has a dedicated web app and Anonymous Auth enabled; its production counterpart (`Default Gemini Project`) was not changed. Cloudflare Pages project `rq` already has the preview target variable scoped to branch previews, and its production settings were left untouched.

The preview-only service account key is stored as GitHub Actions environment secret `FIREBASE_SERVICE_ACCOUNT_JSON` under `cloudflare-h5-preview`; the preview Worker workflow now injects it only into `rq-hono-preview` using `wrangler.preview.toml`. The downloaded local key file was securely deleted after storage. The value was never printed or committed. No Worker deployment or authenticated Firestore operation has yet been performed by this slice.

Validation: **104 test files / 643 tests passed**, including 37 focused selector and garage route/parity tests; lint, Cloudflare Worker build, production-mode frontend build with the preview target, `npm run ci:check`, maintainability, and whitespace checks passed. The first focused run exposed a race-assumption in the synthetic concurrent-create test (it assumed the first two array entries would win the rate-limit race); the assertion now checks the two requests actually receiving 200, while still requiring exactly two successes, one 429, and matching created records.

**Remaining staging gates:** verify the preview service account’s Firestore role assignment; deploy and verify the repository Firestore Rules and indexes to the isolated project only; prepare synthetic-only test records; then deploy the preview branch and run H9 route/auth/storage smoke tests against those records. Until those gates and route-specific telemetry/owner review pass, keep the remaining Express maintenance handlers mounted. No production configuration, Pages deployment, Worker, data, or H8 rollback tag was changed.


### Isolated preview IAM and deployment checkpoint — 2026-10-10

The isolated Hono preview is now wired to Firebase project `rq-hono-preview-isolated` and Firestore `(default)`, distinct from production project `gen-lang-client-0091669619` (`Default Gemini Project`). The preview-only Worker service account `rq-hono-preview-worker@rq-hono-preview-isolated.iam.gserviceaccount.com` was granted only the predefined **Cloud Datastore User** (`roles/datastore.user`) role in the isolated project; no production IAM, service-account credential, production Firebase configuration, Pages production setting, Worker, data, or H8 release/rollback target was changed.

The H5 Preview Worker run [38067730937](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38067730937) passed its bundle checks, set the preview-only Worker secret from the protected `cloudflare-h5-preview` environment, deployed `rq-hono-preview`, and passed the public health/version and unauthenticated-protection smoke checks. Production Gate [38067730936](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38067730936) passed candidate verification on `migration/unified-hono`; it did not deploy production. Current source head is `8270138` (`Isolate Hono preview Firebase target`), and the worktree was clean at verification.


**Gate status:** isolated Firebase target and Worker service-account data-access role are established, but no authenticated Firestore request or data operation was made in the H5 run. Subsequent read-only Firebase Console inspection confirmed the isolated database is empty, its Rules remain Firebase’s default deny-all, and it has zero composite indexes. Cloud Shell failed to load after user-approved credential authorization; no Rule or index deployment was performed. The next staging task is to deploy and verify repository Rules/indexes explicitly to `rq-hono-preview-isolated`, then run synthetic-only authenticated H9 route/storage rehearsal. Because `.firebaserc` defaults to production, any Firebase CLI deploy must specify `--project rq-hono-preview-isolated`. Keep the remaining Express maintenance routes mounted until route-specific preview rehearsal, telemetry comparison, and retirement review are complete. H9 remains **IN PROGRESS**; production and `main` remain unchanged.


### Isolated Firestore configuration inspection — 2026-10-10

Read-only Firebase Console inspection confirmed the isolated `(default)` Firestore database exists in `europe-west3` and currently contains no collections/documents. Its deployed Rules are Firebase’s default deny-all policy (`allow read, write: if false;`), not the repository’s `firestore.rules`; the Indexes tab shows **0** composite indexes, while the repository defines eight. No rules, indexes, or data were changed during inspection. Before authenticated client/storage rehearsal, deploy and verify the repository’s reviewed Rules and indexes to `rq-hono-preview-isolated` only (never rely on `.firebaserc`’s production default); then use synthetic-only fixtures and cleanup evidence. This is still not production data validation.


### H9 isolated Firestore deployment and synthetic rehearsal — 2026-10-11 status

The migration candidate at `f20953feafd1ae4b75d238a1cb0357bdfdb8baab` has a separate preview Firebase target, `rq-hono-preview-isolated`. Exact-candidate H5 Preview Worker [38072430923](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38072430923) and Production Gate [38072430917](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38072430917) passed. The isolated OIDC Firebase Rules/index workflow [38072430952](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38072430952) reports successful deployment; Firebase Console verification that all eight indexes are READY remains pending.

A synthetic-only `/api/garages/create` rehearsal returned HTTP 429 on two probes. A subsequent read-only check found no garage fixture, so no garage was created to our knowledge; the route rehearsal remains incomplete and supplies no operational parity or retirement evidence. One staging rate-limit document with `count: 1` was observed; its expiry was already past when the handoff was written, and its delete confirmation was canceled. A synthetic anonymous Auth identity may remain in the isolated Firebase project. Exact cleanup paths and verification caveats are in the current `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` section dated 2026-10-11.

No Express handler was retired during this operational continuation. Keep all remaining sensitive Express handlers and the compatibility runtime mounted pending a diagnosed staging result, route-specific evidence, and a separate retirement review. Production and `main` were not changed.


### Isolated staging verification addendum — 2026-10-12

Firebase Console read-only verification was completed against the explicitly isolated project `rq-hono-preview-isolated` and Firestore `(default)`. The repository Rules are published there, but the Manual Indexes tab reports **0 of 0**, so the expected eight composite indexes are not READY. The Firestore root is empty and the exact documented rehearsal cleanup paths are absent; the synthetic anonymous Auth account remains untouched. Local focused garage-create/rate-limit parity validation passed **2 files / 48 tests**, including reset, cap, concurrency, fail-closed, idempotency, and dual-runtime behavior. The two staging 429s remain unexplained and were not retried. Express remains mounted for `/api/garages/create` and all other sensitive routes; no retirement or operational rehearsal is authorized by this evidence.


### Isolated index and preview pairing verification — 2026-10-12

The guarded OIDC workflow [38205082036](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38205082036) successfully deployed the repository configuration to `rq-hono-preview-isolated` only. Firebase Console now shows **8 of 8** Manual indexes **Enabled**, and Rules remain published. The preview Worker returned healthy preproduction/version responses and unauthenticated garage-create returned 401. This closes the index/pairing blocker but does not resolve the earlier authenticated 429s; no authenticated retry or Express route retirement was authorized by this staging evidence alone.


### Authenticated 429 diagnosis and reconciliation audit — 2026-10-12

Read-only Cloudflare Worker telemetry confirmed the two synthetic create probes were Worker-generated 429 responses, not runtime failures; the limiter returns 429 only for an already exhausted per-actor bucket. A daily route summary found eight POST create 429s and six preflight 204s, so the two probes did not exhaust a fresh bucket. The historical counter cannot be reconciled because the isolated Firestore root is now empty, and no rate-limit mutation or retry was made. The local reconciliation audit passed **1 file / 35 tests**, including three read-only parity cases. This diagnosis did not itself authorize retirement; the Express reconciliation route was retired later under the explicit owner approval and evidence recorded below.


### Garage-create Express retirement — 2026-10-12

The owner explicitly approved retiring only the Express `POST /api/garages/create` registration. The Hono route remains the sole supported owner; the Express fallback now returns 404. The retired implementation and its now-unused imports were removed without changing the Hono Worker, Express runtime, deletion route, Firebase/Cloudflare configuration, or any production boundary.

The characterization suite was converted from dual-runtime create comparisons to Hono contract/no-write coverage plus an explicit Express 404 assertion. Coverage retains role denial, 30-request limit and expiry reset, concurrent limit serialization, fail-closed limiter storage, Admin trial/activity-log details, delegate attribution/quota, duplicate-PIN no-write behavior, and idempotency validation/replay/conflict/concurrency. Focused validation passed **2 files / 37 tests**. The final repository gates passed **104 files / 638 tests**, TypeScript lint, web/Node/Cloudflare builds, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`.

No authenticated preview create retry, Firebase mutation, production deployment, `main` merge, destructive operation, or branch deletion occurred. The next sensitive route remains `POST /api/garages/delete`; its documented Firestore lease/rollback review is still required before retirement.


### Garage-delete Express retirement — 2026-10-12

The owner explicitly approved retiring only the Express `POST /api/garages/delete` registration. The Hono route remains the sole supported owner; the Express fallback now returns 404. The retired handler and deletion-only imports were removed without changing the Hono Worker, Express runtime, other garage routes, Firebase/Cloudflare configuration, or production boundaries.

The deletion characterization was converted from dual-runtime comparisons to Hono contract/no-write/lease coverage plus an explicit Express 404 assertion. Coverage retains scoped owned-data cleanup, unrelated-record preservation, audit/job completion, the 30-request limit, multi-page lease renewal, overlap rejection while a renewed lease is active, expired-lease reclamation, Admin authorization, and validation. Focused validation passed **2 files / 39 tests**. The final repository gates passed **104 files / 636 tests**, TypeScript lint, web/Node/Cloudflare builds, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`.

No live or preview destructive rehearsal, Firebase mutation, production deployment, `main` merge, authenticated preview operation, or branch deletion occurred. The next sensitive routes remain projection maintenance (`POST /api/garages/dashboard-summary/rebuild` and `POST /api/garages/rebuild-projections`) with their documented isolated-operational-rehearsal gates.


### Dashboard-summary isolated rehearsal — 2026-10-12 status

The current migration commit `217124a` deployed successfully to the isolated preview Worker via GitHub Actions run [38208591518](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38208591518); health/version and unauthenticated protection smoke passed. The approved synthetic dashboard-summary rehearsal did not perform any Firestore operation because the local Firebase CLI/Wrangler session is unauthenticated and the configured deployment workflow does not expose a staging admin/operator credential for the protected rebuild route. No records were seeded, read, rebuilt, or rolled back. Express `POST /api/garages/dashboard-summary/rebuild` remains mounted pending a staging-only seed/read/restore mechanism and Admin-authorized route invocation. Credentials must remain in configured environment/session mechanisms and must not be pasted into chat.

### Dashboard-summary rebuild Express retirement — 2026-10-12
Following successful isolated rehearsal run [38210800814](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38210800814) against `rq-hono-preview-isolated`, only Express `POST /api/garages/dashboard-summary/rebuild` was removed. Hono remains the supported owner; the Express fallback returns 404. The isolated seed/rebuild/verify/rollback workflow passed with the expected 2 buckets, 3 events, consistent event reconciliation, persisted summary, and exact restoration. Focused validation passed **2 files / 35 tests**. Full gates passed **104 files / 635 tests**, lint, all builds, CI/release checks, maintainability, and whitespace checks. No production, `main`, destructive, or branch-deletion operation occurred.

## CURRENT CONTINUATION STATE — 2026-10-12
Historical checkpoint entries above preserve what was true at the time they were written. The current state is superseded by the completed one-pass census below: Express `POST /api/garages/rebuild-projections` is also retired; Hono owns the path and the real Express app returns 404. The projection rehearsal remains unrun and is not a source-retirement gate. Continue only on `migration/unified-hono`; never use production Firebase for staging operations.


## 2026-10-12 completed one-pass census and first source retirement

**Census snapshot:** six-area read-only source review at pre-retirement commit `51f6f5445fd04734a2743d7f4f4d471186fb3326`. It identified **51** Express method/path registrations; this source slice removes the sole Express garage projection-rebuild registration, leaving **50 active Express routes**. The Hono Worker handler remains. No Firebase/Firestore operation, rehearsal dispatch, production action, or `main` change was part of the census or retirement.

### Active Express route inventory after the source cut

| Route group | Count | Active Express registrations |
|---|---:|---|
| `server/app.ts` inline | 21 | `GET /api/health`; `GET /api/version`; `GET /api/system-config`; `POST /api/admin/update-system-config`; `POST /api/supervisors/create`; `POST /api/staff/create`; `POST /api/people/update-pin`; `POST /api/supervisors/update`; `POST /api/supervisors/delete`; `POST /api/staff/update`; `POST /api/staff/delete`; `POST /api/admin/packages/create`; `POST /api/admin/packages/delete`; `POST /api/admin/announcements/create`; `POST /api/admin/announcements/delete`; `POST /api/admin/announcements/toggle`; `POST /api/admin/coupons/create`; `POST /api/admin/coupons/update`; `POST /api/admin/coupons/delete`; `POST /api/recharge-requests/create`; `POST /api/activity-logs/add` |
| Auth and sessions | 11 | `POST /api/auth/verify-pin`; `POST /api/auth/check-pin-availability`; `GET /api/auth/sessions`; `DELETE /api/auth/sessions/:sessionKey`; `POST /api/auth/invalidate-all-sessions`; `POST /api/auth/verify-admin-pin`; `POST /api/auth/claim-admin-session`; `POST /api/auth/release-admin-session`; `POST /api/admin/update-pin`; `POST /api/auth/validate-or-refresh-session`; `POST /api/auth/release-session` |
| Vehicles | 3 | `POST /api/vehicles/check-in`; `POST /api/vehicles/check-out`; `POST /api/vehicles/delete` |
| Subscribers | 4 | `POST /api/subscribers/add`; `POST /api/subscribers/renew`; `POST /api/subscribers/update`; `POST /api/subscribers/delete` |
| Delegates | 4 | `POST /api/delegates/create`; `POST /api/delegates/update`; `POST /api/delegates/settle-account`; `POST /api/delegates/delete` |
| Transactions/recharges | 6 | `POST /api/transactions/recharge-garage`; `POST /api/transactions/approve-recharge-request`; `POST /api/transactions/reject-recharge-request`; `POST /api/transactions/admin-topup-balance`; `POST /api/transactions/garage-self-subscribe`; `POST /api/transactions/use-referral-reward` |
| Reports | 1 | `GET /api/reports/financial` |
| Garages | 0 | `POST /api/garages/rebuild-projections` is retired from Express in this slice; Hono remains the supported owner. |
| **Total active Express registrations** | **50** | Count is by unique HTTP method and path; route aliases are separate registrations only where shown in the source. |

The Hono candidate now registers **`POST /api/auth/invalidate-all-sessions`**, closing the only route-registration absence found in the census. The current isolated preview deployed this candidate, and the unauthenticated route check returned 401. This does not by itself prove full cross-runtime parity; the remaining material differences below keep the Express runtime and unresolved route surfaces in place.

### Direct Express-import files after retirement

A fresh source search after this change finds **28 files** directly importing `express` (including type-only test imports):

- Runtime and route code (18): `server/app.ts`; `server/auth/activeSessions.ts`; `server/auth/adminAuth.ts`; `server/auth/pinAuth.ts`; `server/auth/sessionLifecycle.ts`; `server/middleware.ts`; `server/operationTrace.ts`; `server/routes/auth.ts`; `server/routes/delegates.ts`; `server/routes/recharges/directRecharge.ts`; `server/routes/recharges/index.ts`; `server/routes/recharges/manualTopup.ts`; `server/routes/recharges/referralRewards.ts`; `server/routes/recharges/requestApproval.ts`; `server/routes/recharges/selfSubscription.ts`; `server/routes/reports.ts`; `server/routes/subscribers.ts`; `server/routes/vehicles.ts`.
- Express characterization/integration tests (10): `server/auth/pinAuthRoleScope.test.ts`; `server/auth/sessionLifecycleRoleRetirement.test.ts`; `server/authMaintenanceAuthorization.integration.test.ts`; `server/authSessionRoutes.integration.test.ts`; `server/financialReportAuthorization.integration.test.ts`; `server/garageCreationAuthorization.integration.test.ts`; `server/garageMaintenanceAuthorization.integration.test.ts`; `server/manualCreditRoutes.integration.test.ts`; `server/subscriberRoutes.integration.test.ts`; `server/vehicleGarageScopeAuthorization.integration.test.ts`.

The removed `server/routes/garages.ts` and direct Express import in `server/garageReconciliationParity.integration.test.ts` are no longer in that list. Additional **indirect** Express consumers remain: `server.ts` / Vite host composition, `server/h5DualRuntime.contract.test.ts`, `server/garageReconciliationParity.integration.test.ts`, `src/__tests__/corsSecurity.test.ts`, and test files that import the full app. `server/api.test.ts` covers the Hono Fetch/Node adapter and is not Express route coverage.

### Runtime, dependency, and deployment consumers that remain

`package.json` still declares `express` `^5.2.1`, `@types/express` `^5.0.6`, `cors` `^2.8.6`, and `@types/cors` `^2.8.19`. `dev`/`dev:hono` select the Hono API through `server/nodeAdapter.ts`, but `server.ts` still imports `server/app.ts` and uses Express as the Vite development middleware host. `dev:express` remains the explicit fallback; `build:server` emits `dist/server.cjs`, and `start` runs it. Keep Vite middleware, production `express.static(dist)` plus SPA fallback, API dispatch, `0.0.0.0` binding, and Fetch-to-Node adapter behavior until a replacement is tested. The Cloudflare Worker build/deployment is a separate Hono path and must remain intact. The generic `Dockerfile` is still a tracked Node/container consumer; source inspection suggests a Vite/dev-dependency packaging risk, but no container reproduction was run, so do not claim that consumer is safely removable.

### Parity blockers for broader retirement

- **Auth/session:** the current Hono candidate implements Admin-only `invalidate-all-sessions` with root/device session invalidation, entity-marker clearing, batch chunking, and in-memory regression coverage. Legacy phone-plus-PIN behavior and PIN-availability rate limiting still differ; refresh-marker rejection, per-device heartbeat freshness, and current-session list/revoke semantics lack complete cross-runtime proof.
- **Financial/delegate:** Hono balance-top-up approval and direct top-up omit Express `manual_credit_ledger` writes; multiple Hono financial mutations lack Express-equivalent rate limiting, and activity-log details differ. Financial acceptance remains OPEN/BLOCKED; do not retire this surface based on frontend absence.
- **Reports and shared middleware:** report filter validation/error envelopes differ; CORS allowlists and correlation-ID validation differ; Hono has no equivalent 15-second timeout or durable operation-trace write, and generic 404/error behavior is not proven equivalent. Preserve CORS, correlation/operation IDs, timeout, tracing/event linkage, and error/fallback semantics until ported and tested.
- **Vehicles/staff:** vehicle check-in reads subscriber state on a different side of the transaction boundary; staff multi-document/PIN writes and their cross-runtime behavior are not fully characterized.
- **Evidence boundary:** Hono being the production Worker does not prove parity for the local Express fallback. The census was source/test inspection, not a live-service validation; recorded test totals must be tied to the actual checkpoint where they ran.

### Projection rebuild Express retirement

Removed the Express-only router module `server/routes/garages.ts` and its mount in `server/app.ts`; Hono continues to own `POST /api/garages/rebuild-projections` at `server/cloudflareWorker.ts`. Retained Hono contract tests for replay-derived fields, event watermark, Cairo-day boundaries, merge preservation, retries, Admin authorization, invalid input, and no-write denials. Updated the Express maintenance and garage fallback tests to instantiate the real `createApp()` composition and assert 404 for retired garage routes. Focused validation after the source cut passed **3 files / 39 tests**. The previously prepared live projection rehearsal remains **NOT DISPATCHED** and is not a prerequisite for this source-only retirement. This is the only additional route retirement in this slice; H9 and full Express runtime removal remain **IN PROGRESS** pending resolution of the blockers above.


**Post-retirement local validation:** `npm test` passed **104 files / 646 tests**; `npm run lint`, `npm run build` (Vite, Node server, Cloudflare Worker), `npm run ci:check` including production artifact/release checks, `npm run maintainability:check`, and `git diff --check` all passed. Generated `dist/` and `build/` outputs were removed. The final pushed head's GitHub workflows remain to be verified; H9 is still in progress.


**Exact-head remote checks:** source commit `0ce5c0bb24e78bb844a057714dc60b7be2cfc0b8` passed Production Gate [38234266950](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38234266950) and H5 Preview Worker [38234267020](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38234267020). H5 deployed `rq-hono-preview`; the public health/version and unauthenticated-protection smoke tests passed. The opt-in H9 projection rehearsal was **skipped**. Production deployment was not run.


## Hono `invalidate-all-sessions` mirror — deployed isolated candidate, 2026-10-12

Source commit `45afc439` implements the Admin-only Hono route with the same four session collections and counters as Express. It invalidates root/device session records, clears entity markers, preserves unrelated account state, chunks Firestore batches, and causes the active Admin session to fail on the next request. Synthetic tests passed **2 files / 18 tests**; the full local gate passed **104 files / 648 tests**, lint, Vite/Node/Cloudflare builds, CI/release/artifact checks, maintainability, and whitespace. Production Gate [38236662149](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38236662149) passed; initial H5 run [38236662110](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38236662110) stopped before deployment because Cloudflare blocked normal secret editing while the latest Worker version was unpublished after an interrupted prior deployment. Workflow fix commit `84ee5bd` switched the isolated H5 workflow to `wrangler versions secret put`; exact-head Production Gate [38237146693](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38237146693) and H5 Preview Worker [38237146718](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38237146718) passed. The preview deployed, `/api/health` and `/api/version` returned 200, and unauthenticated `POST /api/auth/invalidate-all-sessions` returned 401. The manual projection rehearsal was skipped; no authenticated invalidation or production operation occurred. This is a Hono parity addition only: Express route count remains 50 and this does not authorize retiring the active Express registration. Other auth/session, financial, reporting/middleware, vehicle/staff, and local-runtime blockers remain.


### Auth/session parity slice — 2026-10-12

Commit `fd9704e873b5cfb1e253fd1e8b6fce0642fce457` closes three bounded Hono gaps without removing Express: legacy Delegate phone-plus-PIN login now scopes by phone and returns sanitized account data; PIN availability now uses the shared Worker Durable Object account/IP limiter; and session refresh now treats the persisted session role/entity and entity `activeSessionIds` marker as authoritative, revoking stale device sessions instead of refreshing them. Synthetic regression coverage passed **5 files / 36 focused tests**. The full local gate passed **104 files / 651 tests**, TypeScript validation, Vite/Node/Cloudflare builds, CI/release/artifact checks, maintainability, and whitespace validation. Existing framework deprecation and React `act(...)` test diagnostics remain non-failing warnings.

Express remains a compatibility runtime with its existing auth/session routes and direct imports. No Express route was retired in this slice; financial, reporting/middleware, vehicle/staff, and local-serving parity blockers remain open. No Firebase/Cloudflare data operation, preview mutation, `main` change, or production deployment occurred.


The follow-up commit `bbaa417` also corrected Hono session-list `isCurrent` semantics: the authenticated caller’s session is marked current, rather than the entity’s preferred root session, when multiple devices are active. Focused validation passed **2 files / 24 tests** and the final full local gate passed **104 files / 651 tests** with build, CI/release, maintainability, and whitespace checks green.


### Shared runtime observability parity — 2026-10-12

Commit `5af1e8e` closes a Hono/Express runtime contract gap: Express now normalizes and exposes `X-Operation-ID` on successful responses, errors, and unknown-route 404s, and persists the same normalized operation ID in operation-trace context. Dual-runtime characterization covers unauthenticated error IDs, unknown-route status/header behavior, allowed/disallowed CORS, and existing mutation authorization. Focused validation passed **2 files / 10 tests**; the final full local gate passed **104 files / 654 tests**, TypeScript validation, Vite/Node/Cloudflare builds, CI/release/artifact checks, maintainability, and whitespace validation. No route was retired, no data was mutated, and production/`main` remain unchanged.


### Financial manual-credit ledger parity — 2026-10-12

Commit `2646256` closes a concrete Hono/Express financial parity gap. Hono now writes `manual_credit_ledger` records for both approved `balance_topup` recharge requests and direct admin wallet top-ups, matching the Express transaction behavior while preserving atomic transaction/idempotency semantics. Focused validation passed **2 files / 23 tests**; the final local gate passed **104 files / 655 tests**, TypeScript validation, Vite/Node/Cloudflare builds, CI/release/artifact checks, maintainability, and whitespace validation. No financial write, preview mutation, production change, or route retirement was performed.


### Consolidated vehicle, subscriber, and staff retirement batch — 2026-10-12

Commit `69ec576` removes the Express route registrations and app mounts for:

- `POST /api/vehicles/check-in`
- `POST /api/vehicles/check-out`
- `POST /api/vehicles/delete`
- `POST /api/subscribers/add`
- `POST /api/subscribers/renew`
- `POST /api/subscribers/update`
- `POST /api/subscribers/delete`
- `POST /api/staff/create`
- `POST /api/staff/update`
- `POST /api/staff/delete`
- `POST /api/people/update-pin`

Hono remains the supported owner for all listed paths. The Express fallback is explicitly verified to return `404 API route not found`, including unauthenticated and backend-operator requests. The batch added route-level evidence for vehicle check-in garage scoping, checkout idempotent replay, subscriber cross-garage denial and immutable-plate protection, and staff cross-garage update/delete no-write behavior. Focused validation passed **8 files / 78 tests**. The full integration gate passed **104 files / 657 tests**, TypeScript validation, Vite/Node/Cloudflare builds, production artifact checks, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`.

The Express route modules `server/routes/vehicles.ts` and `server/routes/subscribers.ts`, plus their direct integration tests, are retained temporarily as characterization fixtures for the remaining local compatibility/runtime cleanup; they are no longer mounted by `server/app.ts` and are not supported request paths. The Express runtime, delegates, transactions/recharges, reports, auth/session, and other explicitly retained compatibility consumers remain. Active Express registrations are now **39**. No production, `main`, preview mutation, Firestore operation, or deployment occurred.
