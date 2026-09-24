# RQ Backend Overhaul — Continuation Handoff

**Last updated:** 2026-09-23
**Repository:** `tarekhamada875-droid/RQ-`
**Branch:** `main`
**Latest published commit:** `e67348c docs: record shadow telemetry coverage`
**Latest verified local evidence:** shadow telemetry coverage passes 3 focused tests, the complete repository/emulator validation gate passed, and Production Gate `35840571252` passed for `e67348c`. The succession handoff records that a dedicated non-production Cloudflare/Railway/Firebase environment is not being created in this slice.

## Mission

Continue the staged, contract-first v2 backend replacement described in the [master overhaul plan][1]. The current Railway legacy backend remains the production authority. The `server-v2` tree is a parallel system that is now partially deployed as a guarded preview, but it is not yet a replacement backend.

The next agent must preserve the migration strategy: implement one bounded capability, validate it locally and in CI, deploy only behind an explicit preview gate, compare it with legacy behavior, and migrate production traffic only after correctness, authorization, cost, rollback, and operational checks pass.

> **Do not delete legacy routes, migrate financial writes, change production frontend flags, or delete production data during the repository and preview phases.**

## Token-exhaustion handoff protocol

If the user sends the exact phrase **`tokens ending`**, treat it as an immediate handoff request. Do not begin another feature and do not merely summarize in chat. Immediately perform the same controlled handoff process used for this continuation: inspect the current `HEAD` and working tree; record completed work, exact commits, tests, CI gates, deployment/preview evidence, blocked validations, safety boundaries, and the next bounded action in this file; run `git diff --check`; commit and push the handoff directly to `main`; verify the file is non-empty and the working tree is clean; then provide the user with a self-contained, paste-ready continuation message that names the repository path, current commit, files to read, current production/preview authority, exact next steps, and all prohibitions. Never expose secrets; refer only to secure variable names and protected MCP restoration. The next agent must be prepared to repeat this protocol whenever the user gives the same exact warning, preserving the same execution model rather than starting a new planning style.

## Operating rules

The user has approved direct pushes to `main` and does not want long-lived branches. For every implementation slice:

1. Inspect the current code, legacy behavior, and the relevant section of the master plan.
2. Implement one bounded change without changing production authority.
3. Run focused tests first, then the complete applicable validation gate.
4. Review `git diff --check`, `git status`, and the exact changed files.
5. Push the validated slice directly to `main`.
6. Watch the GitHub Production Gate and report the commit, gate result, and any limitations.

The user has given the agent discretion to choose the next safe slice. Do not ask for routine confirmation. Pause only for a real permission failure, a required user credential, a protected external action, or a choice that materially changes behavior or production risk.

### Source-of-truth rule

Use the repository and live configuration as the final authority. Treat this document as the ordered plan, not as proof that an endpoint, flag, deployment, or connector still exists. Before relying on a claim, verify the current `HEAD`, working tree, relevant source file, GitHub run, Railway response, Cloudflare setting, or MCP connector status. If a verified result differs from this document, update the document in the same implementation slice before continuing.

## Current production and preview state

### Railway

The live Railway service is:

```text
https://rq-production-af02.up.railway.app
```

The guarded v2 preview is mounted externally under `/api/v2`. It is enabled only when both Railway variables are explicitly true:

```text
V2_PREVIEW_ENABLED=true
V2_PREVIEW_AUTH_ENABLED=true
```

Live verification already completed after commit `a85035e`:

```text
GET /api/health      -> 200
GET /api/v2/health   -> 200
GET /api/v2/packages -> 401 without Firebase authentication
```

The critical fix in `a85035e` mounted v2 before the legacy `/api` 404 fallback. Do not reorder this middleware again. Vehicle check-in and check-out are mounted only in the authenticated, explicitly enabled v2 preview app; legacy `/api/vehicles/*` remains authoritative.

### Cloudflare Pages

The Pages project is `rq`, with production domain `https://rq-acg.pages.dev`. It builds from `main` using:

```text
npm run build:web
```

The preview environment is configured with:

```text
VITE_BACKEND_API_URL=https://rq-production-af02.up.railway.app
VITE_V2_READ_PACKAGE_CATALOG=true
```

The production environment does **not** contain `VITE_V2_READ_PACKAGE_CATALOG`; production remains on the legacy provider. The v2 flag parser defaults every flag to false unless the exact value is `true`. The preview flag being true does not authorize enabling the production flag.

Cloudflare read-only inspection on 2026-09-22 confirmed that the project is configured to create previews for all branches, but the available previews remain stale deployments from old feature branches. The newest listed preview is `7ff4c62e` at `https://7ff4c62e.rq-acg.pages.dev`, built from `feat/backend-operator-mcp-auth` at commit `1c60a0d` on 2026-09-19; it is not a current `main` build. The latest `main` deployment is production-only at `https://90c0d469.rq-acg.pages.dev`, built from commit `322faee`. The user explicitly prohibited branch creation, so do not create a branch merely to manufacture a preview URL. Do not claim Cloudflare-to-Railway authenticated end-to-end success until a current non-production preview deployment has been tested.

### Latest frontend slice

Commit `9bbcb5a` adds the typed active-session client and Arabic RTL admin **Active Devices** screen. It uses the existing authenticated API client, displays only opaque session keys, confirms revocation, handles current-session logout through the existing callback, and is wired through `AdminDashboard.tsx` and `AdminNavigationAndViews.tsx`. It changes no backend authority, financial behavior, production flags, or production data.

Commit `35d5856 feat: gate package catalog reads through v2` added:

- A strict v2 package catalog adapter.
- Support for the deployed paginated response shape `{ data: { items, limit } }`.
- Conversion from v2 minor units into the legacy UI package model.
- A feature-gated package loader in `useGarageSync`.
- Legacy Firestore listener fallback if v2 is unavailable.

The package adapter tests and TypeScript check passed. The full frontend test suite and production web build also passed. The GitHub Production Gate for `35d5856` was successful as run `35585634246`.

### Latest backend repository and command slices

Commits `daf46eb`, `04a87e6`, and `06831b9` added the production read repositories for vehicle, subscriber, and garage state. Commits `148277a` through `413da3a` added the strict vehicle lifecycle domain, pricing, transactional persistence, and guarded check-in/check-out routes. Commit `d0b316b` added transactional subscriber creation, and commit `2d19831` added its guarded HTTP route:

