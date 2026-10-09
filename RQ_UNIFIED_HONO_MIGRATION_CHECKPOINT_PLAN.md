# RQ Unified Hono Migration Checkpoint Plan

## Purpose

Evaluate and, if successful, migrate RQ from the current dual-runtime structure to a unified Hono Web-Standards backend without risking the working production deployment.

## Current status — 2026-10-09

- **Authorized branch/verified code-test baseline:** `migration/unified-hono`; the latest workflow-verified code/test baseline was `ae8ab8099e11de07da5d2d87d9a1c863eb6983d1`. A subsequent documentation-only synchronization may produce a newer HEAD; verify actual local/remote HEAD and workflows before acting.
- **Exact-head workflows:** H5 Preview Worker [37807079547](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079547) and Production Gate [37807079550](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079550) both passed for that SHA. The Production Gate is validation; it did not deploy production.
- **Latest relevant source/config/test changes:** `30cccf48d71dcf2e7890c09f3f8bfd3aed7c79a6` sets and tests the 30-second garage-delete timeout. `40da805` changes only `wrangler.preview.toml` to allow the stable migration Pages origin; production `wrangler.toml` remains unchanged. `ae8ab80` adds only opt-in read-only Playwright test infrastructure and documentation, not product behavior.
- **Production:** `main` and the current production Worker/Pages remain unchanged; no cutover is authorized.
- **H6 execution authority:** follow `docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`; use the detailed role report and integrated report as existing evidence, not as new instructions. Reuse valid evidence and work unresolved/invalidated cells only; do not rebuild the application or repeat the entire matrix.
- **H6 is closed for scope by explicit owner residual-risk acceptance:** the Pages-to-preview-Worker pairing and preview-only CORS correction were verified for a recorded fresh non-production deployment, followed by one bounded Admin login/dashboard/read-only navigation/logout **PASS**. Staff operational access remains **OPEN/BLOCKED**, Owner listener delivery remains **OPEN/UNVERIFIED** with partial cleanup evidence, and financial workflows remain intentionally blocked without an isolated sandbox; these are accepted residual risks, not PASS results. Supervisor is retired by explicit owner decision; local denial/preservation regressions are validated. **H7 is now IN PROGRESS** and must independently evaluate its GO/HOLD conditions against the exact candidate.
- **Automation:** an opt-in read-only Playwright smoke checks the generic login shell and isolated Worker health/version endpoints; it is not role-acceptance E2E and is not in default CI. See `docs/H6_PLAYWRIGHT_PREVIEW_HARNESS.md`; do not claim that it closes any H6 role cell.
- **UI/UX:** preserve the freeze; no redesign is authorized. The sole role-policy exception is the explicitly owner-approved, non-destructive Supervisor retirement; no other business-rule changes are authorized by this status.
- **Next checkpoint:** H7 is **HOLD/NO-GO** until required H6 gates close. No process can guarantee zero bugs; document residual risk honestly.
- **Succession rule:** if the owner says exactly `tokens ending`, follow the protocol in `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` before doing other work.

Dated H6 continuation sections later in this plan preserve test history. Any point-in-time “next checkpoint” or “continue H6” notes in those addenda are historical; follow this current status and `docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md` instead.

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
5. Keep Firebase authentication, Firestore data, tenant isolation, role permissions, idempotency, audit logging, and session behavior unchanged except for explicit, documented owner-approved policy decisions; Supervisor retirement is such a decision and must preserve legacy records.
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
  - Retired Supervisor negative-path tests only; preserve existing records
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

# Checkpoint H6 — Controlled preview acceptance and role testing

## Objective

Test the new architecture as a human user, not only as a developer, using repeatable evidence on the isolated preview.

## Controlling procedure

Follow [`docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`](docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md) for the execution order, safety rules, evidence fields, retry/timeout handling, fixture cleanup, and status vocabulary. `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md` remains the coverage catalog and matrix. The runbook controls where older examples conflict; its restrictions do not authorize production access, financial writes, or changes to permissions.

## Execution sequence

