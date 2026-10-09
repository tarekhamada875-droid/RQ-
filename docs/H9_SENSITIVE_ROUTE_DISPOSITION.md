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
| `POST /api/garages/:id/extend-fair-use` | `POST /api/admin/garages/:id/extend-fair-use` | Entitlement / financial-adjacent | Extends a garage entitlement and changes service availability. | Authorization, entitlement boundary, audit, retry/idempotency, and owner approval before Express retirement. |

### Option A first step: path alignment

The Hono handler now serves both `/api/admin/garages/:id/extend-fair-use` and the existing frontend path `/api/garages/:id/extend-fair-use`. This resolves the route-path mismatch without deleting the Express fallback or changing production deployment. Fetch-native coverage verifies the legacy path, admin authorization, unlimited-package eligibility, fair-use allowance update, and audit-log creation. Express retirement remains pending the sensitive-route evidence listed above.

## Completed safe retirements

- Cloud Run-specific entrypoint/build support
- Express `GET /api/delegates/dashboard`
- Express `GET /api/garages/:id/dashboard-summary`
- Express `POST /api/garages/trial-decision`

## H9 conclusion

H9 has reached the point where the next implementation work is no longer a low-risk Express deletion. The remaining candidates require either additional characterization coverage or an explicit operational/owner decision. No production branch, production deployment, financial write, destructive deletion, or maintenance operation is performed by this boundary record.