- `server-v2/repositories/firestoreVehicles.ts`.
- `server-v2/test/firestoreVehicles.test.ts`.
- `server-v2/repositories/firestoreSubscribers.ts`.
- `server-v2/test/firestoreSubscribers.test.ts`.
- `server-v2/repositories/firestoreGarages.ts`.
- `server-v2/test/firestoreGarages.test.ts`.
- `server-v2/contracts/vehiclePricing.ts` and `server-v2/domain/vehiclePricing.ts`.
- `server-v2/repositories/firestoreVehicleCheckIn.ts` and `server-v2/repositories/firestoreVehicleCheckOut.ts`.
- `server-v2/contracts/subscriberCommands.ts` and `server-v2/repositories/firestoreSubscriberCommands.ts`.
- `server-v2/test/firestoreSubscriberCommands.test.ts` and `server-v2/test/subscriberCreateRoute.test.ts`.

The read repositories read legacy Firestore collections and documents, map compatibility fields into strict v2 contracts, validate garage scope and bounds, use deterministic bounded reads where applicable, and record returned Firestore reads. Vehicle lifecycle and subscriber-create writes are isolated behind authenticated v2 preview routes and do not replace legacy authority.

Validation passed locally:

```text
npm run check:v2
35 test files passed
172 tests passed
strict v2 typecheck passed
explicit-any gate passed
git diff --check passed
```

The GitHub Production Gates for the vehicle lifecycle and subscriber-create commits passed through run `35602256564`.

## What is complete

The following foundations exist and are tested:

- Strict `server-v2` TypeScript configuration, environment parsing, API envelopes, Vitest configuration, CI gates, and the explicit-`any` gate.
- Typed entities, money, dates, cursor pagination, pricing, capacity, trials, commissions, refunds, business events, retries, and idempotency primitives.
- Typed Firestore converter boundaries and in-memory repository doubles.
- Session expiry, revocation, inactivity, role, garage-scope, audit context, redaction, and rate-limit policies.
- Firebase ID-token middleware, canonical session lookup, CORS allowlisting, request context, request IDs, authenticated-UID rate limiting, telemetry, and route budgets.
- Package catalog and garage-summary repository abstractions, production package repository, production garage-summary repository, pending/activity Firestore read models, and emulator tests.
- Production vehicle, subscriber, and garage state repositories with emulator tests.
- Lifecycle domain commands for vehicles, subscribers, garage lock/suspension, deletion, and idempotency. Vehicle check-in/check-out, subscriber creation, subscriber renewal, subscriber update, subscriber suspend, reversible subscriber cancel, reversible subscriber tombstone, admin-only garage lock/unlock/suspend/unsuspend, non-destructive resumable garage deletion jobs, and admin-only non-financial garage profile updates now have guarded transactional HTTP paths; physical deletion remains legacy-authoritative.
- Pure migration comparison and rollback-policy utilities with focused tests and a safety runbook. These are not wired to production traffic.
- Financial contracts, wallet math, reconciliation, audit events, and in-memory transaction primitives. Financial authority is not migrated.
- Projection reducers, bounded read models, daily financial summaries, reports, lag, repair-needed states, and related tests.
- Guarded Railway bootstrap under `/api/v2`.
- Typed Cloudflare frontend read adapter, package catalog feature routing, safe legacy fallback, and preview-only smoke harness.

## Known gaps

### Production repositories

The bounded production read repositories are covered for vehicle, subscriber, and garage state. Transactional vehicle check-in/check-out and subscriber lifecycle repositories now exist with Firestore emulator, idempotency, audit, and concurrency tests. Admin-only garage lifecycle lock/unlock/suspend/unsuspend, reversible subscriber tombstone, non-destructive garage deletion jobs, and non-financial garage profile updates now have transactional repositories; physical garage deletion, irreversible deletion migration, and financial write repositories remain unmigrated.

### HTTP routes

Guarded v2 routes now include vehicle check-in, vehicle check-out, subscriber creation, subscriber renewal, subscriber update, subscriber suspend, reversible subscriber cancel, admin-only reversible subscriber tombstone, admin-only garage lock/unlock/suspend/unsuspend, admin-only non-destructive garage deletion jobs, and admin-only non-financial garage profile updates in addition to health, packages, garage summary, pending, and activity. Physical subscriber/garage deletion, broader garage management, and financial routes are not complete.

### Authenticated Cloudflare preview smoke

Railway authentication and CORS have been tested through local and live unauthenticated boundary checks. Cloudflare Pages was rechecked on 2026-09-23: the latest deployment is production `fdf79720` for `061204e`, and all listed deployments are `environment: production` on `main`; no current non-production preview URL exists. Preview configuration has package-catalog enabled, but no production deployment may be used as preview evidence. A real authenticated request still needs to be performed with a Firebase-authenticated browser session when a current non-production preview exists. The Railway operator MCP token cannot substitute for a Firebase user token.

### Financial authority

The existing backend remains the only financial writer. Do not dual-write money operations. Build and test Firestore transactions, idempotency persistence, reconciliation, repair behavior, rollback, and an explicit cutover plan before migrating any financial write.

### Migration safety

Pure normalized comparison, redacted mismatch reporting, fail-closed rollback policy, and the [migration-safety runbook](docs/migration-safety-runbook.md) now exist. They do not establish authenticated frontend-to-Railway success and are not connected to production flags or dual-write behavior.

## Exact next actions for the next agent

### Verified continuation packet — 2026-09-23

The Active Devices UI from `9bbcb5a` exposed an unused destructured `t` prop under the repository typecheck. The initial gate for documentation tip `6f8172f` failed only at `verify/Typecheck` with `TS6133`; focused correction `b5b681b` removes that unused destructuring and changes no behavior. Production Gate `35822201327` passed all required checks, including typecheck, tests, production build, v2 foundation, artifact verification, maintainability, and Railway live smoke validation.

The current Cloudflare Pages inspection is read-only and remains a preview blocker. Project `rq` has preview deployments enabled and preview-only `VITE_V2_READ_PACKAGE_CATALOG=true`; production has no v2 read flag. The current production deployment is `https://52388dd0.rq-acg.pages.dev`, built from `main` commit `6f8172f` on 2026-09-23. The newest non-production preview is still `https://7ff4c62e.rq-acg.pages.dev`, branch `feat/backend-operator-mcp-auth`, commit `1c60a0d`, created 2026-09-19. It is stale and must not be used as current-build evidence. Do not create a branch merely to manufacture a preview or alter production flags.

