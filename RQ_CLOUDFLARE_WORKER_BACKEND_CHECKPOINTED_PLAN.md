# RQ Cloudflare Worker Backend Migration — Checkpointed Execution Plan

**Document status:** Ready for the next implementation agent  
**Date:** 2026-10-02  
**Repository:** `tarekhamada875-droid/RQ-`  
**Target branch:** `main`  
**Owner direction:** Cloudflare Pages frontend + Cloudflare Worker backend API + Firebase Authentication and Firestore  
**Environment:** Controlled synthetic pre-production only; no real users, customer records, or live financial data

---

## 1. Mission

Move RQ from the current split topology:

```text
Cloudflare Pages frontend
        |
        v
Railway Express API
        |
        v
Firebase Authentication + Firestore
```

to the owner-approved Cloudflare topology:

```text
Cloudflare Pages frontend
        |
        | HTTPS API requests
        v
Dedicated Cloudflare Worker API
        |
        v
Firebase Authentication + Firestore
```

The migration must preserve:

- existing UI and UX;
- all current roles and user flows;
- server authority for protected operations;
- Firebase Authentication behavior;
- Firestore data and named-database identity;
- atomic financial and vehicle operations;
- session, multi-device, timeout, heartbeat, and revocation semantics;
- correlation IDs, operation IDs, idempotency, audit events, and safe errors;
- synthetic pre-production boundaries;
- a reversible deployment path.

This is a **backend runtime migration**, not a product redesign and not a database migration.

---

## 2. Mandatory reading and operating rules

Before changing code, the agent MUST read these files in this order:

1. `RQ_PROJECT_KNOWLEDGE_BASE.md`
2. `AGENTS.md`
3. `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`
4. `REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md`
5. `V3_BACKEND_PLAN.md`
6. `docs/SUCCESSION_PROTOCOL.md`
7. `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md`
8. This document

Rules:

- Use English in all agent communication and documentation added by the migration.
- Never print, paste, commit, or expose secrets.
- Never put Firebase service-account JSON, private keys, API tokens, or Cloudflare secrets in Git.
- Use synthetic data and controlled pre-production only.
- Do not change Firebase billing, the Firebase project ID, or the Firestore database ID without explicit owner approval.
- Preserve the current UI, visual design, navigation, labels, layouts, and user flows unless the owner separately approves a UI change.
- Do not create a second business-logic backend. The existing `server/` domain and route behavior remain the source of truth while the HTTP/runtime adapter changes.
- Do not remove the Railway fallback until Cloudflare Worker validation and rollback evidence are complete.
- Do not claim production readiness merely because a bundle compiles or the frontend loads.
- If the owner says exactly `tokens ending`, stop feature work and follow `docs/SUCCESSION_PROTOCOL.md` immediately.
- The owner prefers direct pushes to `main`; publish only verified checkpoint commits and keep each commit bounded.

---

## 3. Current known state at plan creation

The repository contains an initial Cloudflare attempt:

- `server/cloudflareWorker.ts` wraps Express using simulated Node request/response streams.
- `wrangler.toml` points to `server/cloudflareWorker.ts`.
- `package.json` has `build:cloudflare`.
- Hono was added as a dependency.
- Railway deployment files were removed from the latest commit.

The attempt is not yet a completed migration.

Known validation state:

- TypeScript validation: passed after dependencies were installed.
- Frontend build: passed.
- Node server build: passed.
- Cloudflare Worker bundle build: passed locally, but produced a large approximately 6.8 MB bundle.
- Automated tests: one failure because `src/__tests__/phase1FoundationAndRouting.test.ts` still expects the deleted `railway.json`.
- Maintainability check: fails because `tools/maintainability-check.ts` still requires Railway files.

Known live Cloudflare state:

