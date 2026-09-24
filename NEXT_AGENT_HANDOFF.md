# RQ Next-Agent Handoff

**Last updated:** 2026-09-23
**Repository:** `tarekhamada875-droid/RQ-`
**Local path:** `/home/ubuntu/RQ-`
**Current branch:** `main`
**Latest published commit:** `e67348c docs: record shadow telemetry coverage`
**Working tree at handoff:** clean and synchronized with `origin/main`; shadow-comparison telemetry coverage and succession evidence are published directly to `main`.

## Read this first

This is a controlled backend-overhaul project. The legacy backend remains the production authority. `server-v2` is a guarded replacement foundation and preview capability. Do not migrate production traffic, financial writes, or data ownership without explicit evidence, rollback testing, and an updated plan.

Read these files before changing code:

1. `BACKEND_COMPLETE_OVERHAUL_STAGES.md` — canonical master plan and stage status.
2. `BACKEND_OVERHAUL_HANDOFF.md` — current evidence, blockers, and slice history.
3. `RAILWAY_DEPLOYMENT_HANDOFF.md` — production deployment contract.
4. This file — current operating method, MCP restoration procedure, and next action.
5. The relevant legacy route/repository, matching v2 contract/repository, and existing tests.

## Current verified state

The latest implementation commit is:

```text
5e2bba2 feat: add active session management
```

It adds:

- `GET /api/auth/sessions` for a Firebase-authenticated user’s redacted active-session list.
- `DELETE /api/auth/sessions/:sessionKey` for revoking one device session.
- SHA-256 opaque session identifiers; raw session IDs, UIDs, names, and credentials are not returned.
- Per-device revocation restricted to the caller’s own UID and role.
- Root and entity active-session marker synchronization.
- Backend-operator tokens explicitly blocked from user-session management endpoints.

The previous multi-device implementation is `db0b4a5`; the CI propagation fix is `f0a5b20`.

Successful Production Gates:

```text
5e2bba2 active-session implementation: 35815476395
f0a5b20 Railway propagation wait: 35773357754
259bbc3 prior documentation: 35770479204
```

The Production Gate now cancels obsolete runs, waits up to ten minutes for Railway propagation, and verifies that `/api/health` serves the exact GitHub commit SHA. Its workflow is `.github/workflows/production-gate.yml`.

Local validation for the current implementation passed:

```text
npm run lint
npm run lint:v2
focused session-marker tests
Firebase-emulator-backed npm run check:v2
npm test
npm run build
npm run maintainability:check
git diff --check
```

Do not trust old test counts or commit references in historical sections without checking `git log`, current files, and the latest GitHub run.

## Current architecture and safety boundaries

```text
Cloudflare Pages: https://rq-acg.pages.dev
        |
        v
Railway API: https://rq-production-af02.up.railway.app
        |
        v
Firebase Authentication + Firestore
```

The legacy Express backend and its financial routes remain authoritative. Firestore and immutable business events remain authoritative data sources. Dashboard summaries, projection buckets, caches, and telemetry are rebuildable read models.

Never:

- enable production `VITE_V2_READ_*` flags as part of foundation work;
- migrate financial authority to v2;
- delete legacy routes or production data;
- convert the intentionally non-destructive garage deletion job into a physical delete writer;
- use an old Cloudflare preview as current-build evidence;
- create a branch merely to manufacture a preview for validation;
- print, commit, paste, or expose secrets;
- use the Railway operator token as a Firebase user token;
- treat an operator-MCP health response as proof of Firebase-authenticated frontend behavior.

Known external blocker: the last Cloudflare inspection found no current non-production preview for the current `main` build. The available preview was stale. When a natural current preview appears, use a Firebase-authenticated browser session to validate the Cloudflare-to-Railway path. Do not bypass this by changing production flags.

## Exact working method used successfully

For every new slice:

