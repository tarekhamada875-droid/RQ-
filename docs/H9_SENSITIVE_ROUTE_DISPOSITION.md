# H9 Sensitive Express Route Disposition

**Status:** H9 boundary record  
**Branch:** `migration/unified-hono`  
**Scope:** Remaining Express garage handlers after the safe H9 retirements

## Decision boundary

The low-risk Express compatibility surfaces have been retired only after Hono replacement coverage passed. The remaining garage handlers are not ordinary compatibility aliases: they create accounts, change financial/account state, delete data, extend entitlements, or perform projection/reconciliation maintenance. They must not be removed automatically from the explicit Express fallback without route-specific parity evidence and an owner-approved disposition.

## Remaining route matrix

| Express route | Hono replacement | Risk class | Why it remains | Required next evidence |
|---|---|---|---|---|
| `POST /api/garages/create` | `POST /api/garages/create` | Account creation / financial-adjacent | Synthetic coverage includes role scope, PIN uniqueness, delegate quota, trial initialization, matching activity-log `details`, transactional PIN persistence, idempotency replay/conflict/concurrency, and Hono's matching 30-per-user/IP-per-minute transactional rate limit. The Hono limiter fails closed (503) if its storage transaction is unavailable; Express's legacy middleware falls back to process memory. | Keep Express mounted until a separate route-retirement review and explicit approval; no create route has been retired in this slice. |
| `POST /api/garages/delete` | `POST /api/garages/delete` | Destructive / financial-adjacent | Local synthetic dual-runtime tests cover scoped cleanup, audit/job parity, completed-job replay, recovery, overlap, and the shared 30-per-user/IP-per-minute financial limit. A shared transactional claim uses a five-minute renewable lease; an overlapping deletion receives 409, a failed attempt is retryable, and audit/root/job completion is atomic. The current client sends only `garageId`; replay and overlap control are garage-job based. | Keep Express mounted. Verify lease behavior on Firestore and complete operational-owner/rollback review before any retirement. No live/preview destructive rehearsal was run under the local-only boundary. |
| `POST /api/garages/reconciliation` | `POST /api/garages/reconciliation` | Maintenance / diagnostics | Reads event, vehicle, daily-stat, and projection state and reports reconciliation results. The Hono Fetch-native handler and synthetic contract coverage are present on `migration/unified-hono`; Express remains mounted. | Read-only parity coverage is recorded below. Telemetry comparison and operational owner confirmation that Hono is the supported diagnostic path remain open; do not retire Express yet. |
| `POST /api/garages/dashboard-summary/rebuild` | `POST /api/garages/dashboard-summary/rebuild` | Admin projection maintenance | Rebuilds dashboard projection state and writes the summary used by operational and revenue views. The Hono Fetch handler and synthetic Express/Hono characterization now pass on `migration/unified-hono`; Express remains mounted. | Isolated operational rehearsal and separate Express-retirement review remain; no live or preview rebuild was run. |
| `POST /api/garages/rebuild-projections` | `POST /api/garages/rebuild-projections` | Maintenance / projection mutation | Rebuilds daily projections from authoritative event data. The Hono Fetch handler and synthetic Express/Hono replay/retry characterization pass on `migration/unified-hono`; Express remains mounted. | **HOLD:** `wrangler.preview.toml` currently uses the same Firebase project/database identifiers as production. Do not read or mutate preview Firestore until a genuinely isolated synthetic data/auth target is configured and verified; then perform a snapshotted, single-request rehearsal and exact rollback. No preview rebuild was run. |
| `POST /api/garages/:id/extend-fair-use` and `POST /api/admin/garages/:id/extend-fair-use` | Hono handles both paths | Entitlement / financial-adjacent | **Express retired.** Hono is the sole runtime owner after authorization, entitlement, audit, and dual-runtime idempotency evidence passed. | Keep Hono parity and idempotency coverage; no production deployment is implied by this migration-branch change. |

### Read-only reconciliation parity — 2026-10-09