- Pages project: `rq`.
- Pages domain: `https://rq-acg.pages.dev`.
- Pages build command: `npm run build:web`.
- Pages production environment still points `VITE_BACKEND_API_URL` to the old Railway URL.
- Cloudflare account currently shows no separately deployed Worker script for the new backend.
- Pages reports no active Pages Functions backend for this project.
- The Pages `/api/*` path currently falls through to SPA HTML rather than returning API JSON.
- The old Railway health endpoint currently returns HTTP 502.

Therefore the first implementation task is **not** to delete more Railway references. It is to build and prove the replacement API.

---

## 4. Target architecture

### 4.1 Deployment responsibilities

| Responsibility | Target service |
|---|---|
| React/Vite static frontend | Cloudflare Pages |
| PWA assets and service worker | Cloudflare Pages |
| HTTPS API routes | Dedicated Cloudflare Worker |
| Authentication identity | Firebase Authentication |
| Auth token verification | Worker-compatible Firebase verification implementation |
| Primary application data | Existing Firebase Firestore named database |
| Financial transactions | Worker API + Firestore transaction/batch semantics |
| API secrets | Cloudflare Worker secrets/secret bindings |
| API observability | Worker logs/traces plus existing safe operation metadata |
| DNS/API hostname | Cloudflare DNS/custom domain, if available and approved |

Recommended API hostname:

```text
https://api.rq-acg.com
```

If a custom domain is not available, use the generated Worker URL during pre-production. Do not hardcode a guessed hostname in the frontend.

### 4.2 Request flow

```text
Browser
  |
  | Firebase ID token + X-Session-ID + correlation metadata
  v
Cloudflare Pages frontend
  |
  | HTTPS fetch to VITE_BACKEND_API_URL
  v
Cloudflare Worker
  |
  | CORS, request IDs, timeout, auth, role/scope checks
  v
Worker-compatible route/domain adapter
  |
  | Firebase Auth verification and Firestore REST/gRPC-compatible access
  v
Firebase Authentication + Firestore
```

### 4.3 Source-code boundaries

Keep the current architecture conceptually intact:

```text
Worker Fetch adapter
        ↓
HTTP route adapter
        ↓
Typed command/input validation
        ↓
Pure domain decision
        ↓
Firestore transaction/batch adapter
        ↓
Audit/idempotency/event persistence
        ↓
Typed HTTP response
```

The agent may split Node-specific code from pure domain code, but must not duplicate business rules in a second backend.

---

## 5. Critical technical decision: Firebase access from Workers

The current `firebase-admin` Node SDK must not be assumed to work in Cloudflare Workers merely because `nodejs_compat` allows the bundle to compile.

Before migrating all routes, the agent must run a compatibility spike and choose one supported approach.

### Option A — Worker-compatible Firebase REST adapter: preferred investigation path

Use Firebase/Google HTTP APIs from the Worker:

- Verify Firebase Auth ID tokens using a Worker-compatible JWT verification path.
- Obtain Google OAuth access tokens using a service-account credential stored as a Cloudflare secret and Web Crypto signing, or use an approved token broker if necessary.
- Call the Firestore REST API for reads, writes, batch writes, and transactions where supported.
- Keep all credentials server-side in Worker secrets.

Benefits:

- Works with the Fetch runtime.
- Avoids importing the full Node `firebase-admin` package.
- Makes network calls explicit and testable.
- Avoids relying on Node filesystem and gRPC behavior.

Required security work:

- Never expose service-account credentials to the browser.
- Validate token issuer, audience, subject, expiration, and signature.
- Cache only public signing keys or short-lived access tokens safely.
- Do not log authorization headers, tokens, service-account payloads, or raw financial data.

### Option B — Worker-compatible Firebase library

The agent may use a maintained, reviewed Worker-compatible library if it supports the required Firebase Auth and Firestore operations. The library must be evaluated for:

- maintenance status;
- cryptographic correctness;
- Firestore transaction behavior;
- named-database support;
- bundle size;
- Cloudflare runtime compatibility;
- error and retry behavior;
- testability.

Do not add an unmaintained library merely to make imports compile.

### Option C — Temporary compatibility adapter