1. Verify `git status --short --branch`, `git log -3 --oneline`, current plan, handoff, and relevant source.
2. Inspect the legacy behavior and matching v2 contracts/repositories/routes/tests.
3. Select one bounded, reversible, preferably read-only or non-financial capability.
4. Implement it using existing repository conventions for auth, scope, envelopes, idempotency, audit, redaction, and emulator tests.
5. Add focused tests for valid behavior, invalid input, authentication, authorization, cross-scope access, replay/concurrency where relevant, and production non-exposure.
6. Run focused tests first, then the complete validation gate:

   ```bash
   npm run lint:v2
   npm run test:v2 -- <focused-tests>
   npx --yes firebase-tools@15.30.2 emulators:exec --only firestore --project rq-v2-agent-check "npm run check:v2"
   npm test
   npm run lint
   npm run build
   npm run maintainability:check
   git diff --check
   ```

7. Review `git diff --stat`, every changed file, secret exposure, flags, generated artifacts, and `git status`.
8. Direct pushes to `main` are authorized in this project. Commit only the focused files, push, and watch the Production Gate.
9. Do not call a slice complete until the relevant GitHub Gate succeeds.
10. Update both `BACKEND_OVERHAUL_HANDOFF.md` and `BACKEND_COMPLETE_OVERHAUL_STAGES.md` with exact commits, gate IDs, validation evidence, limitations, and next action.

## Railway MCP: restore or recreate it safely

The Railway MCP is deliberately outside the repository at:

```text
/home/ubuntu/rq-backend-mcp
```

Never move it into `RQ-`, `server-v2`, or the frontend. The reference files are:

```text
/home/ubuntu/rq-backend-mcp/server.mjs
/home/ubuntu/rq-backend-mcp/smoke-test.mjs
/home/ubuntu/rq-backend-mcp/live-check.mjs
/home/ubuntu/rq-backend-mcp/README.md
```

It is a read-only stdio MCP with exactly two tools:

```text
backend_health
read_backend_endpoint
```

It uses only `GET`, adds a server-to-server operator header, creates request IDs, enforces a bounded timeout, safely parses/truncates responses, and allows only:

```text
/api/health
/api/system-config
/v2/health
/api/v2/health
/v2/packages
/api/v2/packages
```

It must not gain POST/PUT/PATCH/DELETE, arbitrary URLs, shell execution, Firestore access, token inspection, or business-operation tools.

Required environment variables are configured outside Git:

```text
RQ_BACKEND_URL=https://rq-production-af02.up.railway.app
BACKEND_OPERATOR_TOKEN=<private token; never place in this file>
RQ_BACKEND_TIMEOUT_MS=10000
```

The same private operator token must be configured as `BACKEND_OPERATOR_TOKEN` in Railway and in the MCP connector environment. It is not the Firebase user token. A successor must autonomously inspect, restore, or build this MCP and run its safe checks; do not stop to ask the user to explain the MCP or grant routine setup permission. If the protected token is missing, do not invent, print, commit, or place it in this handoff. The only expected human boundary is the Railway dashboard: tell the user the exact variable name `BACKEND_OPERATOR_TOKEN` and have them set or rotate its protected value there, then continue with non-secret validation. Do not ask the user to paste the secret into chat. The local token file, if present, must stay outside Git with mode `600`:

```text
/home/ubuntu/rq-backend-mcp/.operator-token
```

To recreate the external directory if it is missing:

```bash
mkdir -p /home/ubuntu/rq-backend-mcp
cd /home/ubuntu/rq-backend-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
```

Then restore `server.mjs` from the existing reference or implement the same `McpServer` + `StdioServerTransport` design. Do not put the token in command arguments or source files.

Inspect connectors before changing them:

```bash
manus-config config load --search railway
manus-config connector list --user-custom-only
```

Register or restore the connector through the connector-management workflow, not by editing `/home/ubuntu/.manus/config/config.json` directly. Put secrets only in connector environment fields. A user approval card may be required; do not bypass it.

Safe local checks, without printing credentials:

```bash
cd /home/ubuntu/rq-backend-mcp
node smoke-test.mjs
node --check server.mjs
node --check live-check.mjs
```

The MCP is an operator diagnostic boundary only. It is not a replacement for Firebase authentication and it is not evidence of a real authenticated Cloudflare preview.

## Current plan and next move

### Completed current slice: frontend session-management UI and gate correction

Commit `9bbcb5a` adds the user-facing Settings/Active Devices screen and typed client service:

- `src/services/sessionService.ts` calls both authenticated endpoints and validates response shapes and 64-character opaque keys.
- `src/components/admin/AdminActiveSessionsView.tsx` displays redacted entries, current status, timestamps, refresh, errors, and confirmation before revocation.
- Current-session revocation delegates to the existing logout callback; no new auth authority was introduced.
- `src/components/admin/AdminNavigationAndViews.tsx` and `AdminDashboard.tsx` wire the screen into admin settings.
- Local `npm test -- --run` passed: 56 files and 300 tests. `npm run build` passed.
- The initial gate for documentation tip `6f8172f` failed in `verify/Typecheck` because the component destructured an unused `t` prop (`TS6133`). Commit `b5b681b` removes only that unused destructuring; Production Gate `35822201327` passed, including typecheck, tests, production build, v2 foundation, artifact, maintainability, and live smoke checks.
- Commit `647e251` adds five focused `sessionService` tests covering valid list responses, malformed list rejection, DELETE construction for valid opaque keys, invalid-key rejection before network access, and mismatched revoke responses. Production Gate `35823053960` passed.
- Commit `eb19593` adds three React/jsdom tests covering session loading, non-current revocation with success feedback, and current-session revocation with logout. Production Gate `35823805861` passed.
- Commit `b1aae73` adds two v2 adapter tests covering URL-encoded pagination cursors/bounded limits and malformed bounded-page rejection. Production Gate `35824735761` passed.
- Commit `9b42c8f` fixes a shared contract defect found by the dashboard-report boundary test: `DateKeySchema` previously accepted impossible dates such as `2026-99-99`. It now validates real calendar dates, with foundation and report-route coverage for invalid dates and stale projections. Production Gate `35826313877` passed.
- Commit `3b1f018` adds [`docs/projection-repair-worker-runbook.md`](docs/projection-repair-worker-runbook.md), defining bounded invocation, preconditions, redacted evidence, stop/rollback controls, and the explicit status that the worker is not deployed or automatically triggered. Production Gate `35827534873` passed. The corrected full validation sequence passed after keeping Firestore-dependent checks inside the emulator.
- Commit `693fdb8` adds projection-status route coverage for impossible-date rejection before repository reads and redaction of repository failures behind the generic `INTERNAL_ERROR` envelope. Production Gate `35834417741` passed. No runtime behavior, production flag, financial authority, or production data changed.
- Commit `54bd219` makes projection-repair queue completion/failure fail closed after `leaseUntil`, returning `REPAIR_TASK_LEASE_EXPIRED` without changing queue state. Emulator coverage and the projection-repair runbook now document the lease rule. Production Gate `35837731215` passed. No production worker, scheduler, financial authority, or production data changed.
- Commit `6fb49c6` adds shadow-telemetry coverage for authorization mismatches and verifies that the console sink emits aggregate counters without mismatch payloads or raw error text. Production Gate `35840179976` passed. No production shadow traffic, flag, financial authority, or production data changed.
- Commit `e67348c` records the verified telemetry handoff state. Production Gate `35840571252` passed. The user asked whether a non-production Cloudflare preview should be created to bypass the blocker; the decision recorded here is **not to create one in the current slice**. A dedicated non-production environment is a separate infrastructure workstream requiring an updated plan, isolated Railway/Firebase/Cloudflare configuration, secret/data isolation, and rollback/teardown controls.
- Cloudflare Pages was rechecked on 2026-09-23 after `061204e`: project `rq` has latest deployment `fdf79720` for `main`/`061204e`, and every listed deployment is `environment: production`; there is still no current non-production preview URL. Preview configuration has package-catalog enabled, but that does not make a production deployment eligible for authenticated preview evidence.

The normal UI test harness has no dedicated component test added yet; add focused service/component coverage only in a later small slice if the existing test environment supports it.

The latest published commit is gate-verified by `35840571252`; the prior validation-command failure was environmental (Firestore queue tests were initially run without the emulator), then the corrected sequence passed.

### Completed bounded read-only migration-evidence task

No current non-production Cloudflare Pages preview exists. Read-only Cloudflare inspection on 2026-09-23 found `main` production deployment `52388dd0` built from `6f8172f`; the newest preview remains stale deployment `7ff4c62e` from branch `feat/backend-operator-mcp-auth`, commit `1c60a0d`, created 2026-09-19. Do not use it for current authenticated Firebase-browser evidence, create a branch to manufacture a preview, or change production flags.