The Hono Worker now registers `POST /api/garages/reconciliation` using the shared `reconcileGarageState` domain reducer. The handler preserves the Express contract for Admin-only maintenance authorization, `garageId` validation, `ADMIN_SDK_NOT_INITIALIZED`/`GARAGE_NOT_FOUND` responses, the Africa/Cairo day window, reads of the garage, inside vehicles, daily stats, and day-bounded events, and the `{ success: true, data: { garageId, date, ...reconciliation } }` response. It performs no writes. The Express handler remains mounted as characterization/fallback coverage.

Fetch-native Worker contract tests cover the successful synthetic reconciliation (including event-window boundaries and no-write verification), unauthenticated and non-Admin denial, backend-operator mutation denial, invalid IDs, and missing garages. A dual-runtime characterization test compares synthetic Express and Hono responses for success, Admin validation/missing-garage errors, and non-Admin denial, while confirming no writes. Focused validation passed **5 files / 64 tests**; the full local suite passed **103 files / 607 tests**, and lint, build, `npm run ci:check`, maintainability, and `git diff --check` passed on the implementation before this documentation update.

This is migration-branch code/test evidence only. It is not proof of operational telemetry equivalence or owner/operational approval to move diagnostics to Hono. **Express retirement remains pending** those items and a separate route-retirement review; no production change is implied.

### Cars-inside recalculation characterization — 2026-10-09

Using only an in-memory Firestore fixture, tests compared the Hono and Express `POST /api/garages/recalculate-cars-inside` implementations for Admin response/state, non-Admin denial, and missing-input validation. This parity evidence was reviewed and the owner explicitly authorized the maintenance-ownership transfer and retirement of only the Express route. The Express registration is now removed; Hono remains the supported owner. Current tests retain the synthetic Hono behavior checks and assert that the Express fallback returns 404 for this route. Focused validation passed **5 files / 66 tests**; the full local suite passed **103 files / 609 tests**, with lint, all builds, `npm run ci:check`, maintainability, and whitespace checks green. No preview or live mutation was performed.

This is a migration-branch-only route retirement. It does not remove Express as a runtime, change other maintenance handlers, merge to `main`, or authorize deployment to production.

### Dashboard-summary rebuild characterization — 2026-10-09

Added an Admin-only Hono `POST /api/garages/dashboard-summary/rebuild` mirror using the existing `calculateDailyProjection`, `aggregateProjectionBuckets`, and `reconcileDashboardSummary` helpers. Synthetic Express/Hono tests compare the computed summary and stored read model, bucket/event counts, Cairo-day event boundaries, legacy differences, authorization denials, invalid dates, and missing-garage errors. Writes are confined to the in-memory Firestore fixture. Focused characterization passes **10 tests** in `server/garageReconciliationParity.integration.test.ts`; the full local suite passed **103 files / 613 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks green. Express remains mounted, and no preview/live rebuild was executed.

### Daily projection rebuild characterization — 2026-10-09

Added an Admin-only Hono `POST /api/garages/rebuild-projections` mirror using the shared `calculateDailyProjection` reducer. Synthetic Express/Hono tests verify event-ledger replay, Cairo-day boundaries, the last-event watermark and document-ID fallback, preservation of unrelated fields on merge, and stable repeated rebuilds without accumulating counts. They also compare authorization and invalid-input responses; all writes are confined to the in-memory Firestore fixture. The focused set passed **3 files / 34 tests**; the full local suite passed **103 files / 616 tests**, with lint, builds, `npm run ci:check`, maintainability, and whitespace checks green. Express remains mounted pending an isolated operational rehearsal and separate retirement review; no real or preview rebuild was run.

### Preview operational-rehearsal hold — 2026-10-09