The bounded local migration-evidence task is complete for this slice. `npm run test:v2 -- server-v2/test/migrationSafety.test.ts server-v2/test/shadowComparisonCoordinator.test.ts server-v2/test/shadowReadPolicy.test.ts server-v2/test/shadowComparisonRoute.test.ts` passed 4 files and 16 tests. It proves stable normalized ordering and timestamp tolerance, redacted financial/authorization mismatch flags, equal-comparison v2 permission, v2-read fallback to legacy, legacy-read blocking, rollback safety, strict admin route validation, and disabled-flag non-exposure. The complete gate also passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. This is read-only evidence only; no production shadow traffic, financial write migration, or production flag change occurred.

Next action remains conditional: when a natural current Firebase-authenticated Cloudflare preview exists, run the requested authenticated v2 health, package, garage-summary, and session checks, then compare normalized legacy/v2 results and exercise fallback/blocking. Until then, keep the preview item blocked and continue only with bounded read-only evidence or explicitly safe non-financial work. Legacy backend and financial writes remain authoritative.

The follow-up non-financial slice is `647e251`. It adds `src/services/sessionService.test.ts` with five focused tests for valid session-list parsing, malformed list rejection, valid opaque-key DELETE construction, invalid-key rejection before network access, and mismatched revoke-response rejection. The corrected full validation sequence passed `npm run lint:v2`, the Firestore-emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. Production Gate `35823053960` passed. No backend authority, production flag, financial write, or production data changed.

The next non-financial slice is `eb19593`. It adds `src/components/admin/AdminActiveSessionsView.test.tsx` with three React/jsdom tests for session loading, non-current revocation and success feedback, and current-session revocation delegating to logout. The same complete validation sequence passed, and Production Gate `35823805861` passed. No backend authority, production flag, financial write, or production data changed.

The next bounded read-only slice is `b1aae73`. It adds pagination contract coverage to `src/__tests__/v2ReadAdapter.test.ts`: cursor and limit URL encoding for pending/activity reads and rejection of malformed page envelopes. The complete validation sequence passed, and Production Gate `35824735761` passed. No runtime behavior, backend authority, production flag, financial write, or production data changed.

The next bounded safety slice is `9b42c8f`. Its dashboard-report boundary test exposed that the shared `DateKeySchema` accepted impossible calendar dates despite enforcing `YYYY-MM-DD` shape. The schema now validates calendar reality using UTC component round-tripping. Foundation coverage rejects `2026-02-29` and `2026-99-99`, and report-route coverage verifies invalid-date rejection plus stale-projection labeling. The complete validation sequence passed, and Production Gate `35826313877` passed. No financial authority, production flag, or production data changed.

The following operational-safety slice is `3b1f018`. It adds [`docs/projection-repair-worker-runbook.md`](docs/projection-repair-worker-runbook.md), documenting the existing worker's 25-task bound, explicit event windows, idempotency/audit requirements, redacted failure handling, stop/rollback procedure, and evidence checklist. The worker remains a library primitive: it is not deployed, scheduled, or connected to automatic production mutation. The corrected full validation sequence passed, and Production Gate `35827534873` passed. No production flag, financial authority, or production data changed.

The next bounded route-safety slice is `693fdb8`. It adds projection-status coverage for impossible calendar dates and repository-error redaction. The route remains preview-gated and admin-only; no runtime behavior or production authority changed. The complete validation sequence passed, and Production Gate `35834417741` passed.

The next projection-worker safety slice is `54bd219`. Queue completion and failure now require a matching, unexpired worker lease; expired workers receive `REPAIR_TASK_LEASE_EXPIRED` and cannot mutate queue state. The runbook records this fail-closed rule, and emulator coverage passes. The complete validation sequence passed, and Production Gate `35837731215` passed. The worker remains undeployed and unscheduled.

The next migration-evidence slice is `6fb49c6`. Shadow telemetry now has explicit authorization-mismatch coverage and verifies that its console sink emits only aggregate counters, not mismatch payloads or raw error text. The complete validation sequence passed, and Production Gate `35840179976` passed. No production shadow traffic or cutover flag changed.

The current preview blocker remains explicit. Creating a dedicated non-production environment is technically possible but is a separate infrastructure workstream, not a validation shortcut. It requires isolated Cloudflare Pages, Railway, and Firebase configuration, non-production secrets and data isolation, authentication/CORS checks, rollback and teardown controls, and an updated plan. Do not create a branch merely to manufacture a preview, change production flags, or treat a production deployment as preview evidence.

### Agent continuation packet — 2026-09-22 13:23 UTC+3

The previous agent added the production Firestore garage-summary adapter, transactional projection persistence, a bounded deterministic projection rebuild primitive, the explicitly flagged admin repair endpoint, the read-only status endpoint in `6d2dc91`, the fail-closed shadow-read policy in `9c61429`, the pure shadow-comparison coordinator in `5a0cb56`, and a preview-only admin route in `07308e5`. Commit `2c9186f` wires real read-only Firestore legacy/v2 providers into the guarded preview composition. Commit `01286d5` adds aggregate shadow telemetry: equal/mismatch/financial/authorization/fallback/blocked counters, bounded latency, and Firestore read totals. Commit `fa62c03` adds the authenticated, read-only `GET /api/v2/garages/:garageId/report?date=YYYY-MM-DD` dashboard report envelope. Commit `8aee5e4` adds a bounded sequential projection-repair worker primitive: batches are capped at 25 tasks, each task delegates to the idempotent/audited rebuild repository, unexpected errors are redacted to `REPAIR_FAILED`, and no scheduler, production flag, or automatic mutation path is enabled. It is a worker library primitive, not a deployed production worker. The report compares the bounded garage summary with the projection, exposes consistency status, lag, and numeric differences, labels stale or mismatched state as `repair_needed`, and returns a conflict when the projection is missing; it performs no writes. Telemetry contains no request IDs, garage IDs, payloads, credentials, or financial values; it is held in memory and emitted as redacted aggregate console records only in the preview composition. The shadow route is `POST /api/v2/shadow/compare`, requires admin Firebase/session authorization, accepts only `packages` or date-scoped `garage_summary`, and remains disabled unless `V2_SHADOW_COMPARISON_ENABLED=true`. The provider independently maps legacy package and dashboard-summary data into strict v2-compatible records, compares them against typed v2 repositories, runs both reads concurrently, permits v2 only after an equal comparison, falls back to legacy when v2 fails, and blocks when legacy fails. Mismatches remain redacted and financial/authorization mismatches remain fail-closed. The report, shadow comparison, status, repair, and worker paths are preview-gated or library-only and do not change traffic. The full emulator-backed `npm run check:v2` passes locally with 55 test files and 293 tests; the full application suite passes with 55 files and 296 tests; focused worker/repair tests pass with 12 tests plus the prior 17 report/provider tests. Production Gate `35757199426` passed for `8aee5e4`. Do not assume older commit references elsewhere in this document are the current `HEAD`; verify them before relying on them.