A narrow compatibility adapter may be retained only if the agent proves it works in the actual Worker runtime with synthetic data. It must not rely on:

- local filesystem access;
- process-only environment assumptions;
- Node gRPC modules unavailable in Workers;
- mutable global state for authorization or financial correctness;
- fake request/response behavior that has not passed runtime tests.

If the Express wrapper fails the runtime spike, replace it rather than layering more shims around it.

### Firebase decision gate

Do not proceed to route migration until a written decision records:

- selected Firebase access method;
- exact Firebase project and named database identity;
- required Worker secrets by name only, never by value;
- token verification method;
- transaction/batch support;
- retry/idempotency behavior;
- local test strategy;
- rollback strategy.

---

## 6. Checkpoint ledger

Each checkpoint must be completed, tested, documented, committed, and pushed before the next checkpoint begins.

### CF0 — Baseline and migration freeze

**Goal:** Establish the exact starting point.

Tasks:

- Confirm `git status --short --branch` is clean or document existing changes.
- Record `HEAD`, `origin/main`, and the latest Cloudflare Pages deployment commit.
- Read all mandatory documents.
- Inventory every API route in `server/app.ts` and `server/routes/`.
- Inventory every frontend API origin and environment variable.
- Record current test/build/maintainability failures without hiding them.
- Freeze unrelated cleanup, redesign, and business-rule changes.

Exit criteria:

- Baseline report committed to the migration documentation.
- Route inventory exists.
- Current failures are classified as pre-existing, migration-caused, or unknown.

Rollback:

- No runtime change. Revert only the documentation checkpoint if needed.

---

### CF1 — Cloudflare account and deployment contract

**Goal:** Define where the Worker will run before changing application behavior.

Tasks:

- Confirm the authorized Cloudflare account through the configured connector.
- Confirm the Pages project and production branch.
- Create or identify the dedicated Worker name.
- Define the pre-production Worker URL.
- Define an API custom domain only if it is available and owner-approved.
- Add a minimal `wrangler.toml` or equivalent deployment config.
- Configure compatibility date and `nodejs_compat` only when needed; do not treat it as proof of Node compatibility.
- Configure Worker environment names for synthetic pre-production.
- Configure secrets through Cloudflare’s secret mechanism, not source files.
- Configure separate production and pre-production values where possible.

Required secret names may include, depending on the chosen Firebase adapter:

```text
FIREBASE_PROJECT_ID
FIREBASE_DATABASE_ID
FIREBASE_SERVICE_ACCOUNT_JSON
FIREBASE_WEB_API_KEY
ALLOWED_ORIGINS
```

The plan must record names, not values.

Exit criteria:

- A minimal Worker can deploy.
- `GET /api/health` returns JSON from the actual Worker URL.
- `GET /api/version` returns a safe version identifier.
- No secret appears in logs, source, build artifacts, or Git history.

Rollback:

- Keep Pages pointed at the existing configured origin until CF8.
- Delete or disable only the test Worker deployment if necessary; do not delete Firebase data.

---

### CF2 — Worker runtime compatibility spike

**Goal:** Prove the runtime before migrating business routes.

Implement and test only these endpoints:

```text
GET /api/health
GET /api/version
POST /api/test-auth-verify     # pre-production only, protected/temporary
GET /api/test-firestore-read   # pre-production only, synthetic document only
POST /api/test-firestore-write # pre-production only, synthetic namespace only
```

The test endpoints must be disabled or removed before production.

Verify:

- Fetch request handling;
- CORS;
- request body parsing;
- Firebase ID token verification;
- Firestore read;
- Firestore write;
- named Firestore database selection;
- timeouts;
- safe error envelopes;
- correlation and request IDs;
- Worker cold start and repeated requests;
- concurrent synthetic requests;
- no sensitive logging.

Exit criteria:

- Actual deployed Worker passes the runtime spike using synthetic data.
- Firebase access method is documented.
- The Worker remains within size and runtime limits.
- No route depends on a Node-only API that only bundles but fails at runtime.