Configuration review found that `wrangler.preview.toml` and production `wrangler.toml` specify the **same** `FIREBASE_PROJECT_ID` and `FIREBASE_DATABASE_ID`. The H5 workflow deploys a separate Worker, but that does not isolate its Firestore data. Its exact-head run [37948901788](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37948901788) performed Worker deployment, public health/version checks, and an unauthenticated-protection check only; it did not invoke the projection route. No authenticated preview call, Firestore read, or data mutation was made. Treat the preview as unsafe for data operations until its Firebase project/database and matching credentials are isolated and verified. For any later rehearsal, require a named synthetic garage/date, a complete pre-write destination snapshot, one request only, ledger/result comparison, and exact snapshot restoration (or deletion only of a newly created confirmed synthetic projection). Keep Express mounted until that separately reviewed gate is closed.

### Option A first step: path alignment

The Hono handler serves both `/api/admin/garages/:id/extend-fair-use` and the existing frontend path `/api/garages/:id/extend-fair-use`. Express retirement is complete on `migration/unified-hono`; no production deployment is implied. Fetch-native and Express characterization coverage verified the legacy path, admin authorization, unlimited-package eligibility, fair-use allowance update, audit-log creation, and idempotent replay before the Express handlers were removed.

The boundary suite now also verifies non-admin denial without writes, finite-package rejection, missing-garage handling, and default-step extension (**3 files / 16 focused tests**). A shared error-map entry makes `NOT_AN_UNLIMITED_PACKAGE` a client error in both runtimes instead of an internal server error. Hono and the Express compatibility route now accept an optional idempotency key, store the result transactionally, replay the same keyed request, and reject key reuse with a different payload; the frontend now sends a generated key. Dual-runtime integration coverage passes (**4 files / 21 focused tests**). Express retirement is no longer blocked by this idempotency gap, but still requires the final route-retirement approval and full sensitive-route disposition.

## Completed safe retirements

- Cloud Run-specific entrypoint/build support
- Express `GET /api/delegates/dashboard`
- Express `GET /api/garages/:id/dashboard-summary`
- Express `POST /api/garages/trial-decision`
- Express `POST /api/garages/recalculate-cars-inside` (owner-authorized maintenance-ownership transfer; Hono remains the supported route and the Express fallback now returns 404)
- Express `POST /api/garages/update` (owner-approved local retirement after synthetic field-allowlist, authorization, and error-contract coverage; Hono remains supported and Express fallback returns 404)

## H9 conclusion

H9 has reached the point where the next implementation work is no longer a low-risk Express deletion. The remaining candidates require either additional characterization coverage or an explicit operational/owner decision. No production branch, production deployment, financial write, destructive deletion, or maintenance operation is performed by this boundary record.

### Garage creation synthetic characterization — 2026-10-10

Added six local synthetic dual-runtime tests for `POST /api/garages/create` in `server/garageReconciliationParity.integration.test.ts`. The tests cover denial for non-creating roles, Admin trial initialization, delegate attribution below the three-per-Cairo-day limit and denial at the limit, duplicate-PIN rejection without business-data writes, invalid idempotency-key validation, and repeated valid-key behavior. All Firestore interactions use the in-memory `MockFirestore`; neither route implementation was changed.

At this first characterization checkpoint, the shared garage/trial fields, delegate attribution/quota, PIN collision response, and invalid-key response matched across Hono and Express. The two then-open gaps—Hono omitting Express's activity-log `details` object and valid keys not providing replay protection—were subsequently resolved in the garage-creation hardening section below.

Focused validation at the initial characterization checkpoint passed **3 files / 39 tests**. The full local suite at that checkpoint passed **103 files / 622 tests**; lint, web/Node/Worker builds, `npm run ci:check`, maintainability, and whitespace checks passed. No Firebase/Cloudflare access, preview rehearsal, live data operation, route retirement, or production change occurred; Express remains mounted.

### Garage creation hardening — 2026-10-10

Resolved both gaps identified above in `POST /api/garages/create`. Hono now writes the same activity-log `details` fields as Express. Both runtimes now fingerprint the sanitized request without retaining the raw PIN and transactionally coordinate the idempotency record with garage creation, the private PIN/reservation, and the activity log. Repeating the same key and request replays the original response; reusing the key with a different request is rejected; concurrent same-key requests create only one garage and activity log in the synthetic dual-runtime test. The PIN reservation is checked and written in the same transaction as creation.