Local normalized migration evidence passed in 4 focused v2 test files with 16 tests: stable normalization/order, timestamp tolerance, redacted financial/authorization mismatch classification, equal-comparison v2 permission, v2-read fallback to legacy, legacy-read blocking, rollback safety, admin route validation, and disabled-flag non-exposure. The full validation gate also passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. This remains read-only evidence; no production shadow traffic or cutover is enabled.

### Then resume the overhaul order

1. Keep `e67348c` and Production Gate `35840571252` as the verified current tip.
2. If a natural current authenticated Cloudflare preview appears, perform Firebase-browser checks for v2 health, package reads, garage summary, and session behavior.
3. Through that preview, repeat normalized legacy/v2 package and garage-summary comparisons and classify every difference.
4. Exercise v2-failure fallback and legacy-failure blocking in the authenticated preview; no unexplained financial or authorization mismatch is acceptable.
5. Continue remaining non-financial repositories, reports, projection-worker operational preparation, and local migration evidence in parallel. Treat a dedicated non-production Cloudflare/Railway/Firebase environment as a separately approved infrastructure phase; do not create it merely to bypass the current preview blocker.
6. Progressive read cutover: internal users, one garage, small cohort, larger cohort, all eligible reads.
7. Financial authority migration only after reconciliation, cost/SLO evidence, and rollback testing.
8. Retire legacy paths only after migration and rollback-window expiration.

## Cleanup and source-of-truth rules

The repository contains several historical documents. Keep them unless they are demonstrably obsolete; update canonical status instead of deleting project history. The canonical current documents are:

- `NEXT_AGENT_HANDOFF.md` — this operating handoff.
- `BACKEND_OVERHAUL_HANDOFF.md` — evidence and slice history.
- `BACKEND_COMPLETE_OVERHAUL_STAGES.md` — master stage plan.
- `RAILWAY_DEPLOYMENT_HANDOFF.md` — deployment contract.

Generated local artifacts such as `firestore-debug.log` and `dist/` are ignored and disposable. Do not commit them. The external MCP directory, `.operator-token`, and its lockfile are not repository files; preserve the MCP source and protect the token.

## Final handoff rule

At the end of every slice, leave the repository clean, the exact commit and CI run recorded, the next action explicit, and no secret in source, logs, test fixtures, or documentation.

## Token-ending succession trigger

If the project owner sends the exact phrase **`tokens ending`**, treat it as an immediate handoff request. Do not begin another feature. First inspect the current git status, branch, `HEAD`, recent commits, GitHub Production Gate, changed files, tests, deployment state, blockers, and MCP availability. Then update this file as the canonical operating guide and update the relevant historical and plan documents with exact commit SHAs, test commands and outcomes, CI run IDs, deployment evidence, known limitations, and the next bounded task.

Keep secrets out of chat, files, commits, logs, and frontend code; refer only to secure variable names and the protected MCP restore procedure. Remove duplicate documentation only after verifying that it is not referenced by CI or required checks. Run the repository validation and confirm a clean tree. End with a copy-paste message for the next agent that names the repository, canonical handoff file, completed work, exact next task, safety boundaries, required verification, and the requirement to repeat this succession protocol if the next agent receives **`tokens ending`**.


### External Railway MCP restoration — 2026-09-23

The external read-only Railway MCP workspace was absent and has been restored outside the repository at `/home/ubuntu/rq-backend-mcp`. The restored implementation exposes only `backend_health` and `read_backend_endpoint`, uses only bounded `GET` requests, enforces the six-path allowlist documented above, adds bounded timeouts and response truncation, generates request IDs, and never performs shell execution, Firestore access, token inspection, or business operations. `node --check server.mjs`, `node --check live-check.mjs`, and `node smoke-test.mjs` passed without a protected token. No connector was created because `BACKEND_OPERATOR_TOKEN` is not present; do not invent, print, commit, or paste it. The only human action is to set or rotate the protected Railway dashboard variable `BACKEND_OPERATOR_TOKEN`, after which connector registration must use the supported `manus-config` workflow with the secret kept in connector environment fields. The local MCP files remain outside Git and the operator token file, if later supplied securely, must remain mode `600`.