1. Record branch, exact commit, clean worktree, workflow status, preview Pages URL, preview Worker URL/version, browser, and pre-existing defects.
2. Verify the tested Pages preview serves the candidate frontend and its API calls target only `rq-hono-preview`. If this Pages-to-Worker path cannot be verified, mark it BLOCKED; a temporary local Vite proxy is diagnostic only and does not satisfy this exit gate.
3. Use run-specific synthetic fixtures and a manifest. Keep writes serialized; after an ambiguous mutation timeout, reconcile through approved read-only UI/preview observability and do not blindly retry.
4. Test one role in a fresh browser context at a time, covering the existing matrix's allowed and denied actions, server-derived role/scope, persistence, and relevant audit/idempotency behavior. Use desktop and 390×844 portrait/touch coverage where the case applies.
5. Supervisor is retired by owner decision: do not perform manual role acceptance or inspect/change legacy records; require local denial-and-preservation regressions only. Use an active synthetic free-trial context for Staff; do not purchase a package or top up a balance. Leave unresolved outcomes OPEN/BLOCKED.
6. Do not execute payment, recharge approval, wallet, transfer/settlement, or package/subscription purchase/renewal without a dedicated isolated financial sandbox and explicit authorization. Otherwise retain those cells as OPEN/BLOCKED.
7. Use the supported UI for cleanup; confirm deletion/job completion evidence and fresh-list absence. Release sessions and remove temporary proxy/configuration artifacts.

## Automation status

An opt-in Playwright smoke exists for the generic login shell plus read-only health/version calls to the isolated Worker; it is pinned to the stable migration Pages origin, has zero retries, and is not wired into default CI. It is not authenticated role-acceptance E2E and closes no H6 cell. Any broader harness must be separately reviewed, fail closed for production, keep credentials out of source/storage state, serialize mutations, disable blind retries, and verify cleanup. Vitest/API/rules tests complement but do not replace the Pages-to-Worker role-acceptance gate.

## Exit criteria

- All required role workflows have evidence through the verified Cloudflare Pages preview to the isolated preview Worker; no temporary local proxy is substituted for this gate.
- No role is silently downgraded to an anonymous or worker role.
- Required popup actions work on mobile and desktop.
- Every required feature-by-role cell is resolved with evidence; authorization/scope, persistence, and cleanup are verified where applicable. Explicit owner exclusions remain labeled untested and include the accepted residual risk.
- No UI/UX redesign is introduced.

H6 is **OPEN/BLOCKED** until these criteria are met. Documentation updates, green unit tests, or a successful health endpoint alone do not close role acceptance.

---

# Checkpoint H7 — Production cutover decision

## Objective

Decide whether the unified Hono branch is actually ready to replace the current production architecture.

## Required approval conditions

H7 is an evidence-based **GO/HOLD** decision, not a guarantee of zero defects. A GO is eligible only after H6 is complete and every condition below is satisfied; if H6 or another required gate is blocked, record **HOLD/NO-GO** and keep production unchanged. The migration is ready only if:

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
- The owner has explicitly approved the release decision and any documented residual risks.

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


## 2026-10-07 final H6 matrix disposition

Final local gates passed on the migration branch: 102 Vitest files / 582 tests, TypeScript lint, web/server/Cloudflare Worker builds, CI check, maintainability check, and diff check. H6 remains open because true mobile-device/touch acceptance is unavailable in the connected browser environment and financial/recharge/wallet/subscription-purchase workflows remain intentionally untested. H7–H9 remain blocked; no production or `main` change is authorized by this disposition.


## 2026-10-07 mobile-emulation shell result

Real sandbox Chromium emulation at 390×844 portrait with five touch points passed the PWA login-shell, layout, and harmless keypad touch smoke check. The standalone manifest and active root-scoped service worker were also verified. Authenticated mobile workflows, offline business behavior, and all financial/recharge/subscription workflows remain open or untested; this result does not close H6.


## 2026-10-07 authenticated mobile continuation — transport block

The mobile shell passed, but the authorized synthetic Admin mobile login could not reach a dashboard because the temporary same-origin preview proxy returned HTML 500 and Node logged TLS `EPROTO wrong version number` when contacting the isolated Worker. Keep authenticated mobile workflows **BLOCKED/UNVERIFIED** until preview transport is healthy; do not infer a product regression or close H6.


## 2026-10-07 authenticated mobile Admin result

The isolated preview Worker recovered to HTTP 200 health. A 390×844 portrait, five-touch Chromium session completed synthetic Admin login, rendered the read-only dashboard, and restored the dashboard session after reload once the test harness reapplied portrait metrics. Admin mobile login/dashboard/session persistence is **PASS**. Other role-specific mobile workflows and financial/recharge/subscription workflows remain open.