Focused validation passed **4 files / 43 tests**; the full local suite at the hardening checkpoint passed **103 files / 624 tests**. The subsequent rate-limit evidence is recorded below. `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` passed. All database behavior was tested with in-memory `MockFirestore`; no Firebase/Cloudflare access, preview rehearsal, live operation, push, or deployment occurred. Express remains mounted pending a separate route-retirement review and explicit approval.

### Garage creation Hono rate-limit parity — 2026-10-10

Added the Express garage-create limit to Hono: an atomic Firestore transaction keyed by SHA-256 of `fin:<authenticated uid>` (client IP fallback), allowing 30 requests in a 60-second window and returning the compatible 429 `RATE_LIMIT_EXCEEDED` response after the cap. Expired windows reset. If limiter storage is unavailable, Hono fails closed with 503 and performs no garage creation; unlike the legacy Express middleware, it does not use process-local memory as an outage fallback.

Synthetic tests seed only in-memory `MockFirestore` and verify the 30th request is allowed, the next request is denied without business-data writes, an expired window resets, storage failure blocks creation, and three concurrent requests at count 28 result in exactly two creations and one 429 (counter ends at 30). Focused integration passed **1 file / 31 tests**; the full local suite passed **103 files / 636 tests**. `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` passed. No external service/data was used, and Express creation remains mounted as requested.

### Garage update characterization and Express retirement — 2026-10-10

Three synthetic dual-runtime tests characterized `POST /api/garages/update`: the complete Hono allowlist, ignored fields, no-write denials for garage/staff/delegate/backend-worker roles, and Admin validation/missing-document behavior. The tests exposed and fixed Express's authorization-before-validation ordering before retirement. After explicit owner approval, only the Express handler was removed. Hono remains supported; the tests keep the Hono behavior covered and assert that the Express fallback now returns 404. The former Express parser's 400 envelope for top-level JSON `null` differed from Hono's route-level envelope; that legacy distinction is no longer served by the Express route.

The focused integration file passed **1 file / 28 tests**; the final full local suite passed **103 files / 633 tests**, with `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` green after the approved change. All route-state tests used in-memory `MockFirestore`; no Firebase/Cloudflare access, preview rehearsal, live operation, push, or deployment occurred. This removes only the local Express update handler; Express itself and all other routes remain.

### Garage deletion dual-runtime characterization — 2026-10-10

Added five synthetic dual-runtime tests for `POST /api/garages/delete`. They verify removal of only garage-owned root/subcollection and scoped top-level records, preservation of unrelated data, matching audit and completed-job fields, write-free non-Admin denial, ID/not-found behavior, completed-job replay, resume when the root is already absent, recovery after a simulated cleanup batch commits but its acknowledgment is lost, and overlap rejection with one audit record. A shared Firestore transaction claims each garage deletion with a five-minute renewable lease; a second active request gets 409. Failed attempts release the claim for retry, expired legacy jobs can be reclaimed, batch progress renews the lease, and the final audit-log write, root removal, and completed job update commit atomically. Express preserves resumable metadata and does not recreate an absent root. Hono maps errors through the shared Express mapper; JSON `null` returns 400 in both (the Express parser uses a different error envelope).

The focused integration file passed **1 file / 28 tests**; the final full local suite passed **103 files / 633 tests**. `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` passed. All deletions and injected failures occurred only in in-memory `MockFirestore`; no Firebase/Cloudflare access, preview/live rehearsal, route retirement, push, or deployment occurred.

**Residual deletion risk:** there is no separate request-key contract; the current client sends only `garageId`, and deduplication is based on the garage-scoped job/lease. Lease and transaction behavior has only been validated with `MockFirestore`, not a real isolated Firebase project. Keep Express mounted; this synthetic slice is not route-retirement approval.