### Projection repair worker fail-closed hardening — 2026-09-23

Commit `05b377f` makes `ProjectionRepairWorker` stop processing after an unexpected repository exception, returning only the redacted `REPAIR_FAILED` code for that task; known classified repository failures continue as bounded task-level results. Focused worker tests and the complete corrected emulator-backed validation sequence passed. The runbook records this behavior. The worker remains library-only, undeployed, unscheduled, and disconnected from automatic production mutation. No production flag, financial authority, legacy route, or production data changed. Continue with bounded non-financial evidence while the current authenticated Cloudflare preview remains blocked.


### Live Railway MCP boundary evidence — 2026-09-23

The enabled read-only Railway MCP verified `/api/health` as `200` with `adminSdk: true` and exact version `b75a024746a692e3d6f89de561b65730e6eae257`; `/api/v2/health` as `200` with production/non-emulator status; `/api/system-config` as `200` without recording its payload; and unauthenticated `/api/v2/packages` as `401 Missing Firebase ID token`. These are operator and unauthenticated boundary checks only, not Firebase-authenticated Cloudflare preview evidence. No production flag or authority changed; continue bounded non-financial work while the current preview remains blocked.


### Projection repair queue expired-failure coverage — 2026-09-23

Commit `3797734` adds Firestore-emulator coverage that expired workers cannot fail repair tasks or mutate their `running` state. The focused queue suite passes 6 tests. A transient unrelated vehicle-concurrency timeout occurred in the first full gate attempt; isolated reproduction passed and the corrected full gate passed. The queue remains lease-owned, undeployed, unscheduled, and disconnected from production mutation.


### Projection repair queue retry timing coverage — 2026-09-23

Commit `c3b76b3` adds emulator-backed proof that failed repair tasks cannot be reclaimed before their bounded retry timestamp and can be reclaimed at the due time. The focused queue suite passes 7 tests and the complete corrected validation gate passes. The queue remains lease-owned, undeployed, unscheduled, and disconnected from production mutation.


### Authenticated preview read-route boundary coverage — 2026-09-23

Commit `6b8964d` adds coverage that package, garage-summary, pending, and activity reads all reject unauthenticated callers when the authenticated preview middleware is mounted. Focused tests and the complete corrected validation gate passed. No production flag or financial authority changed.


### Package and garage-summary read guard coverage — 2026-09-23

Commit `60d38e3` adds coverage for production-disabled package and garage-summary reads and malformed query rejection. Focused tests and the complete corrected validation gate passed. No production flags or financial authority changed.


### Current Cloudflare preview discovery and public smoke evidence — 2026-09-23

A fresh preview was created from current `main` through temporary branch `preview/current-main-v2-smoke`: deployment `7a66d0e0`, alias `https://preview-current-main-v2-smok.rq-acg.pages.dev`. The public login screen loaded successfully. Railway read-only checks returned health `200`, v2 health `200`, and unauthenticated packages `401`. Authenticated Firebase checks remain blocked on a valid session or test credential; no credential was guessed and no production authority changed. The working tree is back on `main`.


### Shadow-comparison route failure hardening — 2026-09-23

Commit `f9a280b` adds strict-payload and provider-failure redaction coverage for the admin-only shadow route. Focused tests and the complete corrected validation gate passed. Shadow comparison remains disabled unless explicitly enabled and does not authorize production migration.


### Shadow rollback fallback safety hardening — 2026-09-23

Commit `a467b31` ensures an unavailable legacy fallback blocks shadow cutover instead of allowing v2. Missing preview authentication continues to route safely to legacy when fallback exists. Focused policy/coordinator tests and the complete corrected validation gate passed. Production shadow and financial authority remain disabled.


### Projection repair calendar-date contract hardening — 2026-09-23

Commit `e83161d` makes projection events, states, and repair tasks reject impossible calendar dates before repository access. Focused worker tests and the complete corrected validation gate passed. The repair worker remains undeployed and unscheduled; no production mutation or financial authority changed.


### Token-ending succession handoff — 2026-09-23 19:10 UTC+3

