# Next Agent Handoff — RQ Backend Overhaul

## Read this first

You are continuing a controlled backend replacement project. Your job is to improve the new `server-v2` backend without breaking the current production system.

The old backend is still the **production authority**. The new backend is a guarded preview. Treat every production change as dangerous unless the overhaul plan explicitly allows it.

Start in:

```text
/home/ubuntu/RQ-
```

Read these files before changing code:

1. `BACKEND_COMPLETE_OVERHAUL_STAGES.md` — the master plan and stage status.
2. `BACKEND_OVERHAUL_HANDOFF.md` — the current evidence and known blockers.
3. This file — your operating instructions.
4. The relevant legacy implementation and the matching `server-v2` contracts, repository, route, and tests.

## Current repository state

The current published `main` commit is:

```text
b87ef01 docs: add comprehensive next agent handoff
```

The working tree is clean and synchronized with `origin/main`.

The latest successful Production Gate is:

```text
35720900015 — success
```

The latest local validation is:

- Application suite: 55 test files, 296 tests passed.
- Server v2 suite: 54 test files, 287 tests passed.
- Strict v2 typecheck: passed.
- Emulator-backed Firestore validation: passed.
- Production build: passed.
- CI workflow: runs on every push.

## The mission

Move the system from the old backend to the new backend safely, in small reversible steps.

You are not trying to replace the backend in one jump. You are building evidence first:

1. Prove that the new backend behaves like the old backend.
2. Prove authentication, authorization, scope, cost, latency, rollback, and repair behavior.
3. Use a real non-production frontend preview to test the full Cloudflare-to-Railway path.
4. Only then consider controlled read traffic.
5. Migrate financial authority last.
6. Retire old paths only after the rollback window has expired.

## Exact working method

Follow this sequence for every new slice.

### 1. Inspect before editing

Run:

```bash
git status --short --branch
git log -3 --oneline
```

Then inspect:

- The master-plan stage you are working on.
- The current handoff and known gaps.
- The matching legacy route/service/repository.
- The existing `server-v2` contract and repository patterns.
- Existing tests for a similar feature.
- Environment flags and preview wiring.
- CI workflow expectations.

Do not implement from a general idea when the repository already has a pattern. Copy the repository's existing conventions for contracts, idempotency, audit events, authorization, request IDs, response envelopes, emulator setup, and error handling.

### 2. Choose one bounded capability

Implement one small capability at a time. Put it behind the existing preview or feature gate when it is not already safe for all environments.

Prefer read-only and non-financial work first. Keep the change easy to revert. Do not mix unrelated refactors with the capability.

### 3. Add tests before calling it complete

Add focused tests for:

- Valid behavior.
- Invalid input.
- Authentication failure.
- Authorization failure.
- Cross-garage or cross-scope access.
- Feature-flag disabled behavior.
- Idempotency where a command writes.
- Audit events where a command writes.
- Replay and changed-payload conflict.
- Concurrency where transactions are involved.
- Emulator behavior for Firestore repositories.
- Production non-exposure where the route is preview-only.

### 4. Validate locally

Run focused tests first, then the complete checks:

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

The emulator can occasionally time out on Firestore concurrency tests. If that happens, rerun the focused failing test once in a fresh emulator project. Record whether the retry passes. Do not weaken a concurrency test merely to make CI green.

### 5. Review the diff

Before committing:

```bash
git diff --stat
git diff --check
git status --short
```

Review every changed file. Confirm that no secret, token, credential, production flag, generated artifact, or unrelated file was added.

### 6. Publish and verify CI

Direct pushes to `main` are authorized for this project. After validation:

```bash
git add <exact-files>
git commit -m "<small descriptive message>"
git push origin main
gh run list --repo tarekhamada875-droid/RQ- --limit 5 --json databaseId,headSha,status,conclusion,name,displayTitle,createdAt
```

Wait for the Production Gate result before describing the slice as verified. If a newer commit cancels an earlier run, use the final run for the latest commit.

### 7. Update the handoff

After the gate finishes, update both:

- `BACKEND_OVERHAUL_HANDOFF.md`
- `BACKEND_COMPLETE_OVERHAUL_STAGES.md`

Record:

- Exact implementation commit.
- Exact documentation commit.
- Exact CI run and conclusion.
- Local test counts.
- What is still blocked.
- The next bounded action.

Never leave stale commit numbers or test counts in the handoff.

### External services and credentials

Before using Cloudflare, Railway, GitHub, or another external service, inspect the configured connector state and use the enabled connector or the repository's existing CLI convention. Do not invent credentials, print secret values, paste tokens into files, or replace a configured connector with an ad hoc integration. Keep all operator tokens server-to-server and treat them as different from Firebase user authentication. Redact secrets from command output, logs, screenshots, test artifacts, and handoff text.

### Railway MCP build or restore procedure

The Railway operator MCP is deliberately outside this repository. Never commit it into `RQ-`, put it under `server-v2`, bundle it into the frontend, or place its token in Git. The existing reference implementation is:

```text
/home/ubuntu/rq-backend-mcp/server.mjs
```

Before rebuilding anything, inspect the configured connector and the external directory:

```bash
manus-config config load --search railway
manus-config connector list --user-custom-only
find /home/ubuntu/rq-backend-mcp -maxdepth 1 -type f -print
```

The current connector is named `RQ Railway Backend Operator`. It is a stdio MCP launched with Node and uses these environment variables:

```text
RQ_BACKEND_URL=https://rq-production-af02.up.railway.app
BACKEND_OPERATOR_TOKEN=<user-provided Railway operator token>
RQ_BACKEND_TIMEOUT_MS=10000
```

Never print the token, place it on a shell command line, write it to the repository, put it in this handoff, or include it in a test fixture. If the token is missing or expired, stop and ask the user to provide or rotate it. Never invent a token. The operator token is server-to-server only; it cannot authenticate Firebase frontend users.

If the external MCP directory is missing, create it outside the repository and install the MCP SDK there:

```bash
mkdir -p /home/ubuntu/rq-backend-mcp
cd /home/ubuntu/rq-backend-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
```

Implement or restore a Node server using `StdioServerTransport`. At startup, require `RQ_BACKEND_URL` and `BACKEND_OPERATOR_TOKEN`; accept `RQ_BACKEND_TIMEOUT_MS` only within the bounded range 1000–60000 milliseconds, defaulting to 10000. The server must use `GET` only, attach `x-backend-operator-token`, create a correlation ID, enforce an abort timeout, parse JSON safely, and cap raw non-JSON responses.

Expose only these read-only tools:

```text
backend_health
read_backend_endpoint
```

The endpoint tool must validate the path against this explicit allowlist and must not accept a caller-supplied base URL:

```text
/api/health
/api/system-config
/v2/health
/api/v2/health
/v2/packages
/api/v2/packages
```

Do not add POST, PUT, PATCH, DELETE, arbitrary URL access, shell execution, Firestore access, token inspection, or mutation tools. Do not use the MCP to bypass Firebase authorization or to perform business operations.

Register or restore the connector through `manus-config`, not by editing `/home/ubuntu/.manus/config/config.json` directly. Inspect first:

```bash
manus-config config load --search railway
```

If no matching connector exists, create a form-mode stdio connector draft. Put secrets only in the connector environment fields; never put them in command arguments. A connector review/approval step may be presented to the user; do not bypass it.

After registration or restoration, verify without exposing secrets:

```bash
manus-config connector list --user-custom-only
manus-mcp-cli tool list --server 'RQ Railway Backend Operator'
manus-mcp-cli tool call backend_health --server 'RQ Railway Backend Operator' --input '{}'
manus-mcp-cli tool call read_backend_endpoint --server 'RQ Railway Backend Operator' --input '{"path":"/api/v2/health"}'
```

Use only allowlisted read paths for verification. Inspect the returned status and redacted metadata, not secret configuration. The MCP is a diagnostic/operator boundary, not part of the application backend and not evidence of authenticated Cloudflare-to-Railway frontend behavior.

## What is already complete

The repository already contains:

- Strict v2 TypeScript foundation and CI/CD.
- Typed API envelopes and environment parsing.
- Firebase authentication/session adapters and authorization policies.
- CORS allowlisting, request IDs, rate limits, and structured telemetry.
- Package catalog, garage summary, vehicle, subscriber, garage-state, pending, and activity repositories.
- Vehicle check-in/check-out commands.
- Subscriber create, renew, update, suspend, cancel, and reversible tombstone commands.
- Garage lifecycle commands.
- Non-destructive garage deletion jobs.
- Non-financial garage profile updates.
- Projection persistence with event replay protection.
- Bounded deterministic projection rebuilds.
- Admin-only, disabled-by-default projection repair route.
- Admin-only, disabled-by-default projection status route.
- Fail-closed rollback and shadow-read policies.
- Pure shadow-comparison coordinator.
- Preview-only admin route:

```text
POST /api/v2/shadow/compare
```

The route is disabled unless:

```text
V2_SHADOW_COMPARISON_ENABLED=true
```

The route currently has **no real production provider wiring**. Do not claim that it performs live comparisons until providers are actually injected and a real preview request succeeds.

## What is next

Follow this order.

### First: current authenticated Cloudflare preview evidence

Check Cloudflare before assuming a preview exists. Use the enabled Cloudflare connector or the documented project tools. The current known state is that deployments from `main` are production deployments and no current non-production preview is available.

Do not manufacture a preview by creating a branch just to trigger one. Do not use an old stale preview to claim current-build evidence.

When a real current non-production preview exists, run authenticated checks with a real Firebase-authenticated browser session:

```text
GET /api/v2/health
GET /api/v2/packages?limit=100
GET /api/v2/garages/:garageId/summary
```

The Railway operator MCP token is not a Firebase user token. Do not use it as a substitute for browser authentication.

If no current preview exists, do not wait indefinitely and do not manufacture one. Keep the preview-validation item explicitly blocked, then continue with the backend-only provider, telemetry, repository, report, and worker work described below. Re-check Cloudflare only as part of a meaningful validation step or after a new natural deployment is reported.

### Second: wire real providers into the shadow route

The next backend implementation slice should inject real read providers into the preview composition only:

