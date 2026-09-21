# RQ Backend Overhaul — Continuation Handoff

**Last updated:** 2026-09-21 13:12 UTC+3
**Repository:** `tarekhamada875-droid/RQ-`  
**Branch:** `main`  
**Latest validated commit:** `daf46eb feat: add firestore vehicle state repository`
**Latest GitHub Production Gate:** `35587181364` — **success**

## Mission

Continue the staged, contract-first v2 backend replacement described in the [master overhaul plan][1]. The current Railway legacy backend remains the production authority. The `server-v2` tree is a parallel system that is now partially deployed as a guarded preview, but it is not yet a replacement backend.

The next agent must preserve the migration strategy: implement one bounded capability, validate it locally and in CI, deploy only behind an explicit preview gate, compare it with legacy behavior, and migrate production traffic only after correctness, authorization, cost, rollback, and operational checks pass.

> **Do not delete legacy routes, migrate financial writes, change production frontend flags, or delete production data during the repository and preview phases.**

## Operating rules

The user has approved direct pushes to `main` and does not want long-lived branches. For every implementation slice:

1. Inspect the current code, legacy behavior, and the relevant section of the master plan.
2. Implement one bounded change without changing production authority.
3. Run focused tests first, then the complete applicable validation gate.
4. Review `git diff --check`, `git status`, and the exact changed files.
5. Push the validated slice directly to `main`.
6. Watch the GitHub Production Gate and report the commit, gate result, and any limitations.

The user has given the agent discretion to choose the next safe slice. Do not ask for routine confirmation. Pause only for a real permission failure, a required user credential, a protected external action, or a choice that materially changes behavior or production risk.

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

The critical fix in `a85035e` mounted v2 before the legacy `/api` 404 fallback. Do not reorder this middleware again.

### Cloudflare Pages

The Pages project is `rq`, with production domain `https://rq-acg.pages.dev`. It builds from `main` using:

```text
npm run build:web
```

The preview environment now contains:

```text
VITE_BACKEND_API_URL=https://rq-production-af02.up.railway.app
VITE_V2_READ_PACKAGE_CATALOG=true
```

The production environment does **not** contain `VITE_V2_READ_PACKAGE_CATALOG`; production remains on the legacy provider. The v2 flag parser defaults every flag to false unless the exact value is `true`.

There is currently no Cloudflare preview deployment available for an authenticated browser smoke test. The user explicitly prohibited branch creation, so do not create a branch merely to manufacture a preview URL. Do not claim Cloudflare-to-Railway authenticated end-to-end success until a real non-production preview deployment has been tested.

### Latest frontend slice

Commit `35d5856 feat: gate package catalog reads through v2` added:

- A strict v2 package catalog adapter.
- Support for the deployed paginated response shape `{ data: { items, limit } }`.
- Conversion from v2 minor units into the legacy UI package model.
- A feature-gated package loader in `useGarageSync`.
- Legacy Firestore listener fallback if v2 is unavailable.

The package adapter tests and TypeScript check passed. The full frontend test suite and production web build also passed. The GitHub Production Gate for `35d5856` was successful as run `35585634246`.

### Latest backend repository slice

Commit `daf46eb feat: add firestore vehicle state repository` added:

- `server-v2/repositories/firestoreVehicles.ts`.
- `server-v2/test/firestoreVehicles.test.ts`.

The repository reads the legacy collection `garages/{garageId}/vehicles`, filters `status == inside`, orders by `entryTime desc` and document ID, applies a maximum bounded limit of 200, maps legacy fields into strict `VehicleState`, and records returned Firestore reads. It is read-only. No lifecycle HTTP route or legacy write path was changed.

Validation passed locally:

```text
npm run check:v2
25 test files passed
115 tests passed
strict v2 typecheck passed
explicit-any gate passed
git diff --check passed
```

The GitHub Production Gate for `daf46eb` passed as run `35587181364`.

## What is complete

The following foundations exist and are tested:

- Strict `server-v2` TypeScript configuration, environment parsing, API envelopes, Vitest configuration, CI gates, and the explicit-`any` gate.
- Typed entities, money, dates, cursor pagination, pricing, capacity, trials, commissions, refunds, business events, retries, and idempotency primitives.
- Typed Firestore converter boundaries and in-memory repository doubles.
- Session expiry, revocation, inactivity, role, garage-scope, audit context, redaction, and rate-limit policies.
- Firebase ID-token middleware, canonical session lookup, CORS allowlisting, request context, request IDs, authenticated-UID rate limiting, telemetry, and route budgets.
- Package catalog and garage-summary repository abstractions, production package repository, production garage-summary repository, pending/activity Firestore read models, and emulator tests.
- Production vehicle state repository with emulator tests.
- Lifecycle domain commands for vehicles, subscribers, garage lock/suspension, deletion, and idempotency. These are domain primitives only; they are not yet production HTTP commands.
- Financial contracts, wallet math, reconciliation, audit events, and in-memory transaction primitives. Financial authority is not migrated.
- Projection reducers, bounded read models, daily financial summaries, reports, lag, repair-needed states, and related tests.
- Guarded Railway bootstrap under `/api/v2`.
- Typed Cloudflare frontend read adapter, package catalog feature routing, safe legacy fallback, and preview-only smoke harness.