The project owner issued the exact `tokens ending` trigger. No new feature was started after the trigger. Final repository verification: branch `main`; working tree clean; `HEAD` and `origin/main` both `c67c3bd50bcb43b4a6d92f6a17895a557edf7d2c`; latest implementation commit `e83161d` validates real calendar dates in projection events, projection state, and repair tasks; latest documentation commit is `c67c3bd`. Production Gate `35879864414` succeeded for `c67c3bd`. The preceding rollback-safety gate `35874104814` also succeeded.

The latest completed slices are: shadow route strict-payload and provider-error redaction coverage (`f9a280b`); rollback policy correction that blocks when the legacy fallback is unavailable (`a467b31`); and projection repair calendar-date validation (`e83161d`). The complete corrected validation gate passed for the current implementation: `npm run lint:v2`; Firestore-emulator-backed `npm run check:v2`; `npm test`; `npm run lint`; `npm run build`; `npm run maintainability:check`; and `git diff --check`. The projection repair worker remains library-only, undeployed, unscheduled, and disconnected from automatic production mutation.

Current external state: the read-only Railway connector `RQ Railway Read-only MCP` is enabled; Cloudflare is enabled; My Browser is enabled but is not needed for the next task. The external MCP smoke test at `/home/ubuntu/rq-backend-mcp/smoke-test.mjs` passed allowlist, server-factory, and missing-token safety checks. Existing live Railway evidence remains limited to operator/unauthenticated boundaries: health `200`, v2 health `200`, system-config `200` without recording its payload, and unauthenticated packages `401`. Do not treat operator-token evidence as Firebase-user authentication.

The authenticated Cloudflare preview remains blocked. The preview reached the user browser but the app displayed its intentional compatibility screen because the connected browser failed the `Promise`/`Proxy` capability gate; do not weaken that gate. A current legitimate non-production preview must exist before authenticated Firebase browser checks. Do not manufacture a preview by creating a branch, use stale or production deployments as preview evidence, change production flags, or use the Railway operator token as a Firebase user token.

**Exact next task:** continue the browser-free projection-worker operational-preparation track by adding a redacted non-production invocation/evidence contract and health/failure outcome accounting. Keep the worker undeployed, unscheduled, flag-off, and disconnected from automatic mutation. Add focused tests, run the complete validation gate, publish the implementation and handoff evidence, and verify the Production Gate. Do not migrate financial writes, enable production v2/shadow flags, delete data, remove legacy routes, or begin progressive cutover.

Copy-paste message for the next agent:

> Repository: `/home/ubuntu/RQ-`; canonical handoff: [`NEXT_AGENT_HANDOFF.md`](NEXT_AGENT_HANDOFF.md). Token-ending succession is complete. Start by verifying `git status --short --branch`, `git log -3 --oneline`, `HEAD == origin/main`, and the latest Production Gate. Current tip is `c67c3bd`; latest gate is `35879864414` success. Next bounded task is a browser-free projection-worker operational-preparation slice: add a redacted non-production invocation/evidence contract and health/failure outcome accounting, with focused tests and the complete validation gate. Keep the worker library-only, undeployed, unscheduled, and disconnected from automatic production mutation. Keep production v2/shadow flags false, legacy backend and financial writes authoritative, and do not delete data or retire routes. If a current legitimate authenticated Cloudflare preview later appears, perform browser validation only then; never manufacture one. If you receive `tokens ending`, repeat this succession protocol immediately instead of starting another feature.


### Succession protocol enhancement — 2026-09-23

The reusable start-to-finish succession playbook is now [`docs/SUCCESSION_PROTOCOL.md`](docs/SUCCESSION_PROTOCOL.md). It defines immediate-trigger behavior, first-five-minute verification, connector and deployment checks, secret-safety rules, task-selection decision logic, safety invariants, validation gates, handoff-record fields, copy-paste startup text, and final closure requirements. Future agents must read it together with this handoff before continuing.


### Cross-account succession and Railway MCP bootstrap enhancement — 2026-09-23

