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

- `POST /api/garages/reconciliation` — **Express retired in this slice** after read-only Hono contract/no-write coverage, focused retirement assertions, full local gates, and explicit owner approval; Hono remains the supported diagnostic path.
- `POST /api/garages/dashboard-summary/rebuild` — **Express retired in this slice** after the isolated synthetic operational rehearsal and full local gates; Hono is the sole supported owner.
- `POST /api/garages/rebuild-projections` — a Fetch-native Hono mirror and synthetic Express/Hono replay/retry characterization are present on `migration/unified-hono`; Express remains mounted pending the finite source/route census. Isolated rehearsal tooling is prepared but not dispatched. **Per the approved finite closeout, an authenticated Firestore rehearsal is not a prerequisite for source retirement**; do not dispatch it or access Firestore for this work.
- `POST /api/auth/invalidate-all-sessions`
- `POST /api/recharge-requests/create` — Hono now enforces garage/delegate scope, payload sanitization, request-type/amount validation, transactionally idempotent creation, and the shared financial rate limit. Dual-runtime compatibility remains until the Express route census/retirement pass; this correction does not retire the Express financial surface.

These are not ordinary frontend routes. H9 must either preserve them behind a supported Hono maintenance route or explicitly retire them with documented synthetic coverage and an owner-approved source disposition. A real-data operation is a separate decision, not an implicit source-retirement gate.

Retired in the current H9 slice: the Express `GET /api/delegates/dashboard` handler. The frontend already calls this exact path, and the Hono Worker owns the replacement with the same response shape plus explicit PIN-field sanitization. Fetch-native coverage now verifies scoped delegate-session resolution, the delegate and two garage sources, the request list, and absence of PIN fields. The explicit `dev:express` fallback no longer serves this legacy dashboard alias; all other delegate mutation and settlement routes remain mounted.

Retired in this slice: the Express `GET /api/garages/:id/dashboard-summary` handler. It was read-only but returned operational and revenue metrics, so removal was gated on Hono coverage for live projection data, fresh stored-summary fallback, stale-summary rejection, and cross-garage denial. The Hono route remains the active frontend path; garage mutations and admin projection/reconciliation maintenance routes remain mounted.

Also retired in this slice: the Express `POST /api/garages/trial-decision` handler. This non-financial state transition is now covered by Fetch-native tests for owner continuation, admin clearing, activity-log creation, invalid decisions, and staff denial. The Hono route remains the active path; financial, vehicle, subscriber, delegate-settlement, and maintenance mutations remain mounted.

Also retired in this slice: both duplicate Express fair-use handlers (`POST /api/garages/:id/extend-fair-use` and `POST /api/admin/garages/:id/extend-fair-use`). Hono now owns both paths. Retirement was gated on Hono boundary coverage plus dual-runtime idempotency replay and key-reuse tests; the frontend continues using the legacy path as a Hono alias.

Also retired in this H9 continuation: the Express `POST /api/garages/recalculate-cars-inside` handler after synthetic dual-runtime response/state, authorization, and malformed-input characterization and explicit owner authorization to transfer maintenance ownership. The Hono handler remains supported and tested; the Express fallback now returns 404 for this path. Focused post-retirement validation passed **5 files / 66 tests**; the full local suite passed **103 files / 609 tests**, along with lint, builds, `npm run ci:check`, maintainability, and whitespace checks. Express itself and all other maintenance routes remain unchanged.

Added the Fetch-native Hono mirror for `POST /api/garages/dashboard-summary/rebuild` with dual-runtime synthetic tests for projection aggregation, event consistency and day boundaries, persisted summary shape, authorization, and errors. Focused characterization passes **10 tests**; the full local suite passes **103 files / 613 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks. The Express route remains available as fallback/characterization; no preview or live rebuild was executed.

Added the Fetch-native Hono mirror for `POST /api/garages/rebuild-projections` with synthetic Express/Hono tests for event replay, Cairo-day boundaries, event watermark, merge preservation, authorization, invalid input, and repeat-request stability. Focused validation passed **3 files / 34 tests**; the full suite passed **103 files / 616 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks green. Express remains mounted as fallback/characterization; no real or preview rebuild was run.

The 2026-10-09 operational review found that the preview Worker then used the same Firebase project and Firestore database identifiers as production. That configuration was subsequently replaced with the isolated `rq-hono-preview-isolated` target and verified by the H5 deployment workflow. No authenticated route call or Firestore operation was performed by the current source-closeout slice. The protected projection rehearsal remains prepared but unrun and is not required by the finite source-retirement plan.

The remaining Express garage handlers are documented in [`docs/H9_SENSITIVE_ROUTE_DISPOSITION.md`](H9_SENSITIVE_ROUTE_DISPOSITION.md). They include account creation (now hardened and synthetically characterized across both runtimes), destructive deletion (now lease-protected against overlapping runs and synthetically characterized), entitlement extension, and projection/reconciliation maintenance. The Express `POST /api/garages/update` handler has been retired locally after synthetic coverage and explicit owner approval; Hono remains the supported route.

## Safe H9 sequence

1. **Existing H9 route baseline recorded:** retain this document and the H1 route inventory; the repository-wide Express/runtime/import/test census remains open as finite-closeout step 2.
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

**H9 in progress.** Source checkpoint `c1d186e35c37a600d7929923726fde88930fc9d1` hardened Hono recharge creation and aligned the PIN-session authorization path with active-session, 24-hour freshness, and entity-marker checks; local validation passed **104 files / 647 tests** plus all listed gates. A pre-existing dashboard-summary rehearsal auto-triggered on push run [38228265018](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38228265018), executed only against the isolated preview, and reported `rollback: PASS`; its push trigger is now manual-only in this follow-up. Cloud Run-specific entrypoint/build support, the redundant Express delegate dashboard handler, the Express garage dashboard-summary handler, the Express dashboard-summary rebuild handler, the Express trial-decision handler, the Express cars-inside recalculation handler, the Express garage-update handler, and the Express reconciliation handler are retired. Express remains required for local/container compatibility, remaining route groups, and characterization tests. The H8 production release and rollback tag remain unchanged.

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
Historical checkpoint entries above preserve what was true at the time they were written. The current state is: Express `POST /api/garages/dashboard-summary/rebuild` is retired; the next candidate is Express `POST /api/garages/rebuild-projections`, which remains mounted pending its own isolated rehearsal, route review, and full gates. Continue only on `migration/unified-hono` and never use production Firebase for staging operations.