## Known gaps

### Production repositories

Remaining production Firestore repositories include subscribers and garage state. Vehicle state is now covered for bounded active reads, but its transactional write repository does not exist yet.

### HTTP routes

Only the guarded read routes are currently exposed: health, packages, garage summary, pending, and activity. Authenticated lifecycle routes for vehicle entry/exit, subscriber operations, garage lock/suspension, garage management, and deletion are not complete.

### Authenticated Cloudflare preview smoke

Railway authentication and CORS have been tested through local and live unauthenticated boundary checks. A real authenticated Cloudflare preview request still needs to be performed with a Firebase-authenticated browser session. The Railway operator MCP token cannot substitute for a Firebase user token.

### Financial authority

The existing backend remains the only financial writer. Do not dual-write money operations. Build and test Firestore transactions, idempotency persistence, reconciliation, repair behavior, rollback, and an explicit cutover plan before migrating any financial write.

## Exact next actions for the next agent

### First action: re-establish context

From `/home/ubuntu/RQ-`, run:

```bash
git status --short
git log -8 --oneline
manus-config config load --search railway
manus-config connector list --user-custom-only
```

Confirm that the working tree is clean, `HEAD` is `daf46eb` or newer, and the Railway operator connector is enabled. Do not recreate the connector if it already exists.

### Second action: implement the subscriber repository

Build the next bounded slice as a production Firestore read repository for subscriber state. Use the existing strict contract in `server-v2/contracts/subscriber.ts` and the legacy collection shape under `garages/{garageId}/subscribers`.

The repository should:

- Map legacy subscriber fields into `SubscriberState` with strict Zod validation.
- Preserve `id`, `garageId`, plate identity, status, start date, end date, and update time.
- Read only one garage scope at a time.
- Use a bounded, deterministic query with an explicit order and limit.
- Record returned Firestore reads with the existing cost instrumentation.
- Reject invalid garage IDs and limits before issuing a Firestore read.
- Remain read-only. Do not add subscriber writes or HTTP routes in this slice.
- Add emulator tests for mapping, malformed documents, active/status filtering, deterministic ordering, bounds, and cost accounting.

Use the vehicle repository and `firestorePackageCatalog.test.ts` as style references. Keep the new files isolated under `server-v2/repositories/` and `server-v2/test/`.

### Third action: validate and publish the subscriber slice

Start the cached Firestore emulator directly if the Firebase CLI is unavailable:

```bash
java -jar /home/ubuntu/.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar \
  --host 127.0.0.1 --port 8080 --project_id rq-v2-subscriber-emulator
```

Then run:

```bash
npm run check:v2
git diff --check
git status --short
```

Review the exact diff. Commit and push directly to `main`, then watch the latest GitHub Production Gate:

```bash
git add server-v2/repositories server-v2/test
git commit -m "feat: add firestore subscriber state repository"
git push origin main
run_id=$(gh run list --repo tarekhamada875-droid/RQ- --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --repo tarekhamada875-droid/RQ- --exit-status
```

### Fourth action: implement the garage state repository

After the subscriber slice is green, inspect the legacy `garages` documents and strict `GarageSchema`. Add a bounded production repository for garage state and emulator tests. Preserve the separation between current state and projected summaries. Do not introduce garage management writes yet.

### Fifth action: perform authenticated preview validation when a real preview exists

Use the Cloudflare connector to inspect the `rq` Pages project. Keep the production environment unchanged. If a non-production preview URL exists, test the deployed frontend with a Firebase-authenticated browser session and verify:

```text
GET /api/v2/health   -> 200
GET /api/v2/packages?limit=100 -> authenticated success
```

Compare the normalized v2 package catalog with the legacy Firestore result. Record any difference with the endpoint, request ID, tenant/garage scope, and data version. Do not enable the production flag after a single successful request; first verify fallback and rollback behavior.

### Sixth action: begin lifecycle routes

Only after the read repositories and authenticated preview checks are stable, implement one authenticated lifecycle route at a time. Start with vehicle check-in and check-out. Each route needs a strict request/response contract, Firebase authentication, canonical session authorization, garage scope enforcement, an idempotency record, a transaction boundary, audit behavior, emulator concurrency tests, and a rollback note.

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
5. Require and validate these variables at startup:

```text
RQ_BACKEND_URL
BACKEND_OPERATOR_TOKEN
RQ_BACKEND_TIMEOUT_MS (optional, default 10000, bounded 1000–60000)
```

6. Implement a strict read-only allowlist. Reject every path not explicitly listed. Use `GET` only, attach `x-backend-operator-token`, generate a correlation ID, enforce an abort timeout, parse JSON safely, and cap raw non-JSON output.
7. Register only read tools. Do not expose POST, PUT, PATCH, DELETE, arbitrary URL access, shell execution, Firestore access, or token inspection.
8. Register the external connector using `manus-config` only after inspecting current config:

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