Rollback:

- Leave the old frontend API origin unchanged.
- Delete test documents only from the explicitly designated synthetic namespace.

---

### CF3 — Worker HTTP foundation

**Goal:** Recreate the existing API boundary without changing business behavior.

Implement shared Worker middleware for:

- CORS with an explicit allowlist, not `origin: '*'` for authenticated operations;
- `OPTIONS` handling;
- JSON request parsing;
- maximum body size;
- request timeout handling;
- correlation ID generation/propagation;
- operation ID propagation;
- idempotency-key validation;
- standardized success/error envelopes;
- safe error mapping;
- request method/path logging without sensitive payloads;
- rate-limit hooks;
- health/version endpoints.

Preserve current headers and semantics where they are part of the frontend contract:

- Firebase `Authorization` header;
- `X-Session-ID`;
- `X-Correlation-ID`;
- `X-Operation-ID`;
- `Idempotency-Key`;
- `X-Backend-Operator-Token` where applicable.

Exit criteria:

- API client contract tests pass against the Worker adapter.
- CORS tests pass for allowed and rejected origins.
- HTML or malformed responses are still classified safely by the frontend.
- No wildcard CORS is used for credential-bearing or protected routes.

Rollback:

- Worker remains on a non-production URL and is not selected by Pages.

---

### CF4 — Authentication and session authority

**Goal:** Move authentication and session behavior without weakening security.

Migrate and verify:

- Firebase ID-token verification;
- admin PIN verification;
- role extraction;
- entity/garage scope extraction;
- session claim;
- session refresh;
- heartbeat;
- multi-device behavior;
- stale session rejection;
- 24-hour inactivity policy;
- logout/release;
- unauthorized release prevention;
- fail-closed behavior during Worker/Firebase outages;
- rate limiting for PIN operations.

The Worker must not trust client-supplied role or entity IDs. It must derive identity from the verified token and server session state.

Required tests:

- same account on two devices;
- same session refresh;
- stale session;
- revoked session;
- unauthorized entity release;
- Worker outage;
- malformed/expired token;
- wrong PIN;
- repeated wrong PIN attempts;
- cross-tenant/session isolation.

Exit criteria:

- Existing session integration tests pass or are ported to the Worker adapter.
- Browser session service uses the Worker API origin only in a controlled test environment.
- No browser Firestore fallback writes remain for protected session authority.

Rollback:

- Keep the existing backend origin available.
- Switch only the API environment variable back to the previous origin.

---

### CF5 — Read-only and low-risk route migration

**Goal:** Move safe routes first and prove request/response compatibility.

Migrate in this order:

1. `/api/health`
2. `/api/version`
3. `/api/system-config`
4. scoped delegate dashboard read
5. package/catalog reads
6. admin report reads
7. role/profile reads
8. vehicle/subscriber display reads that currently use API routes

For every route, compare the old and new responses using synthetic fixtures:

- status code;
- JSON envelope;
- field names;
- dates and timestamps;
- null/empty behavior;
- authorization behavior;
- error codes;
- correlation IDs.

Do not change UI components merely to accommodate an avoidable contract difference.

Exit criteria:

- Contract tests pass.
- No sensitive fields are added to responses.
- Dates are serialized and parsed consistently through existing safe-date conventions.
- Frontend API tests pass with the Worker origin.

Rollback:

- Keep route-level feature flags or environment-based origin switching until CF8.

---

### CF6 — Protected mutation migration

**Goal:** Move business-critical writes while preserving transaction semantics.

Migrate by capability, not by one giant rewrite:

1. vehicle check-in;
2. vehicle checkout;
3. vehicle correction/deletion;
4. subscriber add/update/renew/delete;
5. garage create/update/delete/maintenance;
6. recharge and manual credit;
7. package/subscription operations;
8. delegate and staff operations;
9. system settings;
10. reports and administrative operations.

For every mutation:

- validate all input at the Worker boundary;
- derive actor and scope server-side;
- perform pure domain decisions before persistence;
- use Firestore transactions/batches where required;
- preserve idempotency keys and fingerprints;
- preserve event/audit writes;
- preserve atomic rollback behavior;
- preserve financial amount semantics;
- preserve existing error codes and conflict status codes;
- never trust a client-provided balance, commission, role, garage, or ownership field;
- never perform protected browser Firestore writes as a fallback.

Required financial invariants:

- one approved recharge cannot be applied twice;
- changed idempotency payloads are rejected;
- concurrent approvals allow only one valid state transition;
- ledger, balance, event, request, and idempotency records remain consistent;
- failures do not leave partial money mutations;
- configurable settings remain configurable;
- partner calculator remains an estimate, not an accounting ledger;
- deferred C7 reconciliation remains deferred.

Exit criteria:

- All capability integration tests pass through the Worker adapter.
- Synthetic concurrency tests pass.
- No financial or destructive operation has been tested against unknown or real data.

Rollback:

- Route-level origin switch to the old backend.
- Do not dual-write financial operations unless a separately reviewed idempotent migration design exists.

---

### CF7 — Frontend origin switch in controlled pre-production

**Goal:** Connect Cloudflare Pages to the Worker without changing the UI.

Tasks:

- Set the pre-production Pages `VITE_BACKEND_API_URL` to the Worker URL.
- Keep the production Pages variable unchanged until CF9.
- Ensure the frontend does not use the Pages `/api/*` SPA fallback as an API.
- Verify all API calls use the shared `src/api/apiClient.ts` boundary.
- Confirm Firebase Auth token and session headers reach the Worker.
- Confirm no API route accidentally uses the old Railway origin.
- Confirm service worker caching does not cache protected API responses.
- Verify PWA behavior after changing the API origin.

Exit criteria:

- Browser login works.
- Logout works.
- Admin works.
- Delegate works.
- Garage owner works.
- Staff works.
- Supervisor works.
- Multi-device session behavior works.
- Loading, empty, error, expired-session, and unauthorized states remain visually and behaviorally correct.
- No UI redesign or route removal occurred.

Rollback:

- Restore the pre-production Pages API environment variable to the known working origin.
- Redeploy Pages.

---

### CF8 — Integrated role-based acceptance

**Goal:** Test the actual product as a human user while checking the technical contract at each step.

Use the single primary document:

```text
RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md
```

Test with synthetic accounts/data for:

- Admin;
- Delegate;
- Garage owner;
- Staff member;
- Supervisor;
- multiple devices;
- unauthorized cross-tenant/cross-garage attempts.

At every user action record:

- visible result;
- API request status;
- API response/error code;
- Firestore state change where authorized to inspect;
- audit/event result;
- session state;
- whether the UI preserved its existing behavior.

The agent must document every failure in a defect ledger containing:

| Field | Required content |
|---|---|
| Defect ID | Stable identifier |
| Role | Affected role |
| Exact steps | Reproducible user steps |
| Expected | Intended result |
| Actual | Observed result |
| Technical evidence | URL/status/code/log correlation ID |
| Severity | Blocker/high/medium/low |
| Data impact | None/synthetic/unknown |
| Fix commit | Commit SHA if repaired |
| Retest | Pass/fail and date |

Exit criteria:

- No unresolved blocker or high-severity defect.
- All five roles complete their allowed workflows.
- Negative authorization tests are denied correctly.
- Financial and destructive operations are tested only with synthetic data.

Rollback:

- Repoint Pages to the previous API origin.

---

### CF9 — Observability, performance, and security gate

**Goal:** Prove the Worker is operationally safe.

Verify:

- health endpoint;
- version endpoint;
- deployment commit metadata;
- Worker logs without tokens or sensitive payloads;
- correlation ID from browser to Worker to Firebase operation logs;
- safe error metadata;
- rate-limit behavior;
- request timeout behavior;
- API latency for representative routes;
- bundle size and Worker limits;
- cold-start behavior;
- repeated/concurrent requests;
- CORS allowlist;
- secret bindings;
- no source-map or bundle secret leakage;
- no Firebase service account in frontend assets;
- no API response exposes PIN hashes, credentials, or internal secrets;
- no unbounded retries or request loops;
- no browser-authoritative protected writes.

