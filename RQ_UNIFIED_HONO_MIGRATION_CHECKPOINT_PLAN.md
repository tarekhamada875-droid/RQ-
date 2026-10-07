# RQ Unified Hono Migration Checkpoint Plan

## Purpose

Evaluate and, if successful, migrate RQ from the current dual-runtime structure to a unified Hono Web-Standards backend without risking the working production deployment.

## Current succession status — 2026-10-06

- **Active branch:** `migration/unified-hono`
- **Latest migration code:** source commit `b4c5d28` adds the owner-approved visible Delegate sign-in action and PIN-only Delegate form, with role-scoped PIN enforcement in both Worker and Express. It is pushed; the prior H6 auth optimization remains.
- **Remote `main`:** `690d8f0c1f723b823e0beabe2526fddbee8fbba7`, a documentation-only commit atop common base `bb12fbe90eb97b6638546f292f5de50aab03d81a`; production Worker remains on `1.0.0-production`.
- **Completed:** H0 baseline protection, H1 route inventory, H2 domain-policy and billing extraction, H3 canonical Hono API/local adapter, H4 Fetch/Hono test migration, and H5 dual-runtime preview deployment.
- **H5 preview:** `https://rq-hono-preview.tarekhamada875.workers.dev` — H5 workflow [37500199178](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37500199178) and Production Gate [37500199167](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37500199167) passed at pushed branch head `5af9bf0`. Preview health/version returned 200 on `1.0.0-h5-preview`.
- **Production:** `https://rq.tarekhamada875.workers.dev` remains on `1.0.0-production`; no cutover has occurred.
- **H6 progress:** Browser evidence covers Admin, Delegate, Garage Owner, Staff, and Supervisor login/session lifecycles. The synthetic Supervisor loaded the restricted People/Delegates view, persisted across refresh, and logged out through the normal UI. Admin-summary, fake-garage dashboard summary, and Supervisor-create probes returned 403. Source review confirms `GET /api/garages` is an unfiltered global read for Supervisor, and Firestore rules/client subscriptions also permit broad reads; Hono single-garage/detail-summary routes deny Supervisor. The live list body was discarded. This cross-surface permission mismatch is **OPEN**, not a cross-garage-isolation pass. H6 allows Supervisor monitoring but does not define global versus assigned scope; do not change permissions until the boundary is explicit. Owner/Staff own-garage summaries returned 200; fake foreign-scope overrides and Admin-summary reads returned 403. Delegate QA-fixture Alpha/Beta reads were separately denied; the zero-garage Delegate remains distinct. The safe role-auth/session slice has live browser evidence. Vehicle/subscriber, financial/recharge/subscription, and mobile/PWA cells remain unrun under the non-payment boundary; H6 and H7–H9 remain open.
- **H5 freeze-gate root cause/fix:** the workflow fetches full history, compares to freshly fetched main, fails closed without a merge base, and pins the exact owner-approved App/login/hook blobs. The pushed H5 run and Production Gate passed for the approved exception.
- **H6 auth finding/fix:** The Worker claims the role session before scheduling a best-effort Durable Object limiter reset. The `waitUntil` change avoids waiting for that non-authoritative cleanup; a second optimization skips generic pre-login role lookups only on `POST /api/auth/verify-pin`. The current Delegate client sends `expectedRole: 'delegate'`, and both Worker/Hono and transitional Express reject other roles before credential migration/session claim. Generic unscoped role login and other route checks remain unchanged.
- **Local validation:** **PASS** — 102 test files / 577 tests; TypeScript lint; production/server/Worker build; `npm run ci:check` (including production artifact gates); `npm run maintainability:check`; `git diff --check`; and local H5 UI-freeze simulation. Worker/Express role-scope tests confirm a wrong-role PIN cannot migrate or claim a session and a valid Delegate PIN claims only a Delegate session.
- **Historical Owner timeout reconciliation:** The timed-out Owner attempt was reconciled through read-only endpoints: one active/current session was created at `2026-10-06T11:43:40.385Z`, and the garage-summary read returned 200. This strongly indicates backend session claim after the browser timeout, but the UI stayed at login and the safe summary omits the exact role. Cloudflare Observability did not return stage events. That earlier attempt remains distinct from the later authorized Delegate test.
- **Next checkpoint:** Keep the Supervisor scope finding open until the intended global-versus-assigned read policy is made explicit and Worker/Firestore paths are aligned; the current model has no Supervisor-to-garage assignment field. No policy code was changed during this audit. Continue safe non-payment H6 workflows with synthetic preview fixtures where possible; do not perform payment, transfer, wallet top-up, recharge, subscription purchase, or other financial writes. Do not conflate the zero-garage Delegate account with the QA Alpha/Beta fixture. Record intentionally unrun vehicle/subscriber and mobile/PWA cells accurately, review the full H6 matrix before H7–H9, and do not deploy to production or merge to `main`.
- **Succession rule:** If the owner says `tokens ending`, stop implementation and create the next chained handoff before any other work.
- **UI/UX freeze:** The owner explicitly approved only the visible Delegate sign-in action, PIN-only Delegate form, and corresponding auth wiring on 2026-10-06. Those exact UI file blobs are pinned by the H5 workflow. Preserve every other screen, style, route, and role flow; do not broaden this exception.

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