`docs/SUCCESSION_PROTOCOL.md` now explicitly handles agents that start in a new account without inherited sandbox files or connectors. Each successor must rebuild the external read-only Railway MCP outside the repository when diagnostics are needed, using exactly `backend_health` and `read_backend_endpoint`, the six documented GET paths, bounded requests/responses, redacted output, and missing-token smoke validation. Registration must use the supported connector workflow with protected environment fields. The protected Railway variable name is `BACKEND_OPERATOR_TOKEN`; its value must be entered through Railway and connector secret fields and must never be pasted into chat, source, logs, command arguments, Git, or handoff documents. Every future agent repeats this protocol when the owner says `tokens ending`; no account may assume inherited files, connectors, browser sessions, tokens, or deployment state.


### Dashboard report garage-scope coverage — 2026-09-23 18:17 UTC

- Current branch and SHA: `main`, `debd0c9`; working tree was clean before this documentation update and synchronized with `origin/main` at the implementation tip.
- Last implementation commit: `debd0c9 test: cover dashboard report garage scope`.
- Documentation commit: pending; this record is being added after the implementation gate.
- Focused validation: `npm run test:v2 -- server-v2/test/dashboardReportRoute.test.ts` — 7 tests passed, including denial of a garage user reading another garage report; `npm run lint:v2` — passed.
- Full validation: Firestore-emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check` — passed on the corrected rerun. An earlier full-gate timeout in unrelated concurrent subscriber creation reproduced as transient; the isolated 25-test suite and corrected full gate passed.
- Production Gate: run `35901088303` — success for exact implementation commit `debd0c9`.
- Deployment evidence: exact-commit Production Gate Railway smoke checks passed; no Cloudflare preview was created or claimed.
- Connector/MCP state: the external read-only Railway MCP remains outside Git at `/home/ubuntu/rq-backend-mcp`; it exposes only bounded read-only diagnostics. No secret values are recorded here.
- Known blockers: no current Firebase-authenticated non-production Cloudflare preview is established; do not use production or stale previews as authenticated evidence.
- Safety state: legacy backend remains authoritative; production `VITE_V2_READ_*` flags and shadow traffic remain disabled; financial writes are not migrated; projection repair remains undeployed, unscheduled, and disconnected from automatic mutation; physical deletion remains deferred; legacy routes remain available.
- Exact next task: add focused dashboard-report repository-error redaction coverage, proving a provider failure returns the generic `INTERNAL_ERROR` envelope without exposing internal details; do not change runtime authority or production flags.

**Copy-paste startup:**

> Repository: `/home/ubuntu/RQ-`. Read `NEXT_AGENT_HANDOFF.md` first. Verify `HEAD`, `origin/main`, and Production Gate `35901088303` for `debd0c9`. Start the single bounded task: add dashboard-report repository-error redaction coverage. Preserve legacy authority, disabled production v2/shadow flags, undeployed projection repair, deferred deletion, and all secret-handling rules. If `tokens ending` appears, stop feature work and repeat this protocol.


### Dashboard report error-redaction coverage — 2026-09-24 04:18 UTC

- Current branch and SHA: `main`, `e80f88e` implementation tip; working tree clean and synchronized before this documentation update.
- Last implementation commit: `e80f88e test: cover dashboard report error redaction`.
- Focused validation: `npm run test:v2 -- server-v2/test/dashboardReportRoute.test.ts` — 8 tests passed; `npm run lint:v2` — passed.
- Full validation: Firestore-emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check` — passed.
- Production Gate: run `35954928976` — success for exact implementation commit `e80f88e`.
- Deployment evidence: exact-commit Production Gate Railway smoke checks passed; no Cloudflare preview was created or used as authenticated evidence.
- Connector/MCP state: external read-only Railway MCP remains outside Git at `/home/ubuntu/rq-backend-mcp`; no secret values are recorded here.
- Known blockers: no current Firebase-authenticated non-production Cloudflare preview is established; do not use production or stale previews as substitutes.
- Safety state: legacy backend remains authoritative; production `VITE_V2_READ_*` flags and shadow traffic remain disabled; financial writes are not migrated; projection repair remains undeployed, unscheduled, and disconnected from automatic mutation; physical deletion remains deferred; legacy routes remain available.
- Exact next task: add focused dashboard-report projection-error redaction coverage, proving a projection repository failure returns the generic `INTERNAL_ERROR` envelope without exposing internal details.

**Copy-paste startup:**