Run secret scans against:

- Git history for newly added files;
- `dist/`;
- Worker bundle;
- Pages build artifacts;
- logs produced during synthetic tests.

Exit criteria:

- Security review has no blocker.
- Observability runbook reflects Worker deployment.
- Existing Railway-specific release smoke logic is replaced or intentionally retained as rollback tooling, not left as a misleading required gate.

---

### CF10 — Production cutover decision and rollback rehearsal

**Goal:** Decide whether RQ may use the Worker as its production API.

Before cutover, confirm:

- all previous checkpoints C0–C9 remain valid;
- exact GitHub commit is known;
- Cloudflare Pages deployment commit is known;
- Worker deployment version is known;
- Firebase project and named database are correct;
- backup/restore evidence exists;
- rollback owner and contact path are known;
- synthetic acceptance passed;
- no real users or financial data are affected by the rehearsal;
- old backend remains available for immediate rollback;
- API origin switch procedure has been rehearsed.

Cutover sequence:

1. Deploy Worker.
2. Verify Worker health and version.
3. Deploy Pages with the Worker API origin.
4. Verify public frontend loads.
5. Run read-only smoke tests.
6. Run authenticated synthetic smoke tests.
7. Verify logs and correlation IDs.
8. Announce the exact deployed commit internally.
9. Keep the previous backend available during the observation window.

Rollback sequence:

1. Restore Pages API origin to the previous known backend.
2. Redeploy Pages.
3. Verify health and authenticated synthetic workflows.
4. Preserve Worker logs and defect evidence.
5. Do not delete Firebase data or perform emergency data rewrites without approval.
6. Record the rollback reason and exact commits.

Production is not approved if any required step is skipped.

---

## 7. Repository changes expected from the migration

The next agent may add or modify:

```text
server/worker/
server/worker/routes/
server/worker/auth/
server/worker/firestore/
src/api/apiClient.ts
wrangler.toml
package.json
package-lock.json
.github/workflows/
tools/release-smoke.ts
tools/maintainability-check.ts
docs/OBSERVABILITY_RUNBOOK.md
RQ_PROJECT_KNOWLEDGE_BASE.md
RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md
REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md
```

The agent should prefer new focused Worker modules over putting more logic into one oversized adapter file.

Maintainability requirements:

- keep components under approximately 350 lines where practical;
- keep route modules focused;
- keep pure domain logic infrastructure-free;
- avoid a 6+ MB Worker bundle if route splitting or dependency replacement can reduce it;
- avoid duplicate auth or financial business rules;
- add tests beside each new adapter/domain boundary.

Do not delete files just because they are not found by a static import graph. Cloudflare, Firebase, CI, Vitest, and deployment tools may consume files indirectly.

---

## 8. Required test matrix

### Static and unit gates