- Legacy package catalog read versus v2 package catalog read.
- Legacy garage summary read versus v2 garage summary read.

The provider must:

- Be read-only.
- Use the same request scope and authenticated user.
- Include endpoint, request ID, garage/tenant scope, and data version in the comparison input.
- Reuse the existing normalized comparison utility.
- Reuse the fail-closed shadow policy.
- Return redacted mismatch data only.
- Never write comparison payloads to production.
- Never enable production traffic.

Add provider tests with deterministic legacy/v2 fixtures and preview composition tests proving the provider is absent or disabled in production.

### Third: add aggregate comparison telemetry

After real providers exist, add aggregate operational counters without storing sensitive payloads:

- comparisons attempted;
- equal comparisons;
- ordinary mismatches;
- financial mismatches;
- authorization mismatches;
- v2 read failures;
- legacy fallbacks;
- blocked comparisons;
- latency and Firestore read-cost measurements.

Keep telemetry redacted. Do not log customer data, tokens, full records, wallet values, or unrestricted request bodies.

Telemetry must be observational only. It must not become a hidden traffic switch, a financial writer, or a reason to bypass the fail-closed decision policy. A counter is not migration evidence until it comes from a current authenticated preview or an explicitly documented non-production fixture.

### Fourth: complete non-financial backend gaps

Continue with:

- Remaining entity converters and indexes.
- Remaining real Firestore-backed reports.
- Production projection workers.
- Retry, resume, and dead-letter behavior.
- Repair-needed monitoring.
- Remaining non-financial management routes.

Physical deletion is deferred. The existing deletion job is intentionally non-destructive. Do not convert it into a physical delete writer.

### Fifth: shadow comparison evidence

Run enough authenticated preview comparisons to explain every difference. Do not treat one successful request as proof.

No unexplained financial or authorization mismatch is acceptable. Any v2 error must fall back to legacy. Any legacy failure must block rather than silently selecting v2.

### Sixth: progressive read cutover

Only after comparison evidence is clean:

1. Internal/admin users.
2. One selected garage.
3. Small garage cohort.
4. Larger cohort.
5. All eligible read traffic.

At each stage define and monitor:

- equality rate;
- mismatch rate;
- hard financial/authorization mismatch count;
- p95 latency;
- Firestore reads and cost;
- error rate;
- fallback rate;
- rollback trigger;
- rollback test result.

Keep the legacy fallback available throughout the rollout.

Before each cohort expands, require an explicit checklist result for equality rate, hard-mismatch count, p95 latency, Firestore cost, error rate, fallback rate, and rollback readiness. If any threshold is missing or fails, stop at the current cohort and keep legacy authoritative.

### Seventh: financial authority migration

Financial writes come last. Before migrating them:

- Implement Firestore transactions.
- Persist idempotency records atomically.
- Persist audit/business events atomically.
- Reconcile old and new ledger behavior.
- Test retries and concurrency.
- Test repair and rollback.
- Define one financial authority.

Never dual-write money operations. Never migrate financial writes because read comparisons passed.

Financial migration is a separate approval boundary from read migration. Do not implement or enable financial Firestore writers merely because the read-side shadow route is complete. The first financial slice must remain non-production until transaction, reconciliation, repair, rollback, idempotency, audit, and concurrency evidence is complete.

### Eighth: legacy retirement

Retire legacy paths only after:

- All required read and write domains are migrated.
- The rollback window has expired.
- Retention and audit requirements are reviewed.
- Production monitoring is stable.
- The old writer cannot still be reached unexpectedly.

Do not delete production data as part of this overhaul.

## Absolute rules — do not break these

1. Do not replace the old production backend yet.
2. Do not enable production `VITE_V2_READ_*` flags.
3. Do not enable financial v2 writes.
4. Do not dual-write money operations.
5. Do not use the Railway operator token as Firebase user authentication.
6. Do not claim authenticated Cloudflare-to-Railway success without a current preview and real Firebase-authenticated request.
7. Do not create a branch solely to manufacture preview evidence.
8. Do not use stale preview deployments as current-build evidence.
9. Do not physically delete garages, subscribers, vehicles, or production data.
10. Do not silently weaken authorization, scope checks, idempotency, audit, rate limits, or rollback behavior.
11. Do not store secrets in Git, handoff files, test fixtures, logs, or generated artifacts.
12. Do not remove legacy fallback until the staged cutover is complete.
13. Do not mark a stage complete because code compiles; require tests, emulator validation, build, CI, and documented evidence.
14. Do not make unrelated broad refactors while implementing a bounded slice.

## How to report progress

When you finish a slice, report in the handoff using this structure:

```text
Implementation commit: <sha> <message>
Documentation commit: <sha> <message>
Production Gate: <run id> — success/failure
Local validation: exact test files/tests, typecheck, build, maintainability result
External evidence: preview URL or explicitly unavailable
Safety state: production flags and financial authority unchanged
Remaining blocker: one clear statement
Next action: one bounded action
```

Remember: your success is not measured by how much code you change. It is measured by whether the new backend becomes safer, more observable, more reversible, and better proven without damaging production.