## H6 security addendum — Supervisor direct-write mismatch (2026-10-07)

The stated Supervisor boundary is “permitted monitoring and recharge workflows; forbidden mutation and financial actions.” A local Firestore Rules Emulator probe disproved the current implementation’s alignment with that boundary: schema-valid Supervisor writes succeeded for delegate update/delete, subscriber update/delete, and daily-counter create/update. Route inspection found subscriber and vehicle routes deny Supervisor, but delegate update/delete allow Supervisor in both Hono and Express. No dedicated daily-counter mutation endpoint exists; vehicle `daily_stats` writes are guarded server-side by vehicle scope.

Treat this as an **H6 blocker and policy decision point**. Do not advance H7, change permissions, deploy rules, or claim parity until the intended Supervisor mutation scope is chosen and consistently enforced/tested in Firestore Rules, Hono, Express, and the acceptance matrix.


## H6 security correction follow-up — 2026-10-07

The stated Supervisor boundary is now enforced locally: monitoring reads remain available, while direct writes to delegates, subscribers, and daily counters are denied by Firestore Rules; Hono and Express delegate update/delete are Admin-only through the shared domain policy. Focused route/domain tests passed **5 files / 61 tests**, and the repeatable local Rules Emulator test passed. The correction remains un-deployed; H6 cannot close until the full matrix and preview verification are complete.

## H6 Supervisor read-boundary correction — 2026-10-07

The Supervisor monitoring boundary is now explicit: global overview only through the Worker, sanitized to operational fields; no direct garage/detail, vehicle, subscriber, or daily-counter reads through Firestore Rules or scoped Worker routes. Sensitive identity, contact, PIN, rates, balances, revenue, and commission fields are excluded. Delegate monitoring remains readable. Focused tests and the local Rules Emulator passed; full gates and preview redeployment remain required before H6 closure.

### 2026-10-07 H6 continuation — Admin preview smoke

A read-only synthetic Admin dashboard smoke passed through a temporary local proxy connected only to the isolated preview Worker. Existing synthetic Alpha/Beta fixture entries rendered and the supported logout returned to the generic login screen. No production, `main`, financial, destructive, or fixture-mutating operation was performed. This evidence is narrow and does not close H6; remaining role-specific, isolation, forbidden-action, and mobile/PWA cells remain subject to the H6 gate.

## 2026-10-07 — Additional H6 evidence: Admin People fixtures

The isolated preview-only Admin UI acceptance continued successfully after the authentication request completed. The Admin People view showed the synthetic delegate and both synthetic/QA Supervisor records. The check was read-only and did not activate mutation controls. H6 remains open for the remaining Supervisor role, isolation, forbidden-action, mobile/PWA, and financial-boundary cells.

## 2026-10-07 — Mobile/PWA asset correction

The PWA registration contract was corrected by supplying the previously missing `/sw.js`. The worker is intentionally network-only: no authenticated/API/Firebase traffic is cached or intercepted. Lint and production web build validation passed. Mobile visual/interaction coverage and offline business behavior remain separate acceptance cells.

## 2026-10-07 — PWA freeze disposition

The attempted service-worker asset correction was rejected by the repository UI/UX freeze (`public/sw.js` is a protected path). The source change was removed. Mobile/PWA registration and offline behavior remain open until explicit freeze approval is recorded; no production change occurred.

## 2026-10-07 — Vehicle/subscriber technical evidence

The non-destructive cross-runtime vehicle/subscriber/package suite passed **13 files / 62 tests**. Browser workflow acceptance remains separate and BLOCKED where it would require approved synthetic operational writes; no live or preview business record was changed.

## 2026-10-07 — Synthetic fixture setup disposition

An owner-approved synthetic garage fixture setup was attempted with a free trial and no financial action. The authenticated create request timed out at the client; no successful response or record identifier was observed and no retry was made. Credential-free direct probes confirmed preview configuration health and the unauthenticated create-route denial. Browser vehicle/subscriber workflows remain blocked pending a stable authenticated preview mutation path.


## H6 validation refresh — 2026-10-07