```bash
npm ci
npm test -- --run
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

The migration is not green while any one of these fails unless the failure is intentionally updated, explained, tested, and committed as part of the migration.

### Worker-local gates

Use the Cloudflare local runtime where available:

```bash
npx wrangler dev
npx wrangler deploy --dry-run
```

Test:

- health/version;
- malformed JSON;
- oversized body;
- CORS;
- auth failures;
- valid auth;
- expired token;
- scope denial;
- timeout;
- Firestore errors;
- idempotency replay/conflict;
- concurrent synthetic writes.

### Deployed Worker gates

Run against the actual pre-production Worker URL:

```bash
curl -i "$WORKER_URL/api/health"
curl -i "$WORKER_URL/api/version"
```

Do not put the URL or test credentials in a committed script if they are environment-specific.

### Browser gates

Use the integrated role-based task against the actual Pages deployment configured for the Worker. Record evidence for each role and workflow.

---

## 9. Frontend configuration rules

The frontend must use one explicit API origin source:

```text
VITE_BACKEND_API_URL
```

Rules:

- In local development, use a local Worker or an explicitly configured synthetic API.
- In pre-production, use the deployed pre-production Worker URL.
- In production, use the approved Worker custom domain or stable Worker URL.
- Never silently fall back from an unavailable Worker to browser Firestore writes.
- Never use the Pages origin for `/api/*` unless Pages is explicitly configured to proxy the Worker.
- Remove the Railway fallback only after the Worker cutover and rollback rehearsal are complete.
- Update `src/api/apiClient.test.ts` so it tests the intended Cloudflare origin contract.
- Update release smoke tests to check JSON API health from the actual Worker.

---

## 10. Documentation updates required before closing

After each relevant checkpoint, update:

1. `RQ_PROJECT_KNOWLEDGE_BASE.md`
   - target topology;
   - Firebase adapter decision;
   - Worker URL contract;
   - secret names only;
   - current validation evidence;
   - rollback status.

2. `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`
   - C8/C9/C10 evidence;
   - migration checkpoint status;
   - unresolved risks;
   - exact commit and deployment IDs.

3. `REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md`
   - frontend API origin;
   - Worker route map;
   - removal or retention of old Railway references;
   - confirmation that browser protected writes remain absent.

4. `docs/OBSERVABILITY_RUNBOOK.md`
   - Worker health checks;
   - logs and correlation IDs;
   - rollback steps;
   - incident evidence collection.

5. `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md`
   - Worker-specific setup;
   - defect ledger location;
   - deployed environment URLs by environment, without secrets.

Do not delete historical documents until their unique facts have been migrated and the canonical knowledge base records the disposition.

---

## 11. Agent handoff instruction

Give the next agent this exact operating brief:

> You are migrating RQ from Railway Express to a dedicated Cloudflare Worker API. The target is Cloudflare Pages frontend + Cloudflare Worker backend + Firebase Authentication and Firestore. Read `RQ_PROJECT_KNOWLEDGE_BASE.md`, `AGENTS.md`, `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`, `REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md`, `V3_BACKEND_PLAN.md`, `docs/SUCCESSION_PROTOCOL.md`, the integrated acceptance task, and this plan before editing. Start with CF0. Do not assume that a local esbuild proves Worker compatibility. Prove Firebase Auth and Firestore access in the actual Cloudflare runtime before migrating routes. Preserve all UI/UX and business semantics. Do not expose secrets, touch unknown data, change Firebase billing/database identity, or delete the old backend before rollback evidence exists. Work one checkpoint at a time. Run focused tests and the complete validation gate. Push only verified checkpoint commits directly to `main`. Return the checkpoint, commit SHA, changed files, tests, deployed URLs, evidence, remaining risks, and rollback commit/origin procedure.

---

## 12. Definition of done

The migration is complete only when all statements below are true:

- Cloudflare Pages serves the unchanged RQ frontend.
- The frontend calls the Cloudflare Worker API, not Railway.
- The Worker returns JSON for health/version and all required API routes.
- Firebase ID tokens are verified securely in the Worker runtime.
- Firestore reads and writes use the correct existing project and named database.
- Protected writes are server-authoritative.
- Financial operations remain atomic, idempotent, auditable, and synthetic-tested.
- Sessions, 24-hour timeout, heartbeat, revocation, multi-device behavior, and logout work.
- Admin, delegate, garage owner, staff, and supervisor workflows pass the integrated acceptance test.
- CORS, rate limiting, request limits, safe errors, and observability are verified.
- No secrets appear in source, artifacts, logs, or Git history.
- `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check` pass.
- Cloudflare deployment evidence identifies the exact Pages and Worker versions.
- Rollback to the previous API origin has been rehearsed.
- The canonical knowledge base and checkpoint ledger are updated.
- C10 is explicitly revalidated; no agent may declare production readiness by assumption.