The most recent implementation is `5e2bba2 feat: add active session management`, following `db0b4a5 feat: allow multi-device sessions`. It adds per-device session records, preserves the legacy root session record and `currentSessionId` marker, permits multiple active sessions for one UID, makes logout revoke only the presented device, and adds authenticated `GET /api/auth/sessions` plus `DELETE /api/auth/sessions/:sessionKey`. Session listings expose only one-way SHA-256 identifiers, active/current flags, and timestamps; raw IDs, UIDs, names, and credentials are not returned. Revocation is scoped to the caller’s own UID and role, synchronizes root/entity markers, and blocks backend-operator tokens. Focused session/auth tests, full emulator-backed and repository validation pass. Production Gate `35815476395` passed. This changes authentication/session behavior but does not change data ownership, financial writes, authorization scope, or the Cloudflare preview blocker.

Commit `f0a5b20 ci: wait longer for Railway propagation` updates `.github/workflows/production-gate.yml`: obsolete runs are cancelled, the job timeout is 25 minutes, and the exact-commit Railway smoke check waits up to 10 minutes for deployment propagation. Production Gate `35773357754` passed.

The next implementation adds `GET /api/auth/sessions` and `DELETE /api/auth/sessions/:sessionKey`. The listing is available only to a live Firebase-authenticated user session, returns opaque SHA-256 session identifiers with current/active and timestamp fields only, and never returns raw session IDs, UIDs, display names, or credentials. Revocation resolves the opaque key only within the caller's own role/UID session collection, marks that device inactive, and removes it from both root and entity active-session markers without affecting other devices. Backend-operator tokens cannot use these user-session management routes. Focused redaction tests and the full emulator-backed/application/build/maintainability validation pass locally; frontend UI wiring remains the next optional step.

The most recent permitted external inspection used the enabled Cloudflare connector at 2026-09-22 19:09 UTC+3. Project `rq` has preview deployments enabled for all branches, preview `VITE_V2_READ_PACKAGE_CATALOG=true`, and production does not have that flag. The current `main` commit `5e2bba2` has a successful production deployment, but no current preview deployment. The newest preview is `https://7ff4c62e.rq-acg.pages.dev` from 2026-09-19, branch `feat/backend-operator-mcp-auth`, commit `1c60a0d`; it is stale and cannot establish evidence for `5e2bba2`. Do not use an older preview for authenticated current-build evidence, create a branch to manufacture a preview, change production flags, or claim Firebase-authenticated frontend-to-Railway success.

The next agent should proceed autonomously in this order: first verify `git status --short --branch`, `git log -3 --oneline`, and the relevant current files; next, if a current natural Cloudflare preview has appeared, perform the authenticated Firebase browser smoke test and normalized legacy/v2 comparison; otherwise keep that item blocked and do not manufacture a preview. For backend implementation, physical deletion remains deferred because it would mutate data. A future deletion slice may only begin as a non-production, explicitly approved exercise and must add strict contracts, authorization, idempotency, bounded cursor traversal, reference verification, retention metadata, repair/resume behavior, audit events, emulator/concurrency tests, and a rollback note before any actual delete operation. The existing `server-v2/repositories/firestoreGarageDeletion.ts` is intentionally non-destructive: it marks `isDeleting`, tracks a resumable job, and records `physicalDeletion: false`; do not silently convert it into a physical delete writer.

For every new slice, follow the established sequence: inspect legacy behavior and the master plan; implement one bounded capability behind the existing preview gate; run focused tests followed by `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`; review changed files and status; push directly to `main` (approved); watch the GitHub Production Gate; then update this handoff with the exact implementation commit, gate run, limitations, and next action. Keep Railway legacy routes and financial writes authoritative.

### Completed implementation slices

The repository context is clean at `5e2bba2`. Subscriber and garage read repositories, vehicle pricing compatibility, vehicle check-in/check-out transactional persistence and routes, subscriber-create, subscriber-renew, subscriber-update, subscriber-suspend, reversible subscriber-cancel, reversible subscriber tombstone, admin-only garage lifecycle transactional persistence and routes, non-destructive garage deletion jobs, garage profile updates, multi-device session validation, opaque active-session listing and per-device revocation, the production Firestore garage-summary adapter, transactional daily projection persistence with event-id replay protection, the bounded projection rebuild primitive, the disabled-by-default admin repair route, the disabled-by-default read-only projection status route, the bounded library-only projection-repair worker, the durable lease-owned repair queue, preview-only real legacy/v2 shadow providers, preview-only aggregate shadow telemetry, and the consistency-labeled dashboard report are complete in the repository. Strict v2 typecheck, full emulator-backed `npm run check:v2`, focused session tests, full application tests, production build, maintainability checks, diff checks, and Production Gates `35815476395` and `35773357754` pass. The next bounded action is frontend Active Devices UI wiring; the Cloudflare current-preview evidence remains blocked.

### Current blocking validation

Use the enabled Cloudflare connector to inspect the `rq` Pages project before claiming preview readiness. The 2026-09-22 19:09 inspection confirmed preview support is enabled, but the available preview deployments are stale builds from old feature branches; the newest is `7ff4c62e` from 2026-09-19 and does not contain `01286d5`. The current `main` build has not yet been validated through a current non-production frontend preview. Do not create a branch merely to manufacture a current preview URL, and do not use a stale preview to claim current authenticated end-to-end behavior. Emulator-backed repository validation is no longer blocked locally after downloading the same emulator through Firebase CLI.

When a current non-production preview exists, use a Firebase-authenticated browser session to verify:

```text
GET /api/v2/health   -> 200
GET /api/v2/packages?limit=100 -> authenticated success
POST /api/v2/shadow/compare -> authenticated admin-only comparison for packages and a date-scoped garage summary
GET /api/v2/garages/:garageId/report?date=YYYY-MM-DD -> authenticated consistency-labeled report
```

Compare the normalized v2 package catalog and garage summary with the legacy Firestore results. Record any difference with the endpoint, request ID, tenant/garage scope, and data version. Verify v2-read failure fallback, legacy-read blocking, and redaction of financial/authorization mismatches. Do not enable the production flag after a single successful request; first verify fallback and rollback behavior.

### Exact next-agent runbook

