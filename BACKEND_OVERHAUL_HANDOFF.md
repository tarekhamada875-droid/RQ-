# RQ Backend Overhaul — Continuation Handoff

**Last updated:** 2026-09-22 12:46 UTC+3
**Repository:** `tarekhamada875-droid/RQ-`
**Branch:** `main`
**Latest published documentation commit:** `322faee docs: define repeatable agent handoff protocol`
**Latest implementation commit:** `07308e5 feat: add gated shadow comparison route`
**Latest correction commit:** `4cc13b1 test: correct garage summary read cost assertions`
**Latest verified implementation gate:** `35714135062` — **success** for `6b6a1a2`; the shadow-comparison coordinator passes strict typecheck, focused tests, full emulator-backed v2 validation, build, and diff checks locally. The new gated route passes focused and full local validation and is awaiting its Production Gate. The latest Pages production deployment is `02ff95db` for `6b6a1a2`.

## Mission

Continue the staged, contract-first v2 backend replacement described in the [master overhaul plan][1]. The current Railway legacy backend remains the production authority. The `server-v2` tree is a parallel system that is now partially deployed as a guarded preview, but it is not yet a replacement backend.

The next agent must preserve the migration strategy: implement one bounded capability, validate it locally and in CI, deploy only behind an explicit preview gate, compare it with legacy behavior, and migrate production traffic only after correctness, authorization, cost, rollback, and operational checks pass.

> **Do not delete legacy routes, migrate financial writes, change production frontend flags, or delete production data during the repository and preview phases.**

## Token-exhaustion handoff protocol

If the user says that the agent's tokens are about to end, do not merely summarize in chat. Immediately perform the same controlled handoff process used for this continuation: inspect the current `HEAD` and working tree; record completed work, exact commits, tests, CI gates, deployment/preview evidence, blocked validations, safety boundaries, and the next bounded action in this file; run `git diff --check`; commit and push the handoff directly to `main`; verify the file is non-empty and the working tree is clean; then provide the user with a self-contained, paste-ready continuation message that names the repository path, current commit, files to read, current production/preview authority, exact next steps, and all prohibitions. The next agent must be prepared to repeat this protocol whenever the user gives the same warning, preserving the same execution model rather than starting a new planning style.

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

Railway authentication and CORS have been tested through local and live unauthenticated boundary checks. A real authenticated Cloudflare preview request still needs to be performed with a Firebase-authenticated browser session when a current non-production preview exists. The Railway operator MCP token cannot substitute for a Firebase user token.

### Financial authority

The existing backend remains the only financial writer. Do not dual-write money operations. Build and test Firestore transactions, idempotency persistence, reconciliation, repair behavior, rollback, and an explicit cutover plan before migrating any financial write.

### Migration safety

Pure normalized comparison, redacted mismatch reporting, fail-closed rollback policy, and the [migration-safety runbook](docs/migration-safety-runbook.md) now exist. They do not establish authenticated frontend-to-Railway success and are not connected to production flags or dual-write behavior.

## Exact next actions for the next agent

### Agent continuation packet — 2026-09-22 13:23 UTC+3

The previous agent added the production Firestore garage-summary adapter, transactional projection persistence, a bounded deterministic projection rebuild primitive, the explicitly flagged admin repair endpoint, the read-only status endpoint in `6d2dc91`, the fail-closed shadow-read policy in `9c61429`, the pure shadow-comparison coordinator in `5a0cb56`, and a preview-only admin route in `07308e5`. Commit `2c9186f` now wires real read-only Firestore legacy/v2 providers into the guarded preview composition. The route is `POST /api/v2/shadow/compare`, requires admin Firebase/session authorization, accepts only `packages` or date-scoped `garage_summary` requests, and remains disabled unless `V2_SHADOW_COMPARISON_ENABLED=true`. The provider independently maps legacy package and dashboard-summary data into strict v2-compatible records, compares them against the typed v2 repositories, runs both reads concurrently, permits v2 only after an equal comparison, falls back to legacy when v2 fails, and blocks when legacy fails. Mismatches remain redacted and financial/authorization mismatches remain fail-closed. It performs no writes and does not change traffic. The status route remains disabled unless `V2_PROJECTION_STATUS_ENABLED=true`; the repair route remains disabled unless `V2_PROJECTION_REPAIR_ENABLED=true`. The full emulator-backed `npm run check:v2` passes locally with 55 test files and 293 tests; the focused provider/route tests add 9 passing tests. Production Gate `35750806751` passed for `2c9186f`. Do not assume older commit references elsewhere in this document are the current `HEAD`; verify them before relying on them.

The most recent implementation is `2c9186f feat: wire preview shadow read providers`. It adds `server-v2/migration/firestoreShadowComparison.ts`, wires the provider through `server-v2/preview.ts`, and adds `server-v2/test/firestoreShadowComparison.test.ts`. Its Production Gate `35750806751` passed. The provider is preview-only and does not establish authenticated Cloudflare-to-Railway evidence.