## 2026-10-07 offline safety-gate result

The credential-free PWA shell loaded online at 390×844 portrait with an active service worker; when network emulation was disabled and the page reloaded, the explicit offline guard blocked login and business controls. Offline safety gate is **PASS**. Offline authenticated business operation remains intentionally unsupported/unverified.


## 2026-10-07 Admin mobile read-only navigation

Admin mobile acceptance now includes the dashboard plus normal read-only **Garages** and **People** screens at 390×844 portrait with five-touch emulation. Both rendered synthetic data successfully; no write or financial control was activated. **PASS.**


## 2026-10-07 temporary Supervisor mobile result

Supervisor mobile acceptance is **PASS**: a desktop-provisioned synthetic Supervisor logged in at 390×844 portrait with five-touch emulation and saw only the restricted delegate-monitoring dashboard. Temporary synthetic Supervisor records were deleted and verified absent. Delegate, Staff, and Garage Owner mobile role coverage remains open; financial/recharge/wallet/subscription-purchase flows remain intentionally untested.


## 2026-10-07 temporary Delegate mobile result

Delegate mobile acceptance is **PASS**: a temporary synthetic Delegate logged in at 390×844 portrait with five-touch emulation and saw the restricted Delegate dashboard, including garage and performance sections without Admin navigation. The temporary Delegate was revoked and verified absent. Staff and Garage Owner mobile coverage remains open; financial/recharge/wallet/subscription-purchase flows remain intentionally untested.


## 2026-10-07 Staff mobile continuation

Staff mobile acceptance remains **BLOCKED/UNVERIFIED**: supported Admin Staff creation returned without creating a record on both an expired synthetic garage and the active QA Garage Beta. No Staff mobile login was attempted and no temporary Staff data remains. Garage Owner mobile coverage and financial/recharge/wallet/subscription-purchase flows remain open.


## 2026-10-07 Staff and Garage Owner mobile continuation

The Staff-create UI correction now updates the Admin's in-memory Staff list immediately after successful create/delete and presents localized failures; the focused component regression test passed. Full local validation also passed: 102 Vitest files / 583 tests, TypeScript lint, production/web/server/Cloudflare build, `npm run ci:check`, maintainability, and `git diff --check`.

A temporary Staff account authenticated in 390×844 portrait, five-touch Chromium (HTTP 200, role `staff`) with no horizontal overflow. The exhausted-balance gate prevented access to the operational dashboard; no financial action was taken. Staff authentication/layout are PASS, but Staff operational acceptance is BLOCKED/UNVERIFIED. The Staff fixture was removed through Admin and verified absent.

A synthetic free-trial Owner account authenticated in the same mobile viewport (HTTP 200, role `garage`) and rendered its dashboard with no horizontal overflow or Admin-only labels. Initial Owner login/dashboard rendering are PASS; session persistence and further Owner workflows remain untested. One Firestore Listen-channel failure and one uncaptured console error leave real-time listener health OPEN/UNVERIFIED.

Owner-fixture cleanup is not verified: the supported Admin delete endpoint returned HTTP 200 but, per Worker source, only sets `isDeleting=true`, writes a running deletion-job record, and responds `deletionStarted=true`. The garage remained listed after reload; repository search found no in-repository job consumer. Do not claim physical deletion, repeat the request, or mutate the database directly. H6 remains OPEN/BLOCKED pending this cleanup disposition, Staff operational acceptance in a safe non-financial context, Owner persistence/listener checks, the previously documented Supervisor permission-scope mismatch, and all remaining required role cells. Financial workflows remain intentionally untested. H7–H9 remain pending; no production or `main` change is authorized by this status.


## 2026-10-07 H6 cleanup continuation — inline Hono deletion completion

The prior note at the end of this plan accurately describes the earlier `deletionStarted=true` behavior, but it is superseded by source commit `bb53570` (`fix: complete Hono garage deletion before success`) on `migration/unified-hono`. The H5 Preview Worker workflow and Production Gate for that source head completed successfully.