Start from the repository root `/home/ubuntu/RQ-` on `main`. First verify `git status --short --branch`, `git log -3 --oneline`, and that `HEAD` is `87922af` or a newer published commit. Read the relevant lifecycle contracts, command repositories, app, preview, migration utilities, tests, and legacy source before editing.

Subscriber renew is complete in `a5a0d8f`. It adds strict contracts, a Firestore transaction using `idempotency_records`, the canonical subscriber path, and `business_events`, re-reads the subscriber inside the transaction, enforces garage scope and the required not-found/cancelled/date-range rules through `executeSubscriberCommand`, updates legacy-compatible date fields, returns a stored replay result, and exposes the guarded authenticated route `POST /v2/garages/:garageId/subscribers/:subscriberId/renew`. Emulator and route tests cover successful renewal, invalid date range, cancelled and missing subscribers, replay, changed-payload conflict, concurrent renewal, same-garage authorization, cross-garage rejection, admin access, malformed requests, and production-gate non-exposure.

Subscriber update is complete in `9378f63`. It adds strict partial-update contracts, preserves immutable plate identity, uses the transactional idempotency and audit-event patterns, validates merged date ranges, updates only approved legacy-compatible fields, and exposes the guarded authenticated route `POST /v2/garages/:garageId/subscribers/:subscriberId/update`. Emulator and route tests cover partial and full updates, replay, changed-payload conflict, concurrent update behavior, same-garage authorization, cross-garage rejection, admin access, malformed/empty requests, missing subscribers, invalid date ranges, and production-gate non-exposure.

Subscriber suspend is complete in `883e4d7`. It adds strict suspend contracts, a transactional state transition from active to suspended, idempotent replay and conflict handling, a `subscriber_suspended` business event, and the guarded authenticated route `POST /v2/garages/:garageId/subscribers/:subscriberId/suspend`. Emulator and route tests cover successful suspension, missing and inactive subscribers, replay, changed-payload conflict, concurrent suspension, same-garage authorization, cross-garage rejection, admin access, malformed requests, and production-gate non-exposure.

Subscriber cancel is complete in `ec927dd`. It is deliberately a reversible soft transition: the subscriber document and legacy plate/date fields are retained, status becomes `cancelled`, one `subscriber_cancelled` event and idempotency record are written transactionally, and the guarded authenticated route is `POST /v2/garages/:garageId/subscribers/:subscriberId/cancel`. Physical legacy deletion remains unchanged and is not claimed as migrated.

Garage lifecycle is complete in `87922af`. It adds admin-only, preview-gated routes for `POST /v2/garages/:garageId/{lock|unlock|suspend|unsuspend}`, narrow transactional updates, deletion-in-progress protection, idempotent replay/conflict handling, lifecycle audit events, and emulator/concurrency coverage. Legacy broad garage update/delete behavior remains unchanged.

Migration-safety utilities are complete locally: normalized read comparison, redacted mismatch reporting with authorization/financial hard flags, fail-closed rollback policy, and a runbook. They do not establish authenticated frontend-to-Railway success and are not wired to production traffic.

Subscriber tombstone is complete in `27ca6e1`. It adds `POST /v2/garages/:garageId/subscribers/:subscriberId/delete` as an admin-only, preview-gated, reversible state transition to `deleted`; the document and plate/date fields are retained, only status and updatedAt are mutated, and one audit event plus one idempotency record are written transactionally. The legacy physical-delete route remains unchanged and authoritative.

Resumable garage deletion safety is complete in `2e74606`. It creates and advances admin-only deletion jobs, marks the garage as deleting, records repair/resume state, and writes audit/idempotency records, but performs no physical deletion of the garage or child documents. The legacy `/api/garages/delete` route remains unchanged and authoritative. Production Gate `35689117835` passed.

Garage profile management is complete in `4ae7345`. It adds strict allowlisted contracts and an admin-only preview-gated `POST /v2/garages/:garageId/profile/update` route for non-financial profile fields, preserving balance, package, lifecycle, and deletion fields. The Firestore repository applies the update transactionally, rejects deletion-in-progress garages, records one `garage_profile_updated` business event, persists an idempotency record, supports replay/conflict handling and concurrent requests, and has route plus emulator coverage. Production Gate `35690669939` passed; its checks included typecheck, tests, production build, v2 foundation, artifact, maintainability, and live smoke validation.

After publication, the next bounded work is preview evidence: inspect the current Cloudflare Pages project and obtain a real current non-production preview only if one exists naturally; do not create a branch merely to manufacture one. Authenticated browser validation remains blocked until a current preview and Firebase-authenticated session exist. If no current preview exists, do not manufacture one; continue with read-only inspection and the next reversible backend safety slice rather than changing production flags. The real preview-only shadow providers and aggregate telemetry are wired and locally/CI validated, but no live shadow comparison is claimed until the authenticated preview request succeeds.

Every command must have a strict contract, Firebase authentication, canonical session and garage scope authorization, idempotency, one transaction boundary, audit event, emulator tests, concurrency tests where relevant, and a rollback note. Keep the legacy backend authoritative and do not dual-write financial operations.

Do not begin financial writes before the lifecycle routes, shadow comparison, and rollback procedures are complete.

## Validation commands

Use these commands at repository root:

```bash
npm run check:v2
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

The v2 emulator tests expect `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. In this sandbox the Firebase CLI may be absent even when the cached emulator JAR exists. CI configures Java and the emulator separately, so a missing local CLI is an environment limitation rather than a code failure.

## Railway MCP: how to build or restore it outside the repository

The Railway MCP is intentionally external to the repository. It must never be committed into `RQ-`, bundled into the frontend, or placed in `server-v2`.

### Existing connector

The current connector is already configured and enabled:

```text
Name: RQ Railway Backend Operator
UID: 49fb9bed-bcf4-4c75-9057-e8a12a69d564
Kind: MCP / stdio
Command: node
Server file: /home/ubuntu/rq-backend-mcp/server.mjs
Environment variables: BACKEND_OPERATOR_TOKEN, RQ_BACKEND_URL
```

The connector exposes only two read-only tools:

- `backend_health`
- `read_backend_endpoint`

The current allowlist is:

```text
/api/health
/api/system-config
/v2/health
/api/v2/health
/v2/packages
/api/v2/packages
```

The operator token is server-to-server only. It is not a Firebase user token and cannot authenticate frontend business requests.

### Rebuild procedure if the connector is missing

