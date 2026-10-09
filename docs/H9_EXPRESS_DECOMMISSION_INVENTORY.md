# H9 Express Decommission Inventory

**Date:** 2026-10-09  
**Production release:** `rq-unified-hono-h8-2026-10-09` (`8be859d9ed99bd4009b0dd9d7ec0b7f2c2f2c9f0`)  
**Authorized work branch:** `migration/unified-hono`  
**Rollback tag:** `rq-production-baseline-before-hono-migration` (`bb12fbe90eb97b6638546f292f5de50aab03d81a`)  
**Scope of this document:** read-only inventory and sequencing; no production behavior change.

## Current finding

Express is **not yet removable**. The unified Hono Worker is the production backend, but Express remains a live local/Cloud Run compatibility runtime and is imported by transitional route modules, middleware, adapters, and integration/dual-runtime tests.

Immediate deletion would break at least the local `dev` path, `build:server`, `build:cloudrun`, Cloud Run compatibility, and existing Express characterization coverage. H9 must therefore proceed in reversible slices.

## Dependency and script inventory

- Runtime dependency: `express` `^5.2.1`.
- Type dependency: `@types/express` `^5.0.6`.
- Express-backed scripts:
  - `dev` → `tsx server.ts` (Express by default).
  - `build:server` → bundles `server.ts` for the Node runtime.
  - `build:cloudrun` → bundles `server/cloudRun.ts`.
  - `start` → runs `dist/server.cjs`.
- Hono-compatible local path: `dev:hono` → `RQ_API_RUNTIME=hono tsx server.ts`.
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
- `server/trialDecisionRoutes.integration.test.ts`
- `server/vehicleGarageScopeAuthorization.integration.test.ts`
- `server/h5DualRuntime.contract.test.ts` (uses the Express app as the comparison runtime)

## Runtime topology

`server.ts` currently selects the Express app by default and the Hono adapter only when `RQ_API_RUNTIME=hono`:

```text
RQ_API_RUNTIME unset  -> Express app from server/app.ts
RQ_API_RUNTIME=hono   -> Fetch/Hono adapter from server/nodeAdapter.ts
Cloudflare Worker      -> server/cloudflareWorker.ts
Cloud Run               -> server/cloudRun.ts -> Express createApp()
```

`server/app.ts` mounts the transitional Express routers for auth, vehicles, subscribers, delegates, transactions/recharges, garages, and reports, plus JSON, CORS, correlation, timeout, operation-trace, fallback, and error middleware.

## Known Express-only or maintenance capabilities

The existing route inventory identifies these Express capabilities as requiring an explicit disposition before removal:

- `POST /api/garages/reconciliation`
- `POST /api/garages/dashboard-summary/rebuild`
- `POST /api/garages/rebuild-projections`
- `POST /api/garages/:id/extend-fair-use`
- `POST /api/auth/invalidate-all-sessions`

These are not ordinary frontend routes. H9 must either preserve them behind a supported Hono maintenance route or explicitly retire them with owner-approved operational documentation and tests.

## Safe H9 sequence

1. **Inventory complete:** retain this document and the existing H1 route inventory as the source of truth.
2. **Characterization conversion:** add Fetch/Hono equivalents for any still-required Express-only tests; keep Express tests until their replacement coverage passes.
3. **Runtime default decision:** switch local `dev` to Hono only after local development, static serving, and Node adapter checks pass; retain an explicit legacy compatibility command temporarily.
4. **Cloud Run decision:** verify whether `server/cloudRun.ts` is still required. Do not remove it or its build script until deployment configuration and owner intent are confirmed.
5. **Route retirement:** remove Express routers only in groups whose behavior is covered by shared domain tests and Hono route tests. Do not remove financial or maintenance paths based only on frontend absence.
6. **Dependency removal:** remove `express`, `@types/express`, and related middleware only after the import census reaches zero for required runtime and test code.
7. **Full gate:** run tests, lint, web/Node/Cloudflare builds, CI, maintainability, preview smoke, production smoke, and rollback verification.

## First reversible slice

The first implementation slice should be **test and runtime decoupling, not Express deletion**:

- Identify tests whose assertions are already covered by Worker/Fetch suites.
- Add or strengthen Fetch-native tests for the shared session and route contracts.
- Keep the Express comparison suite as a characterization guard during this slice.
- Do not change production configuration, Firestore rules, financial behavior, or role policy.

The first slice now adds Fetch-native Worker coverage for valid garage-session refresh and expiry in `src/__tests__/workerSessionRoutes.test.ts`, while retaining the five Express session characterization tests. The focused pair passes **2 files / 11 tests**. The Hono implementation intentionally treats the security session as authoritative during refresh and returns the Hono `error` envelope for expiry; the older Express suite remains the record of the transitional runtime's legacy behavior and is not relabeled as identical.

## H9 status

**Inventory complete; decommissioning not started.** Express remains required for compatibility until the conversion and Cloud Run decisions are completed. The H8 production release and rollback tag remain unchanged.
