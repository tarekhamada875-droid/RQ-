# H9 Sensitive Express Route Disposition

**Status:** H9 boundary record  
**Branch:** `migration/unified-hono`  
**Scope:** Remaining Express garage handlers after the safe H9 retirements

## Decision boundary

The low-risk Express compatibility surfaces have been retired only after Hono replacement coverage passed. The remaining garage handlers are not ordinary compatibility aliases: they create accounts, change financial/account state, delete data, extend entitlements, or perform projection/reconciliation maintenance. They must not be removed automatically from the explicit Express fallback without route-specific parity evidence and an owner-approved disposition.

## Remaining route matrix

| Express route | Hono replacement | Risk class | Why it remains | Required next evidence |
|---|---|---|---|---|
| `POST /api/garages/create` | `POST /api/garages/create` | Account creation / financial-adjacent | Creates a garage, stores a PIN, initializes balance/trial/package state, and writes an activity log. | Dual-runtime characterization for role scope, PIN uniqueness, idempotency, delegate quota, trial initialization, and activity-log shape; explicit approval before removing the Express fallback. |
| `POST /api/garages/update` | `POST /api/garages/update` | Admin account mutation | Updates identity, access, package, lock, capacity, balance, and balance-expiry fields through a broad allowlist. | Field-by-field parity matrix, especially balance/balance-expiry and session/lock fields; no removal based only on frontend coverage. |
| `POST /api/garages/delete` | `POST /api/garages/delete` | Destructive / financial-adjacent | Marks deletion, creates a resumable deletion job, deletes owned data, and writes an audit log. | Destructive-flow rehearsal in an isolated fixture, retry/idempotency and partial-failure tests, full cleanup proof, rollback procedure, and explicit approval. |
| `POST /api/garages/reconciliation` | `POST /api/garages/reconciliation` | Maintenance / diagnostics | Reads event, vehicle, daily-stat, and projection state and reports reconciliation results. The Hono Fetch-native handler and synthetic contract coverage are present on `migration/unified-hono`; Express remains mounted. | Read-only parity coverage is recorded below. Telemetry comparison and operational owner confirmation that Hono is the supported diagnostic path remain open; do not retire Express yet. |
| `POST /api/garages/dashboard-summary/rebuild` | `POST /api/garages/dashboard-summary/rebuild` | Admin projection maintenance | Rebuilds dashboard projection state and writes the summary used by operational and revenue views. The Hono Fetch handler and synthetic Express/Hono characterization now pass on `migration/unified-hono`; Express remains mounted. | Isolated operational rehearsal and separate Express-retirement review remain; no live or preview rebuild was run. |
| `POST /api/garages/rebuild-projections` | `POST /api/garages/rebuild-projections` | Maintenance / projection mutation | Rebuilds daily projections from authoritative event data. | Event-ledger replay parity, idempotency/retry behavior, and isolated operational rehearsal. |
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

### Option A first step: path alignment

The Hono handler serves both `/api/admin/garages/:id/extend-fair-use` and the existing frontend path `/api/garages/:id/extend-fair-use`. Express retirement is complete on `migration/unified-hono`; no production deployment is implied. Fetch-native and Express characterization coverage verified the legacy path, admin authorization, unlimited-package eligibility, fair-use allowance update, audit-log creation, and idempotent replay before the Express handlers were removed.

The boundary suite now also verifies non-admin denial without writes, finite-package rejection, missing-garage handling, and default-step extension (**3 files / 16 focused tests**). A shared error-map entry makes `NOT_AN_UNLIMITED_PACKAGE` a client error in both runtimes instead of an internal server error. Hono and the Express compatibility route now accept an optional idempotency key, store the result transactionally, replay the same keyed request, and reject key reuse with a different payload; the frontend now sends a generated key. Dual-runtime integration coverage passes (**4 files / 21 focused tests**). Express retirement is no longer blocked by this idempotency gap, but still requires the final route-retirement approval and full sensitive-route disposition.

## Completed safe retirements

- Cloud Run-specific entrypoint/build support
- Express `GET /api/delegates/dashboard`
- Express `GET /api/garages/:id/dashboard-summary`
- Express `POST /api/garages/trial-decision`
- Express `POST /api/garages/recalculate-cars-inside` (owner-authorized maintenance-ownership transfer; Hono remains the supported route and the Express fallback now returns 404)

## H9 conclusion

H9 has reached the point where the next implementation work is no longer a low-risk Express deletion. The remaining candidates require either additional characterization coverage or an explicit operational/owner decision. No production branch, production deployment, financial write, destructive deletion, or maintenance operation is performed by this boundary record.