The most recent permitted external inspection used the enabled Cloudflare connector at 2026-09-22 12:42 UTC+3. Project `rq` still has preview deployments enabled for all branches and preview-only `VITE_V2_READ_PACKAGE_CATALOG=true`; production does not have that flag. There is no current preview deployment: the latest deployment `f7da4593` is production for `main` commit `1604a7f`, and the first page of the deployment list contains only production deployments. Do not use an older preview for authenticated current-build evidence, create a branch to manufacture a preview, change production flags, or claim Firebase-authenticated frontend-to-Railway success.

The next agent should proceed autonomously in this order: first verify `git status --short --branch`, `git log -3 --oneline`, and the relevant current files; next, if a current natural Cloudflare preview has appeared, perform the authenticated Firebase browser smoke test and normalized legacy/v2 comparison; otherwise keep that item blocked and do not manufacture a preview. For backend implementation, physical deletion remains deferred because it would mutate data. A future deletion slice may only begin as a non-production, explicitly approved exercise and must add strict contracts, authorization, idempotency, bounded cursor traversal, reference verification, retention metadata, repair/resume behavior, audit events, emulator/concurrency tests, and a rollback note before any actual delete operation. The existing `server-v2/repositories/firestoreGarageDeletion.ts` is intentionally non-destructive: it marks `isDeleting`, tracks a resumable job, and records `physicalDeletion: false`; do not silently convert it into a physical delete writer.

For every new slice, follow the established sequence: inspect legacy behavior and the master plan; implement one bounded capability behind the existing preview gate; run focused tests followed by `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`; review changed files and status; push directly to `main` (approved); watch the GitHub Production Gate; then update this handoff with the exact implementation commit, gate run, limitations, and next action. Keep Railway legacy routes and financial writes authoritative.

### Completed implementation slices

The repository context is clean at `2c9186f`. Subscriber and garage read repositories, vehicle pricing compatibility, vehicle check-in/check-out transactional persistence and routes, subscriber-create, subscriber-renew, subscriber-update, subscriber-suspend, reversible subscriber-cancel, reversible subscriber tombstone, admin-only garage lifecycle transactional persistence and routes, non-destructive garage deletion jobs, garage profile updates, the production Firestore garage-summary adapter, transactional daily projection persistence with event-id replay protection, the bounded projection rebuild primitive, the disabled-by-default admin repair route, the disabled-by-default read-only projection status route, and preview-only real legacy/v2 shadow providers are complete in the repository. Strict v2 typecheck, full emulator-backed `npm run check:v2` (55 files/293 tests), focused shadow tests (9 tests), application tests, production build, maintainability checks, and diff checks pass locally. Projection persistence, repair, status, and shadow comparison are read-model capabilities only; none is a financial writer.

### Current blocking validation

Use the enabled Cloudflare connector to inspect the `rq` Pages project before claiming preview readiness. The 2026-09-22 inspection confirmed preview support is enabled, but the available preview deployments are stale builds from old feature branches. The current `main` commit `2c9186f` has not yet been validated through a current non-production frontend preview. Do not create a branch merely to manufacture a current preview URL, and do not use a stale preview to claim current authenticated end-to-end behavior. Emulator-backed repository validation is no longer blocked locally after downloading the same emulator through Firebase CLI.

When a current non-production preview exists, use a Firebase-authenticated browser session to verify:

```text
GET /api/v2/health   -> 200
GET /api/v2/packages?limit=100 -> authenticated success
POST /api/v2/shadow/compare -> authenticated admin-only comparison for packages and a date-scoped garage summary
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

After publication, the next bounded work is preview evidence: inspect the current Cloudflare Pages project and obtain a real current non-production preview only if one exists naturally; do not create a branch merely to manufacture one. Authenticated browser validation remains blocked until a current preview and Firebase-authenticated session exist. If no current preview exists, do not manufacture one; continue with read-only inspection and the next reversible backend safety slice rather than changing production flags. The real preview-only shadow providers are now wired and locally validated, but no live shadow comparison is claimed until the authenticated preview request succeeds.

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

1. Ask the user to provide or create a Railway backend operator token. Never invent one and never put it in Git.
2. Ask for the Railway backend base URL if it is not already known. The current URL is `https://rq-production-af02.up.railway.app`.
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
8. Register the external connector using `manus-config` only after inspecting current config. Do not edit `/home/ubuntu/.manus/config/config.json` directly:

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

- `HEAD`: `b87ef01 docs: add comprehensive next agent handoff`
- Working tree: clean and synchronized with `origin/main`
- Latest Production Gate: `35720900015` — success
- Application suite: 55 files / 296 tests passed
- Server v2 suite: 54 files / 287 tests passed
- Production flags: unchanged and disabled for v2 migration behavior
- Financial authority: legacy backend remains authoritative
- Cloudflare: current `main` deployments are production; no current non-production preview is available
