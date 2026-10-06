# RQ Unified Hono Migration Checkpoint Plan

## Purpose

Evaluate and, if successful, migrate RQ from the current dual-runtime structure to a unified Hono Web-Standards backend without risking the working production deployment.

## Current succession status — 2026-10-06

- **Active branch:** `migration/unified-hono`
- **H6 retest base commit:** `6faa5795dbde816aaef3c74e34fe9e0f4dad9f11`; verify the resulting documentation-only head with `git rev-parse HEAD`.
- **Production `main`:** unchanged; `origin/main` is `bb12fbe`
- **Completed:** H0 baseline protection, H1 route inventory, H2 domain-policy and billing extraction, H3 canonical Hono API/local adapter, H4 Fetch/Hono test migration, and H5 dual-runtime preview deployment.
- **Preview:** `https://rq-hono-preview.tarekhamada875.workers.dev` — health/version and unauthenticated protection passed; final locked-down cleanup workflow `37324129640` passed for commit `0522efb`.
- **Production:** `https://rq.tarekhamada875.workers.dev` remains on `1.0.0-production`; no cutover has occurred.
- **H6 progress:** Delegate login/refresh/logout and the earlier Admin login/dashboard checks are accepted. The existing Garage Owner, Staff, and Supervisor fixtures were verified and assigned synthetic test PINs. Two Garage Owner `POST /api/auth/verify-pin` attempts through the supported UI hit the 15-second frontend timeout with no observed HTTP status; Staff/Supervisor login was not attempted.
- **Preview connectivity:** preview health/version reads still return 200; the temporary local UI and Vite configuration were stopped/restored after testing. A narrow Cloudflare telemetry query did not expose route-level invocation records for the test window, so the auth-path cause is unresolved.
- **Next checkpoint:** diagnose preview-only PIN-verification latency with credential-free request-stage timings before any more role-login attempts. Then complete H6 browser acceptance for Garage Owner, Staff, and Supervisor using synthetic fixtures. H7–H9 remain blocked until the remaining H6 evidence is complete.
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
