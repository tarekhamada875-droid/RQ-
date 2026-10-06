# RQ Unified Hono Migration Checkpoint Plan

## Purpose

Evaluate and, if successful, migrate RQ from the current dual-runtime structure to a unified Hono Web-Standards backend without risking the working production deployment.

## Current succession status — 2026-10-06

- **Active branch:** `migration/unified-hono`
- **H6 auth implementation commit:** `cb5f0f55fb20ddb6a957c602541cb1e94380b658`; the handoff update records validation and will be pushed with it.
- **Remote `main`:** `690d8f0c1f723b823e0beabe2526fddbee8fbba7`, a documentation-only commit atop common base `bb12fbe90eb97b6638546f292f5de50aab03d81a`; production Worker remains on `1.0.0-production`.
- **Completed:** H0 baseline protection, H1 route inventory, H2 domain-policy and billing extraction, H3 canonical Hono API/local adapter, H4 Fetch/Hono test migration, and H5 dual-runtime preview deployment.
- **H5 preview:** `https://rq-hono-preview.tarekhamada875.workers.dev` — latest H5 workflow [37455210039](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37455210039) passed verification, isolated deployment, health/version (200), and unauthenticated-protection smoke tests. Production Gate [37455210053](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37455210053) passed. Direct health/version also returned 200 on `1.0.0-h5-preview`.
- **Production:** `https://rq.tarekhamada875.workers.dev` remains on `1.0.0-production`; no cutover has occurred.
- **H6 progress:** Delegate login/refresh/logout and Admin login/dashboard checks are accepted. The existing Garage Owner, Staff, and Supervisor fixtures were verified and assigned synthetic test PINs. The post-fix Owner request hit the 15-second frontend timeout, but a read-only check later found one active current session created at `2026-10-06T11:43:40.385Z` and a successful garage-summary read. This strongly indicates the backend committed a garage-scoped session after the browser stopped waiting; the UI acceptance is still incomplete. Staff/Supervisor login was not attempted.
- **H5 freeze-gate root cause/fix:** the workflow first used depth-1 history, so `git diff origin/main...HEAD` had no merge base; after fixing history, hashing textual `git diff` output still differed between CI and local for the same source. `.github/workflows/h5-preview-worker.yml` now fetches full history, compares to freshly fetched main, fails closed without a merge base, and pins the exact approved `src/App.tsx` Git blob. The H5 preview run now passes; no UI source changed.
- **H6 auth finding/fix:** The Worker claims the role session before awaiting a best-effort Durable Object limiter reset. That tail stage could delay a successful login response after the session was committed, though the earlier timeout’s exact cause is not proven. Commit `cb5f0f5` schedules the reset with `ExecutionContext.waitUntil` when available and adds sanitized timings for auth, rate-limit check, PIN lookups/match, session claim, and total time; no PIN, session ID, or account/user ID is logged. The fix is deployed to preview and its health/version endpoints return 200.
- **Local validation:** **PASS** — 99 test files / 566 tests; lint; build; `npm run ci:check`; `npm run maintainability:check`; and `git diff --check`. A regression test holds the limiter reset pending and proves the successful response returns while asserting timing logs omit synthetic PIN/session/UID values.
- **Preview diagnostics:** The post-fix Owner request again reached the 15-second client timeout; the browser recorded no response start or transferred response. Cloudflare Observability returned no matching timing event, but the read-only session endpoint returned 200 with one active/current session and the garage-summary endpoint returned 200. The session summary omits the role; only the Owner login was attempted at that time. The temporary local UI and config are stopped/removed.
- **Next checkpoint:** add or capture credential-free stage timings for token/session resolution, rate limiting, PIN lookup, and session claim to find why the response arrives after the 15-second frontend timeout. Do not submit another Owner PIN while the committed session is active; finish H6 UI acceptance only after the response path is understood. Staff/Supervisor remain untested, and H6/H7–H9 remain blocked.
- **Succession rule:** If the owner says `tokens ending`, stop implementation and create the next chained handoff before any other work.
- **UI/UX freeze:** Do not add, remove, redesign, recolor, relabel, or reroute any user-visible screen or login flow. The migration may change backend adapters, tests, deployment files, and internal wiring only. The owner has explicitly approved one narrow exception: route every unauthenticated role through the existing original `LoginView`, with no visual redesign. No other UI change is approved.

## Current production architecture

```text
Cloudflare Pages frontend
        |
        v
Cloudflare Worker API (Hono)
        |
        v
Firebase Authentication + Firestore
```

The current Cloudflare Worker is the production backend. Express remains as transitional infrastructure for local development, existing integration tests, Cloud Run compatibility, and rollback support.

## Non-negotiable rules

