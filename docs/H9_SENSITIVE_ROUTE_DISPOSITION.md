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
| `POST /api/garages/recalculate-cars-inside` | `POST /api/garages/recalculate-cars-inside` | Maintenance mutation | Rebuilds the garage active-vehicle count from vehicle records. | Maintenance authorization and projection-consistency characterization; keep until maintenance ownership is explicitly transferred. |
| `POST /api/garages/reconciliation` | `POST /api/garages/reconciliation` | Maintenance / diagnostics | Reads event, vehicle, daily-stat, and projection state and reports reconciliation results. | Read-only parity and telemetry comparison; operational owner confirmation that the Hono route is the supported diagnostic path. |
| `POST /api/garages/dashboard-summary/rebuild` | `POST /api/garages/dashboard-summary/rebuild` | Admin projection maintenance | Rebuilds dashboard projection state and writes the summary used by operational and revenue views. | Projection rebuild parity, stale/fresh summary validation, event consistency, and rollback/rebuild rehearsal. |
| `POST /api/garages/rebuild-projections` | `POST /api/garages/rebuild-projections` | Maintenance / projection mutation | Rebuilds daily projections from authoritative event data. | Event-ledger replay parity, idempotency/retry behavior, and isolated operational rehearsal. |
| `POST /api/garages/:id/extend-fair-use` and `POST /api/admin/garages/:id/extend-fair-use` | Hono handles both paths | Entitlement / financial-adjacent | **Express retired.** Hono is the sole runtime owner after authorization, entitlement, audit, and dual-runtime idempotency evidence passed. | Keep Hono parity and idempotency coverage; no production deployment is implied by this migration-branch change. |

### Option A first step: path alignment

The Hono handler serves both `/api/admin/garages/:id/extend-fair-use` and the existing frontend path `/api/garages/:id/extend-fair-use`. Express retirement is complete on `migration/unified-hono`; no production deployment is implied. Fetch-native and Express characterization coverage verified the legacy path, admin authorization, unlimited-package eligibility, fair-use allowance update, audit-log creation, and idempotent replay before the Express handlers were removed.

The boundary suite now also verifies non-admin denial without writes, finite-package rejection, missing-garage handling, and default-step extension (**3 files / 16 focused tests**). A shared error-map entry makes `NOT_AN_UNLIMITED_PACKAGE` a client error in both runtimes instead of an internal server error. Hono and the Express compatibility route now accept an optional idempotency key, store the result transactionally, replay the same keyed request, and reject key reuse with a different payload; the frontend now sends a generated key. Dual-runtime integration coverage passes (**4 files / 21 focused tests**). Express retirement is no longer blocked by this idempotency gap, but still requires the final route-retirement approval and full sensitive-route disposition.

## Completed safe retirements

- Cloud Run-specific entrypoint/build support
- Express `GET /api/delegates/dashboard`
- Express `GET /api/garages/:id/dashboard-summary`
- Express `POST /api/garages/trial-decision`

## H9 conclusion

H9 has reached the point where the next implementation work is no longer a low-risk Express deletion. The remaining candidates require either additional characterization coverage or an explicit operational/owner decision. No production branch, production deployment, financial write, destructive deletion, or maintenance operation is performed by this boundary record.