> Repository: `/home/ubuntu/RQ-`. Read `NEXT_AGENT_HANDOFF.md` first. Verify `HEAD`, `origin/main`, and Production Gate `35954928976` for `e80f88e`. Start the single bounded task: add dashboard-report projection-error redaction coverage. Preserve legacy authority, disabled production v2/shadow flags, undeployed projection repair, deferred deletion, and all secret-handling rules. If `tokens ending` appears, stop feature work and repeat this protocol.


### Dashboard report projection-error redaction coverage — 2026-09-24 04:28 UTC

- Current branch and SHA: `main`, `38cec77` implementation tip; working tree clean and synchronized before this documentation update.
- Last implementation commit: `38cec77 test: cover dashboard projection error redaction`.
- Focused validation: `npm run test:v2 -- server-v2/test/dashboardReportRoute.test.ts` — 9 tests passed; `npm run lint:v2` — passed.
- Full validation: Firestore-emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check` — passed.
- Production Gate: run `35955592411` — success for exact implementation commit `38cec77`.
- Deployment evidence: exact-commit Production Gate Railway smoke checks passed; no Cloudflare preview was created or used as authenticated evidence.
- Connector/MCP state: external read-only Railway MCP remains outside Git at `/home/ubuntu/rq-backend-mcp`; no secret values are recorded here.
- Known blockers: no current Firebase-authenticated non-production Cloudflare preview is established; do not use production or stale previews as substitutes.
- Safety state: legacy backend remains authoritative; production `VITE_V2_READ_*` flags and shadow traffic remain disabled; financial writes are not migrated; projection repair remains undeployed, unscheduled, and disconnected from automatic mutation; physical deletion remains deferred; legacy routes remain available.
- Exact next task: add focused dashboard-report combined repository-failure coverage, proving a failure from either summary or projection access remains a generic `INTERNAL_ERROR` envelope without exposing internal details.

**Copy-paste startup:**

> Repository: `/home/ubuntu/RQ-`. Read `NEXT_AGENT_HANDOFF.md` first. Verify `HEAD`, `origin/main`, and Production Gate `35955592411` for `38cec77`. Start the single bounded task: add combined dashboard-report repository-failure redaction coverage. Preserve legacy authority, disabled production v2/shadow flags, undeployed projection repair, deferred deletion, and all secret-handling rules. If `tokens ending` appears, stop feature work and repeat this protocol.


### Dashboard report combined repository-failure redaction matrix — 2026-09-24 04:39 UTC

- Current branch and SHA: `main`, `48bf815` implementation tip; working tree clean and synchronized before this documentation update.
- Last implementation commit: `48bf815 test: matrix dashboard report error redaction`.
- Focused validation: `npm run test:v2 -- server-v2/test/dashboardReportRoute.test.ts` — 9 tests passed, with a table-driven summary/projection repository-failure matrix; `npm run lint:v2` — passed.
- Full validation: Firestore-emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check` — passed.
- Production Gate: run `35956361235` — success for exact implementation commit `48bf815`.
- Deployment evidence: exact-commit Production Gate Railway smoke checks passed; no Cloudflare preview was created or used as authenticated evidence.
- Connector/MCP state: external read-only Railway MCP remains outside Git at `/home/ubuntu/rq-backend-mcp`; no secret values are recorded here.
- Known blockers: no current Firebase-authenticated non-production Cloudflare preview is established; do not use production or stale previews as substitutes.
- Safety state: legacy backend remains authoritative; production `VITE_V2_READ_*` flags and shadow traffic remain disabled; financial writes are not migrated; projection repair remains undeployed, unscheduled, and disconnected from automatic mutation; physical deletion remains deferred; legacy routes remain available.
- Exact next task: add focused dashboard-report success-envelope schema coverage, proving both consistent and repair-needed reports conform to the typed response contract without exposing extra fields.

**Copy-paste startup:**

> Repository: `/home/ubuntu/RQ-`. Read `NEXT_AGENT_HANDOFF.md` first. Verify `HEAD`, `origin/main`, and Production Gate `35956361235` for `48bf815`. Start the single bounded task: add dashboard-report success-envelope schema coverage. Preserve legacy authority, disabled production v2/shadow flags, undeployed projection repair, deferred deletion, and all secret-handling rules. If `tokens ending` appears, stop feature work and repeat this protocol.