1. Do not modify or delete the current production `main` branch during the experiment.
2. Do not redesign the UI or UX.
3. Do not change business rules unless a migration defect requires an explicitly documented correction.
4. Do not remove Express until all gates in this plan are complete.
5. Keep Firebase authentication, Firestore data, tenant isolation, role permissions, idempotency, audit logging, and session behavior unchanged.
6. Every checkpoint must pass before the next checkpoint begins.
7. The existing Cloudflare Worker remains the rollback target throughout the migration.

---

## Branch strategy

### Protected baseline

The current production branch is:

```text
main
```

The baseline commit must be tagged before migration:

```text
rq-production-baseline-before-hono-migration
```

Do not delete this tag.

### Migration branch

Create a separate branch from the current `main`:

```text
migration/unified-hono
```

All migration work happens on this branch first.

### Optional comparison branches

If useful, create additional short-lived branches:

```text
migration/hono-adapter
migration/hono-test-conversion
migration/express-removal
```

These are optional. The primary migration branch should remain the single integration branch.

---

# Checkpoint H0 — Baseline and rollback protection

## Objective

Record exactly what is currently working before changing architecture.

## Tasks

- Confirm `main` is clean and synchronized with GitHub.
- Record the current production Worker version.
- Record the current Pages deployment.
- Run and save the results of:
  - `npm test`
  - `npm run lint`
  - `npm run build`
  - `npm run ci:check`
  - `npm run maintainability:check`
  - `npm run release:smoke`
- Create the baseline tag.
- Create the migration branch.
- Verify that the public production URLs remain unchanged.

## Exit criteria

- `main` remains unchanged.
- Baseline tag exists.
- All existing quality gates pass.
- Rollback instructions are written down.

## Rollback

If anything goes wrong during the experiment, stop using the migration branch and continue production from `main`. No production rollback is needed unless a migration branch is accidentally deployed.

---

# Checkpoint H1 — Architecture inventory

## Objective

Understand what must be consolidated before deleting or rewriting anything.

## Tasks

Create a route inventory containing, for every API route:

- HTTP method
- URL
- Frontend caller
- Current Worker implementation
- Current Express implementation
- Authorization rule
- Firestore collections/documents touched
- Idempotency behavior
- Audit-log behavior
- Existing tests

Group routes by feature:

- Authentication and sessions
- Vehicles
- Subscribers
- Garages
- Staff
- Supervisors
- Delegates
- Recharge requests
- Subscriptions and packages
- Referral rewards
- Reports and summaries
- Admin settings
- Announcements and coupons

## Exit criteria

- No route is marked “unknown.”
- Every frontend API call has a documented production Worker route.
- Any intentionally Worker-only or Express-only route is documented.

---

# Checkpoint H2 — Extract framework-neutral domain services

## Objective

Avoid copying Express handlers into Hono handlers. Move business behavior into reusable modules first.

## Target structure

```text
server/domain/
server/services/
server/validation/
server/adapters/
server/http/
```

## Tasks

- Extract business decisions from Express route handlers where they are still embedded in HTTP code.
- Reuse existing domain modules whenever possible.
- Keep Firestore access behind service/adaptor functions.
- Keep authorization decisions in domain policy modules.
- Keep HTTP parsing and response formatting outside the domain layer.
- Add tests for extracted functions before changing route behavior.

## Exit criteria

- Domain logic has no Express or Hono imports.
- Domain logic has no dependence on `Request`, `Response`, `req`, or `res`.
- Existing tests remain green.
- Worker behavior does not change yet.

---

# Checkpoint H3 — Build the unified Hono application

## Objective

Create one Hono API application that can run in both Cloudflare Workers and local Node development.

## Target structure

```text
server/api.ts              # canonical Hono application
server/cloudflareWorker.ts # Worker entry point
server/nodeAdapter.ts      # local Node adapter, if needed
server.ts                  # Vite + local adapter only
```

## Tasks

- Move or adapt Worker routes into `server/api.ts`.
- Preserve the existing Worker route paths and response envelopes.
- Add a Node-compatible adapter for local development.
- Keep Vite SPA middleware and static fallback working.
- Do not delete Express yet.
- Run the Hono application locally through Fetch-style requests.
- Confirm Firebase Admin initialization works in both environments.

## Exit criteria

- The same Hono route application runs in local development and Cloudflare Workers.
- Local development still serves the frontend.
- No UI change is introduced.
- The Worker build remains successful.

---

# Checkpoint H4 — Migrate tests from Express-only integration to Fetch/Hono tests

## Objective

Make the test suite validate the production architecture directly.

## Tasks

- Convert route-level Express integration tests to Fetch/Hono tests gradually.
- Keep the old Express tests temporarily as characterization tests.
- Add role tests for:
  - Admin
  - Delegate
  - Garage owner
  - Staff
  - Supervisor