1. Autonomously inspect the configured connector and restore or build the MCP before asking the user for anything. Do not ask the user to explain the MCP or grant routine setup permission.
2. Use the known Railway backend base URL unless live configuration proves it changed: `https://rq-production-af02.up.railway.app`.
3. Create the MCP server in a directory outside the repository, such as `/home/ubuntu/rq-backend-mcp/`.
4. Install the MCP SDK and Zod outside the repository or use the existing environment. The server must use `StdioServerTransport` and read secrets only from environment variables.
5. Require and validate these variables at startup. Never print their values in logs or tool output:

```text
RQ_BACKEND_URL
BACKEND_OPERATOR_TOKEN
RQ_BACKEND_TIMEOUT_MS (optional, default 10000, bounded 1000–60000)
```

6. Implement a strict read-only allowlist. Reject every path not explicitly listed. Use `GET` only, attach `x-backend-operator-token`, generate a correlation ID, enforce an abort timeout, parse JSON safely, and cap raw non-JSON output. Do not add mutation methods or accept a caller-supplied base URL.
7. Register only read tools. Do not expose POST, PUT, PATCH, DELETE, arbitrary URL access, shell execution, Firestore access, or token inspection.
8. Register the external connector using `manus-config` only after inspecting current config. Do not edit `/home/ubuntu/.manus/config/config.json` directly. If the protected token is absent, the only human action is for the user to set or rotate the Railway dashboard variable `BACKEND_OPERATOR_TOKEN`; never ask the user to paste its value into chat. The agent must continue all non-secret setup and validation autonomously, then report the exact variable name and the secure dashboard step.

```bash
manus-config config load --search railway
```

If no matching connector exists, create a form-mode stdio connector draft. Secrets must be placed only in the draft environment fields and never on the command line. The user must approve the connector review card before it is created.
9. Verify the connector after approval:

```bash
manus-config connector list --user-custom-only
```

Then list the server tools and call `backend_health`. Finally call `read_backend_endpoint` only for an allowlisted path.
10. Keep the connector and its token outside the repository. If the token is rotated, update the connector environment value without changing the server code or committing the new secret.

The existing external implementation is the reference pattern. It lives at `/home/ubuntu/rq-backend-mcp/server.mjs` and uses `@modelcontextprotocol/sdk`, `StdioServerTransport`, Zod input validation, a read-path allowlist, bounded fetch timeouts, and the two tools above.

## Safety boundaries that must remain true

- Cloudflare Pages is frontend only. Railway is backend only.
- Firebase Admin credentials and operator tokens must never enter frontend assets or Git.
- Do not treat frontend `uid`, `role`, session IDs, or token fields as authorization.
- Every new list must be bounded, ordered, scoped, and cost-instrumented.
- Every mutation must be idempotent and transaction-safe before production use.
- Every financial write must have one authoritative writer.
- Do not delete or mutate production Firestore data during foundation work.
- Do not claim authenticated Cloudflare-to-Railway end-to-end success without a real authenticated preview request.

## Key files

| File | Purpose |
|---|---|
| [`BACKEND_COMPLETE_OVERHAUL_STAGES.md`][1] | Master staged plan and live stage status |
| `BACKEND_OVERHAUL_HANDOFF.md` | This continuation document |
| `server-v2/app.ts` | Isolated v2 HTTP app and read routes |
| `server-v2/preview.ts` | Production dependency composition for guarded preview |
| `server-v2/repositories/firestorePackageCatalog.ts` | Strict production package mapper/repository |
| `server-v2/repositories/firestoreVehicles.ts` | Strict production vehicle state mapper/repository |
| `server-v2/repositories/readModels.ts` | Pending/activity production read models |
| `server-v2/contracts/` | Runtime-validated v2 contracts |
| `server-v2/domain/` | Pure domain rules and command primitives |
| `src/api/apiClient.ts` | Existing authenticated frontend transport |
| `src/api/v2ReadAdapter.ts` | Typed frontend v2 read client and feature routing |
| `src/hooks/useGarageSync.ts` | Package catalog legacy/v2 provider integration |
| `.env.example` | Disabled-by-default v2 environment flags |
| `AGENTS.md` | Repository conventions and safety rules |

## References

[1]: ./BACKEND_COMPLETE_OVERHAUL_STAGES.md "RQ Backend Complete Overhaul Stages"
[2]: https://rq-production-af02.up.railway.app/api/v2/health "RQ Railway v2 health endpoint"
[3]: https://github.com/tarekhamada875-droid/RQ- "RQ GitHub repository"


## Canonical next-agent instructions

The complete direct-address operating manual for the next agent is now maintained in [`NEXT_AGENT_HANDOFF.md`](NEXT_AGENT_HANDOFF.md). It includes the exact working sequence, validation commands, current state, implementation order, safety boundaries, forbidden actions, preview rules, financial migration rules, and progress-report format. Read it before making any further change.

Current verified state at handoff preparation:

- `HEAD`: `bd2e04d docs: prepare next agent handoff`
- Working tree: clean and synchronized with `origin/main`
- Latest Production Gate: `35818472489` — success
- Application suite: passed locally
- Server v2 suite: passed locally with Firestore emulator
- Production flags: unchanged and disabled for v2 migration behavior
- Financial authority: legacy backend remains authoritative
- Cloudflare: current `main` deployments are production; no current non-production preview is available


### External Railway MCP restoration — 2026-09-23

The missing external operator MCP was rebuilt at `/home/ubuntu/rq-backend-mcp`, outside the repository and production application. It contains exactly two read-only tools, `backend_health` and `read_backend_endpoint`; the implementation permits only the six documented diagnostic paths, uses `GET` only, bounds timeout and response size, generates request IDs, and redacts live-check output. Syntax checks and the no-secret smoke test passed. Connector registration remains intentionally pending because `BACKEND_OPERATOR_TOKEN` is unavailable in this session. Do not place the token in chat, source, command arguments, repository files, or this handoff. The protected Railway-dashboard action is to set or rotate the variable named `BACKEND_OPERATOR_TOKEN`; after that, register the stdio MCP through the supported connector workflow. No production flag, route, financial authority, or production data changed.


### Projection repair worker fail-closed hardening — 2026-09-23

Commit `05b377f` makes the bounded projection repair worker stop after an unexpected repository exception while preserving the redacted `REPAIR_FAILED` result. Explicitly classified repository errors remain task-level failures and the worker continues to the next task. Focused `projectionRepairWorker.test.ts` coverage now proves both behaviors, including that a later task is not attempted after an unexpected error. The complete corrected validation sequence passed: `npm run lint:v2`; Firestore-emulator-backed `npm run check:v2`; `npm test`; `npm run lint`; `npm run build`; `npm run maintainability:check`; and `git diff --check`. The runbook now records the stop rule. No worker deployment, scheduler, production flag, financial authority, legacy route, or production data changed. The next safe action remains additional bounded operational evidence or non-financial repository work while authenticated current Cloudflare preview evidence is blocked.