In the isolated preview, the sole synthetic `Staff QA` entry was deleted through the named garage’s Admin Staff panel; the refreshed panel showed zero staff. The named synthetic garage `H6 Staff Operational 20261007` was then deleted through the supported Admin detail-menu confirmation flow. The UI displayed progress (50/100), returned to the Admin garage list, and after a fresh navigation/reload the target garage was absent. No other record was targeted; no direct Firestore mutation or retry was used.

Source review confirms the current Worker route calls `deleteGarageOwnedData`, deletes the garage root, writes `garage_deletion_jobs.status=completed`, and then returns success. The UI’s return to the list and fresh-list absence are runtime evidence of success; the job document itself was not directly queried. Normal Admin logout returned to the generic preview login screen. The temporary preview UI process/config were stopped and removed. Production and `main` remain untouched.

**Disposition:** the two named synthetic cleanup items are **PASS** through the supported preview UI. H6 remains **OPEN/BLOCKED** for the separate Staff operational gate, Owner persistence/listener checks, and intentionally untested financial/recharge/subscription workflows. H7–H9 remain paused; this continuation does not authorize a production cutover.

### Post-cleanup validation — 2026-10-07

The focused garage-deletion/operational-policy/Worker regression run passed **3 files / 13 tests**. `npm run ci:check` passed clean-install verification, TypeScript lint, **102 Vitest files / 584 tests**, production build, and artifact verification. `npm run maintainability:check` and `git diff --check` passed. Generated `dist/` and `build/` artifacts were cleaned. The change remains confined to `migration/unified-hono`; the H5 Preview Worker and Production Gate had both passed for source head `bb53570`. H6 is still OPEN/BLOCKED; H7 has not begun.


## 2026-10-07 H6 Owner reload retest and delete-timeout correction

A separately named synthetic preview fixture, `H6 Owner Listener Retest 20261007`, authenticated through the supported Owner UI. After one full-page reload, the same Owner dashboard and 48-hour free-trial balance returned, with local session-presence state retained; bounded desktop reload persistence is **PASS**. The sampled Firestore Listen resources reported status 200 (12 before and 11 after refresh), and no filtered console/unhandled errors were captured, but no synthetic data-change event was exercised. Real-time listener delivery therefore remains **OPEN/UNVERIFIED**. The browser was desktop-sized with zero touch points; no mobile result is claimed.

The exact new fixture's standard Admin deletion flow remained at 50%. Its browser resource-timing entry ended with status 0 at approximately 15 seconds, consistent with the API client's default timeout. No success response or deletion-job status was observed. A later fresh Admin garage list omitted the target; record only **absent from fresh Admin list, completion response/job status unverified**. No retry or direct database mutation was performed. The older Owner fixture cleanup blocker is a separate record and remains unresolved. The Owner and Admin sessions were signed out normally; the temporary preview process/config were stopped/removed, and port 4173 was closed.

Per the owner's explicit direction, `garageService.deleteGarage` now passes `timeoutMs: 30_000` only to the `/api/garages/delete` request. The regression test verifies the request body and that the API client schedules a 30,000 ms timeout. This improves the wait window but does not implement asynchronous deletion-status polling; operations exceeding 30 seconds may still produce an ambiguous client result and warrant a durable status flow.

**Validation:** focused deletion/policy/Worker tests passed (**4 files / 14 tests**); `npm run ci:check` passed (**102 Vitest files / 584 tests**, production bundling and artifact verification); `npm run maintainability:check` and `git diff --check` passed. Build artifacts were removed.

**Disposition:** this continuation closes only the bounded desktop reload-persistence check and confirms the new synthetic name is absent from a fresh Admin list. It does not close Owner listener delivery, mobile Owner acceptance, the older Owner cleanup blocker, Staff operational acceptance, Supervisor permission findings, other role/route cells, or intentionally untested financial workflows. H6 remains **OPEN/BLOCKED**; H7–H9 remain pending. No production deploy, production mutation, or `main` change occurred.


## 2026-10-07 H6 final continuation — Staff active-trial retest and matrix status

The garage-delete timeout fix is on pushed migration-branch commit `30cccf48d71dcf2e7890c09f3f8bfd3aed7c79a6`. For that code head, H5 Preview Worker run [37656824592](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37656824592) and Production Gate run [37656832793](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37656832793) both passed. Local validation passed 102 Vitest files / 584 tests, lint, builds, `npm run ci:check`, maintainability, and `git diff --check`.