- Test both allowed and forbidden operations.
- Test tenant isolation and cross-garage URL manipulation.
- Test session release, expiry, refresh, and multi-device behavior.
- Test idempotency and duplicate requests.
- Test audit logs and server-generated activity records.

## Exit criteria

- Every production route has a Hono/Fetch test.
- Existing Express tests and new Hono tests agree on behavior.
- No route is covered only by a mock that bypasses authorization.

---

# Checkpoint H5 — Run both runtimes in parallel

## Objective

Compare the unified Hono runtime with the current implementation before removing anything.

## Tasks

- Keep Express available locally and for rollback.
- Run the same contract tests against Hono and Express where practical.
- Compare:
  - Status codes
  - Error codes
  - Response envelopes
  - Authorization outcomes
  - Firestore mutations
  - Idempotency behavior
  - Audit records
- Deploy the migration branch only to a non-production Worker name, such as:

```text
rq-hono-preview
```

- Use synthetic test data only.
- Do not point real users to the preview Worker.

## Exit criteria

- Hono and the current implementation agree across all documented routes.
- No data mutation occurs outside the intended synthetic test scope.
- Preview health and smoke tests pass.

---

# Checkpoint H6 — Production-equivalent smoke and role testing

## Objective

Test the new architecture as a human user, not only as a developer.

## Tasks

Use the preview stack to test:

### Admin

- Login and logout
- Dashboard summaries
- Create/update/delete garages
- Manage staff, supervisors, and delegates
- Packages, coupons, announcements
- Recharge and subscription operations
- Reports and financial data
- Session management

### Delegate

- Dashboard and commission data
- Garage applications
- Tenant isolation
- Forbidden admin actions

### Garage owner

- Login and logout
- Dashboard and vehicle flows
- Subscribers and packages
- Trial-expiry popup actions
- Self-subscription
- Referral reward claim
- Forbidden cross-garage actions

### Staff

- Check-in and check-out
- Vehicle history
- Subscriber operations allowed to staff
- Forbidden admin and cross-garage operations

### Supervisor

- Permitted monitoring and recharge workflows
- Forbidden mutation and financial actions

## Exit criteria

- All role workflows work through Cloudflare Pages to the preview Worker.
- No role is silently downgraded to an anonymous or worker role.
- Popup actions work on mobile and desktop.
- No UI/UX redesign is introduced.

---

# Checkpoint H7 — Production cutover decision

## Objective

Decide whether the unified Hono branch is actually ready to replace the current production architecture.

## Required approval conditions

The migration is ready only if:

- Full tests pass.
- Lint passes.
- Production build passes.
- CI check passes.
- Maintainability check passes.
- Release smoke passes.
- Preview role testing passes.
- Worker route parity is complete.
- Firebase authentication and session lifecycle tests pass.
- No unexplained warnings affect user-visible behavior.
- Rollback has been rehearsed.

If any condition fails, keep the current production Worker and continue fixing the migration branch.

---

# Checkpoint H8 — Safe replacement of `main`

## Recommended method: merge, do not delete `main`

The safest approach is:

1. Keep the existing `main` branch.
2. Merge `migration/unified-hono` into `main` after all gates pass.
3. Tag the successful release.
4. Deploy the Worker from the merged `main`.
5. Verify health, version, and role-based smoke tests.
6. Keep the old baseline tag for rollback.

There is normally no reason to delete `main`. Replacing its contents through a reviewed merge achieves the same result without destroying history.

## If replacing the branch is specifically required

GitHub can technically make the migration branch the default branch, but this is less safe:

1. Change the repository default branch to `migration/unified-hono`.
2. Verify deployments and branch-based automation.
3. Rename the migration branch to `main`, or merge it into a newly recreated `main`.
4. Update Cloudflare deployment settings if they reference the branch name.
5. Update GitHub Actions, branch protections, webhooks, and documentation.
6. Delete the old branch only after the new branch has been verified.

This is unnecessary for RQ and should not be the default plan.

---

# Checkpoint H9 — Express decommissioning

## Objective

Remove Express only after the unified Hono architecture has proved itself.

## Tasks

- Confirm no production or required test imports Express.
- Convert or remove Express-only tests.
- Remove `server/routes/*` only after their behavior exists in shared services/Hono routes.
- Remove Express middleware and types only when no longer referenced.
- Remove or explicitly retire Cloud Run support.
- Update `package.json` scripts.
- Update documentation and deployment configuration.
- Run the entire production gate again.

## Exit criteria

- `rg` finds no required Express runtime dependency.
- Local development works.
- Cloudflare Worker deployment works.
- All tests and quality gates pass.
- A documented rollback release exists.

---

## Final recommendation

The experiment is a good idea, but the branch should be treated as a **controlled migration project**, not a quick cleanup.

Do not delete the current `main` branch at the beginning. Preserve it as the known-good production baseline, build and test the unified Hono architecture separately, and merge it into `main` only after the complete gate passes.