- Current source checkpoint: `migration/unified-hono` at `54258b5` (`fix: keep vehicle subscriber lookup outside transaction`); `main` and production remain untouched.
- Local validation is green: focused Worker/authorization/vehicle/subscriber tests **4 files / 36 tests**, full suite **102 files / 582 tests**, Firestore Rules Emulator **PASS**, lint **PASS**, production/server/Worker build **PASS**, `npm run ci:check` **PASS**, `npm run maintainability:check` **PASS**, and `git diff --check` **PASS**.
- The Supervisor policy corrections are locally enforced: monitoring list output is sanitized, direct garage/nested reads are denied through Rules, and direct Supervisor mutations are denied in Rules with Admin-only delegate mutation policy shared by Hono and Express. These changes still require isolated-preview redeployment and browser verification.
- Direct Sandbox preview probes were blocked by Cloudflare edge `403 error code: 1010`; no new authenticated browser acceptance is claimed from this environment.
- H6 remains **OPEN/BLOCKED**. Browser vehicle/subscriber lifecycle acceptance is blocked by the prior authenticated mutation timeout; financial/recharge/subscription and mobile/PWA cells remain untested under the non-payment/UI-freeze boundaries. Do not begin H7, H8, or H9.


## Isolated-preview Supervisor verification — 2026-10-07

The H5 Preview Worker for `7bc3d3f` deployed successfully and browser-side health/version probes returned HTTP 200. A fresh anonymous identity was used for a temporary synthetic Supervisor fixture, which was deleted after the checks. The Supervisor API boundary passed: monitoring list HTTP 200 exposed only `id`, `name`, `status`, `isTrial`, `carsInside`, `dailyCapacity`, and `todayCount`; no sensitive credential, contact, pricing, balance, revenue, commission, wallet, or auth-pin fields were observed. Direct garage detail and Admin summary reads returned HTTP 403, and valid-but-nonexistent synthetic vehicle check-in and subscriber update probes returned HTTP 403. Empty-body Supervisor create and Delegate update probes returned HTTP 403. The normal UI shell nevertheless remained in a generic connection/loading state after the keypad flow, so visual lifecycle acceptance remains incomplete. H6 stays OPEN/BLOCKED pending the UI authentication/loading fix and remaining safe lifecycle cells.


## Corrected browser UI routing verification — 2026-10-07

The earlier connection/loading observation was caused by the temporary public Sandbox harness: `getApiUrl` did not classify the `*.manus.computer` host as same-origin, so UI requests bypassed the preview proxy and targeted the default Worker. With the preview API base explicitly pinned to the same-origin proxy, the normal Admin login reached the full dashboard and the normal synthetic Supervisor login reached the restricted delegate-only dashboard. The temporary Supervisor fixture was deleted and both test sessions were released; no production or financial operation occurred. The prior UI blocker is resolved as a harness-routing issue. Continue H6 with the safe Garage Owner/Staff vehicle and subscriber lifecycle matrix.


## 2026-10-07 vehicle/subscriber lifecycle attempt

The isolated preview accepted one synthetic free-trial Garage fixture and a fresh Owner keypad login. With Firebase authentication plus `X-Session-ID`, Owner-scoped vehicle check-in, inside listing, and check-out returned HTTP 200. Subscriber add returned HTTP 409 (“هذا المشترك مسجل بالفعل”) on two fresh synthetic-plate attempts with valid date ranges; no subscriber ID was produced and no guessed update/renew/delete was attempted. Vehicle lifecycle is supported by this bounded live route evidence; subscriber lifecycle remains OPEN/BLOCKED pending diagnosis. The synthetic garage deletion was started with HTTP 200/`deletionStarted=true`; sessions and transient auth were cleaned up. H7–H9 remain paused.


## 2026-10-07 subscriber blocker resolved

The subscriber `409` blocker was a Worker adapter defect, not stale data: transactional Firestore queries were unsupported by `FirestoreTransaction.get`, so the add route's legacy duplicate query did not return a query snapshot. Commit `9c51979` adds transaction-aware REST `runQuery` support. All local gates passed, including 102 Vitest files/582 tests and production/maintainability checks. Live isolated-preview retest passed subscriber add, update, renew, and delete (HTTP 200 each); the synthetic garage deletion started successfully and sessions were released. H6's remaining scope is the mobile/PWA acceptance review. H7–H9 remain paused.


## 2026-10-07 H6 addendum — PWA shell evidence

The connected-browser check validated the built PWA shell: the web build passed, the existing manifest served successfully with standalone display, and the generated root-scoped service worker activated with static precaching and font-only runtime caching. No API or authenticated business-data caching was detected. The available connected browser exposed a landscape desktop viewport and did not provide mobile emulation, so mobile visual/touch/orientation and authenticated mobile workflow acceptance remain blocked. This does not close H6 or permit H7–H9.