### Garage deletion Hono rate-limit parity — 2026-10-10

Hono deletion now uses the same shared transactional 30-per-user/IP-per-minute limiter as Express deletion. It returns the compatible 429 `RATE_LIMIT_EXCEEDED` contract before entering the destructive handler; limiter-storage failure follows the shared Hono fail-closed 503 policy rather than Express's process-local-memory fallback.

Synthetic tests seed only in-memory `MockFirestore`, start at count 29, and verify both Hono and Express allow one delete, then deny the next request with 429 and no additional business-data changes. Focused integration passed **1 file / 32 tests**; the full local suite passed **103 files / 637 tests**. CI/release, maintainability, and whitespace checks passed. Express deletion remains mounted; no external data, cloud, preview, or deployment actions were used.

### Maintenance null-body validation parity — 2026-10-10

Synthetic characterization found that valid JSON `null` caused Hono reconciliation, dashboard-summary rebuild, and projection rebuild handlers to throw before validation, returning 500 where Express returned 400. Hono now treats null as an empty request for these routes, returning a 400 validation response without writes. Express's JSON parser emits an upstream HTML 400 envelope for top-level `null`, so tests compare the status and no-write contract for that parser-level case; normal JSON validation cases retain full response comparisons.

Focused integration passed **1 file / 32 tests**; full local validation passed **103 files / 637 tests**, CI/release, maintainability, and whitespace checks. All checks used local synthetic fixtures; no Firebase/Cloudflare calls, live or preview operations, route retirements, pushes, or deployments occurred. Express remains mounted for these maintenance routes.

### DST-aware Cairo maintenance boundaries — 2026-10-10

The route audit found that both runtimes had hard-coded `UTC+03:00` windows. That shifted winter-day event queries by one hour despite the `Africa/Cairo` business-day rule. Added a shared timezone-aware boundary helper in the existing projection module and used it for reconciliation, dashboard-summary rebuild, and daily-projection rebuild in both Express and Hono. It finds each local day's first instant independently, preserving the actual seasonal offset and day length.

Synthetic unit tests verify winter (`2026-01-15`: `22:00Z` start/end) and summer (`2026-07-15`: `21:00Z` start/end). A dual-runtime in-memory fixture verifies both rebuild routes include Cairo-winter events exactly at/within the target day, exclude the adjacent-day events, and preserve the final-event watermark. Focused validation passed **2 files / 38 tests**; full local validation passed **103 files / 639 tests**, with CI/release, maintainability, and whitespace checks green. No external data or cloud operations were used; Express maintenance routes remain mounted.

### Multi-page garage deletion lease stress — 2026-10-10

Expanded the synthetic deletion test to 805 garage-owned vehicle records, forcing three cleanup pages at the adapter's 400-document page size. Both runtimes renewed the deletion lease after each committed page, removed all 805 vehicle records, finalized exactly one audit/job completion, and released the lease. Focused stress coverage passed; the full local suite passed **103 files / 640 tests**, with CI/release, maintainability, and whitespace checks green. This used only `MockFirestore`; Express deletion remains mounted, and there was no cloud access, live/preview deletion, push, or deployment.

### Lease expiry/reclaim synthetic-clock characterization — 2026-10-10

Added an in-memory synthetic-clock test that pauses an 805-record deletion after the first committed page and its lease renewal, advances beyond the original five-minute expiry while remaining within the renewed lease, and confirms a second request receives 409 in both Hono and Express. The first request then completes all three pages once. A separate dual-runtime case seeds a genuinely expired running job and confirms it is reclaimed with a new token, cleans up the remaining synthetic record, and finalizes one audit/job completion. The focused integration file passed **1 file / 35 tests**; full local validation passed **103 files / 641 tests**, with CI/release, maintainability, and whitespace checks green. Current logic is safe for these tested transitions; no production behavior change was needed. The Express delete route remains mounted, and Firestore behavior still requires an isolated operational rehearsal before any retirement decision.