### Live Railway read-only MCP evidence — 2026-09-23

After enabling the protected read-only Railway MCP, live checks returned `GET /api/health -> 200` with `adminSdk: true` and exact deployed version `b75a024746a692e3d6f89de561b65730e6eae257`; `GET /api/system-config -> 200` (payload intentionally not copied into repository evidence); `GET /api/v2/health -> 200` with `environment: production` and `firebaseEmulator: false`; and `GET /api/v2/packages -> 401` with `Missing Firebase ID token`. This confirms the operator diagnostic boundary and the unauthenticated v2 package-read boundary only. The operator token is not a Firebase user token, so this is not authenticated Cloudflare preview evidence. No production data, flags, traffic authority, or financial behavior changed.


### Projection repair queue expired-failure coverage — 2026-09-23

Commit `3797734` adds emulator-backed coverage proving that a worker whose lease has expired cannot fail a queued repair task and cannot change its `running` state, matching the existing completion-side fail-closed rule. The focused queue suite passed 6 tests. The first complete-gate attempt encountered one transient timeout in the unrelated vehicle check-in concurrency test; that test passed in isolation, and the corrected complete validation retry passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. No runtime queue behavior, production worker, scheduler, flag, financial authority, or production data changed.


### Projection repair queue retry timing coverage — 2026-09-23

Commit `c3b76b3` adds emulator-backed coverage that a failed repair task is not reclaimed before its bounded `nextAttemptAt` and is reclaimable at the exact due time. The focused queue suite passes 7 tests. The complete corrected validation gate passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. No runtime queue behavior, production worker, scheduler, flag, financial authority, or production data changed.


### Authenticated preview read-route boundary coverage — 2026-09-23

Commit `6b8964d` adds route coverage proving that when the authenticated preview middleware is mounted, unauthenticated requests to package catalog, garage summary, pending, and activity reads all fail with `401` before reaching their repositories. The focused read-route suite and v2 typecheck passed; the complete corrected validation gate also passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. No production flag, deployment authority, financial write, or production data changed.


### Package and garage-summary read guard coverage — 2026-09-23

Commit `60d38e3` extends read-route coverage so production-disabled package catalog and garage-summary reads return `404`, while malformed package limits and summary dates return stable `400` envelopes. The focused read-route suite and v2 typecheck passed; the complete corrected validation gate passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. No production flag, deployment authority, financial write, or production data changed.


### Current Cloudflare preview discovery and public smoke evidence — 2026-09-23

The enabled Cloudflare connector confirmed the Pages project `rq` is connected to `tarekhamada875-droid/RQ-`, with preview deployments enabled for all branches. The newest prior preview was stale (`feat/backend-operator-mcp-auth`, 2026-09-19), so a temporary branch `preview/current-main-v2-smoke` was pushed from current `main` commit `2eddcfa`. Cloudflare created active preview deployment `7a66d0e0` with alias `https://preview-current-main-v2-smok.rq-acg.pages.dev`. The public browser smoke check loaded the current RQ login screen successfully. Read-only Railway checks returned `/api/health` `200` with version `2eddcfa...`, `/api/v2/health` `200`, and unauthenticated `/api/v2/packages` `401` with `UNAUTHORIZED`. Authenticated package, summary, and shadow comparisons remain unexecuted because no Firebase session or test credential was supplied; no credentials were guessed or attempted. No production flags, financial authority, or production data changed.


### Shadow-comparison route failure hardening — 2026-09-23

Commit `f9a280b` adds route coverage proving shadow comparison rejects strict payload violations and redacts provider exceptions behind a stable `500 INTERNAL_ERROR` envelope. The focused route suite passes 4 tests; the complete corrected validation gate passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. No shadow flag, production traffic, financial authority, or production data changed.


### Shadow rollback fallback safety hardening — 2026-09-23

Commit `a467b31` closes a policy gap: when the legacy fallback is explicitly unavailable, shadow-read decisions now block rather than permitting v2, regardless of preview flag state. Unauthenticated previews still fail closed to legacy when fallback is available. Focused policy/coordinator coverage passes 11 tests; the complete corrected validation gate passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. No production shadow flag, financial authority, traffic, or production data changed.


### Projection repair calendar-date contract hardening — 2026-09-23

Commit `e83161d` reuses the canonical real-calendar-date validator for projection events, projection state, and repair tasks. Impossible dates such as `2026-02-29` are rejected before repository access, preventing malformed operational repair input from entering rebuild logic. Focused worker coverage passes 5 tests; the complete corrected validation gate passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. The worker remains library-only, undeployed, unscheduled, and disconnected from automatic production mutation.


### Token-ending succession handoff — 2026-09-23 19:10 UTC+3

The owner issued the exact `tokens ending` trigger; no new feature was started after it. Final repository state is clean on `main` at `c67c3bd50bcb43b4a6d92f6a17895a557edf7d2c`, synchronized with `origin/main`. Production Gate `35879864414` succeeded for the latest documentation commit. The current implementation includes shadow route error redaction and strict validation (`f9a280b`), rollback blocking when legacy fallback is unavailable (`a467b31`), and real-calendar-date validation across projection repair contracts (`e83161d`). The full corrected validation sequence passed for the current implementation.

The Railway read-only MCP connector is enabled and its external no-secret smoke test passed. Cloudflare is enabled. My Browser is enabled but is not needed for the next task. Authenticated preview evidence remains blocked because no legitimate current non-production preview is available and the connected browser previously stopped at the app's intentional compatibility gate. Do not weaken that gate, manufacture a preview, use production or stale deployment evidence, or substitute the Railway operator token for a Firebase user token.

The exact next bounded action is browser-free projection-worker operational preparation: add a redacted non-production invocation/evidence contract and health/failure outcome accounting, with focused tests and the complete repository gate. Keep the worker undeployed, unscheduled, flag-off, and disconnected from automatic production mutation. Financial writes, production v2/shadow flags, deletion, legacy-route retirement, and progressive cutover remain prohibited until their separate gates pass.


### Succession protocol enhancement — 2026-09-23

The complete reusable succession procedure is [`docs/SUCCESSION_PROTOCOL.md`](docs/SUCCESSION_PROTOCOL.md). It is now the standard companion to `NEXT_AGENT_HANDOFF.md` and covers state verification, exact-commit CI evidence, deployment and connector blockers, secret handling, safety invariants, bounded next-task selection, validation, publication, and closure.