To reconcile the Staff-create transport ambiguity without performing another write, the stable preview Admin flow inspected the documented `QA Garage Beta` fixture read-only. Its Staff panel showed exactly one synthetic `Mobile QA Staff` row with the PIN masked. This is consistent with a late backend completion after the client wait ended; no create retry or deletion was performed. No Staff login/operational workflow was attempted because no usable PIN was exposed. The Staff transport cell is **PARTIAL**, while Staff operational access remains **OPEN/BLOCKED**. The owner-directed timeout remains unchanged; no Staff timeout code was changed. The 30-second timeout remains limited to `/api/garages/delete`.

The current H6 matrix status is:

- **PASS, bounded:** Admin read-only mobile navigation; Delegate and Supervisor restricted mobile dashboards; PWA shell/offline guard; Owner desktop reload persistence; Owner vehicle check-in/list/check-out; Owner subscriber add/update/renew/delete; prior separate-fixture Staff authentication/scope checks.
- **PARTIAL / OPEN/BLOCKED:** Staff transport reconciliation found the synthetic `Mobile QA Staff` row, but Staff operational access beyond the balance gate remains untested because no usable PIN was exposed; Owner real-time listener event delivery (source audit and **2 files / 15 focused tests** pass, but one live synthetic check-in remained ambiguous with no listener update and was not retried); Supervisor global-versus-assigned garage-read boundary; Owner cleanup completion/job status where fresh-list absence followed a 50% deletion progress state but job completion was not observed; remaining untested role/route cells.
- **OPEN/BLOCKED — intentionally untested:** payment, recharge, wallet top-up, transfer/settlement, package/subscription purchase or renewal, and other financial writes. These are not PASS based on unit tests or non-financial smoke checks.

The supported Admin logout completed through the preview UI; PIN verification and server session release returned HTTP 200. The temporary proxy/config/captures were removed and port 4173 was verified closed. No production or `main` mutation occurred.

**Decision:** H6 remains **OPEN/BLOCKED**. H7 has not started; do not begin production cutover until the remaining required cells are either safely verified or explicitly accepted out of scope by the owner. Production remains on its existing release and rollback target.


## 2026-10-08 H6 controlled-process adoption — current instruction

`docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md` is now the controlling H6 procedure. It replaces ad hoc click-throughs and makes the required Pages-preview-to-`rq-hono-preview` binding, serialized writes, no-blind-retry rule, evidence schema, cleanup confirmation, and explicit HOLD/NO-GO behavior mandatory. The older `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md` remains the feature coverage catalog; its historical financial/destructive examples are not permission to run those actions under the current safety boundary.

Current H6 status is unchanged: **OPEN/BLOCKED** for a verified Pages-to-Worker browser path, Staff operational access in a valid free-trial context, the Supervisor global-versus-assigned policy, Owner listener event delivery/cleanup evidence, and financial cases without an authorized isolated sandbox. At the time of this dated status note no Playwright harness existed; see the current status above and the later read-only smoke addendum below. H7 must remain **HOLD/NO-GO** while required gates are unresolved. Neither this plan nor successful CI can certify “100% bug-free.” Production and `main` remain untouched.


## 2026-10-08 continuation — read-only Playwright preview smoke

Commit `ae8ab8099e11de07da5d2d87d9a1c863eb6983d1` adds `@playwright/test` as a development dependency, a separately invoked `npm run test:e2e:preview`, an exact-origin guard, and one read-only login-shell/Worker-health smoke. The runner rejects missing, production, and arbitrary Pages targets; it is single-worker, zero-retry, emits no screenshots/traces, and is not part of default CI. It makes no login or business/financial writes.

Local smoke: **1 test passed** against `https://migration-unified-hono.rq-acg.pages.dev`, verifying the generic login shell and CORS-enabled `/api/health` and `/api/version` calls to `rq-hono-preview`. Local lint, `npm run ci:check` (**102 files / 584 tests** plus production build/artifact verification), maintainability, and diff checks passed. Exact-head H5 Preview Worker [37807079547](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079547) and Production Gate [37807079550](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079550) both passed; H5 verified the preview bundle and deployed the isolated Worker. This narrow smoke is not role-acceptance E2E, does not prove the current Pages deployment serves the exact candidate, and closes no H6 matrix cell. H6 remains OPEN/BLOCKED; H7 remains HOLD/NO-GO.