### Cross-account succession and Railway MCP bootstrap enhancement — 2026-09-23

The reusable protocol now documents how a new account reconstructs the external Railway read-only MCP outside the repository. The contract exposes only `backend_health` and `read_backend_endpoint`, allows only six bounded GET paths, requires redacted output and missing-token smoke validation, and registers through the supported connector workflow. The protected variable name is `BACKEND_OPERATOR_TOKEN`; the value must remain in Railway/connector secret fields and must never enter chat, source, logs, command arguments, Git, or handoff files. Every future `tokens ending` trigger repeats this cross-account process and cannot assume inherited connector or sandbox state.


### Dashboard report garage-scope coverage — 2026-09-23 18:17 UTC

Commit `debd0c9` adds focused route coverage proving that a garage-scoped Firebase principal cannot read another garage's dashboard report; the request is rejected with the generic `FORBIDDEN` envelope before report data is returned. The focused dashboard-report suite passes 7 tests and v2 typecheck passes. The corrected complete emulator-backed v2 check, application tests, lint, production build, maintainability check, and diff check all pass. Production Gate `35901088303` passed for exact commit `debd0c9`.

This is test-only hardening. No route authority, production flag, financial writer, projection worker, deletion behavior, legacy route, or production data changed. No current authenticated non-production Cloudflare preview exists, so authenticated frontend evidence remains blocked; production and stale previews must not be used as substitutes. The next bounded slice is dashboard-report repository-error redaction coverage, proving provider failures return only the generic `INTERNAL_ERROR` envelope.


### Dashboard report error-redaction coverage — 2026-09-24 04:18 UTC

Commit `e80f88e` adds focused coverage proving that a dashboard-summary repository failure is returned as the generic `INTERNAL_ERROR` envelope and that an internal Firestore path is not exposed. The focused report suite passes 8 tests, v2 typecheck passes, the corrected complete emulator-backed and application validation sequence passes, and Production Gate `35954928976` succeeds for the exact commit.

This is test-only hardening. No runtime authority, production flag, financial writer, projection worker, deletion behavior, legacy route, or production data changed. No current authenticated non-production Cloudflare preview exists, so authenticated frontend evidence remains blocked. The next bounded slice is equivalent projection-repository error-redaction coverage for the same dashboard report route.


### Dashboard report projection-error redaction coverage — 2026-09-24 04:28 UTC

Commit `38cec77` adds focused coverage proving that a projection-repository failure in the dashboard report route returns the generic `INTERNAL_ERROR` envelope without exposing internal failure text. The focused report suite passes 9 tests, v2 typecheck passes, the complete emulator-backed and application validation sequence passes, and Production Gate `35955592411` succeeds for the exact commit.

This is test-only hardening. No runtime authority, production flag, financial writer, projection worker, deletion behavior, legacy route, or production data changed. No current authenticated non-production Cloudflare preview exists, so authenticated frontend evidence remains blocked. The next bounded slice is combined repository-failure redaction coverage for the dashboard report route.


### Dashboard report combined repository-failure redaction matrix — 2026-09-24 04:39 UTC

Commit `48bf815` consolidates summary- and projection-repository failure checks into one explicit table-driven redaction matrix. Both cases return the generic `INTERNAL_ERROR` envelope without exposing internal details. The focused report suite passes 9 tests, v2 typecheck passes, the complete emulator-backed and application validation sequence passes, and Production Gate `35956361235` succeeds for the exact commit.

This is test-only hardening. No runtime authority, production flag, financial writer, projection worker, deletion behavior, legacy route, or production data changed. No current authenticated non-production Cloudflare preview exists, so authenticated frontend evidence remains blocked. The next bounded slice is dashboard-report success-envelope schema coverage for consistent and repair-needed responses.


### Dashboard report success-envelope schema coverage — 2026-09-24 04:50 UTC

Commit `5bbd454` adds focused success-envelope assertions for consistent and summary-mismatch repair-needed dashboard reports. Each response now validates the exact top-level success keys, UUID request ID, and typed `DashboardReportSchema`. The focused suite passes 9 tests, v2 typecheck passes, the corrected complete validation sequence passes after an isolated transient subscriber timeout reproduction passed all 25 tests, and Production Gate `35957142712` succeeds for the exact commit.

This is test-only hardening. No runtime authority, production flag, financial writer, projection worker, deletion behavior, legacy route, or production data changed. No current authenticated non-production Cloudflare preview exists, so authenticated frontend evidence remains blocked. The next bounded slice is stale-projection success-envelope schema coverage.


### Legacy-first functional-refactor strategy — 2026-09-24

The implementation strategy has changed from expanding the parallel V2 replacement to **remodeling the real production backend incrementally**. The legacy `server/` backend remains authoritative and must continue serving the existing routes and writing financial data. `server-v2` is paused as a feature-development track; retain it for typed-contract and test references, but do not enable it as production authority.

The recommended architecture is a functional core with an imperative Firestore shell. Pure domain functions will decide validation, authorization, state transitions, pricing, and replay outcomes. Existing legacy route adapters will continue to perform authentication, Firestore reads and transactions, event recording, idempotency persistence, logging, and HTTP response translation. This preserves the live data model and makes each change reversible.

The new plan is: characterize legacy subscriber lifecycle behavior first; extract subscriber transitions; extract vehicle check-in; extract vehicle check-out; extract non-financial garage policies; refactor authentication policy; and migrate financial behavior last. No financial dual-write is permitted. The full assessment and detailed sequencing are in `docs/LEGACY_BACKEND_FUNCTIONAL_REFACTOR_ASSESSMENT.md`.

The next agent must begin with a bounded, runtime-neutral characterization slice for legacy subscriber add, renew, update, and delete. Coverage must include success, garage scope, invalid dates, immutable plates, missing records, replay, and changed-payload idempotency contracts. Do not alter production flags, routes, data, or authority in that slice.

At the pivot point, `b1d65bf` is the synchronized repository tip. Local V2 validation after the hardening work passed 59 files and 337 tests, and repository typecheck, tests, build, and maintainability checks passed. Production Gate `35962732184` was green through maintainability and remained at Railway smoke when monitoring was stopped; its final conclusion must be rechecked rather than assumed successful.

Safety boundaries remain unchanged: production V2 and shadow flags stay disabled; financial writes remain legacy-only; physical deletion remains deferred; the projection worker remains undeployed and unscheduled; legacy routes remain available; and no stale or production Cloudflare deployment may be used as current authenticated preview evidence.
