# RQ Project Knowledge Base

**Last updated:** 2026-10-15
**Repository:** `tarekhamada875-droid/RQ-`  
**Current deployed application code:** `c7d452c2bc5f354052d986dd58a9db804cc28749` (PR #40); its post-merge Production Gate, live smoke, and Cloudflare Worker deployment all succeeded. PR #40 is the latest application change; the exact Firebase rules publication is recorded below.
**Workstream status:** The owner stopped H9 / Express decommissioning on 2026-10-12, then explicitly authorized final Express-runtime removal on 2026-10-13. PR #32 removed the obsolete Express host, packages, middleware, and Node/Docker production artifact path. Hono remains the production backend; no Express runtime remains. The former `migration/unified-hono` branch was deleted after merge; do not recreate it as an active workstream.

## 1. What RQ is

RQ is a bilingual Arabic/English garage-management PWA for vehicle check-in/check-out, monthly subscribers, packages, balances, delegates, staff, and Admin operations. The Supervisor role has been retired by owner decision; existing legacy Supervisor records are preserved and do not represent active accounts.

The application was last confirmed by the owner on **2026-10-14** to be in controlled synthetic pre-production, with no real users, customer records, or live financial data. Reconfirm this before future work depends on it. Synthetic pre-production is not permission to touch unknown data, accept real revenue, perform destructive migrations, or claim final production readiness.

## 2. Production topology

```text
Cloudflare Pages frontend
        ↓ HTTPS API requests
Cloudflare Worker API (Hono)
        ↓ Worker-compatible Firebase Auth / Firestore REST adapter
Firebase Authentication + Firestore
```

- Frontend: React/Vite/Tailwind static PWA on Cloudflare Pages.
- Production backend: Hono/Fetch-native Cloudflare Worker named `rq`.
- Data/authentication: Firebase Auth and Firestore. The browser uses the Firebase client SDK for permitted display synchronization; the Worker uses a Worker-compatible REST adapter with protected credentials.
- Cloudflare Pages serves the SPA; the Worker owns the production `/api/*` routes.
- Production Worker URL: `https://rq.tarekhamada875.workers.dev`.
- Production Pages URL: `https://rq-acg.pages.dev`.
- No Express runtime remains in `main`. Local development uses a small Node HTTP adapter to connect Vite to the existing Hono API; production builds contain the Pages frontend and Cloudflare Worker only. PR #32 removed the former compatibility host and unused legacy trace-persistence logic. The Cloud Run entrypoint was retired, and no Cloud Run deployment workflow is active.
- `public/icon.svg`, `public/manifest.json`, and `public/_headers` are active deployment assets.
- `wrangler.toml` is the production Worker deployment configuration.

## 3. Document hierarchy

For future work, use this order:

1. **`AGENTS.md`** for mandatory safety, engineering, and release rules.
2. **`PROJECT_WORKING_AGREEMENT.md`** for owner communication and the “RQ handoff” continuity trigger.
3. **This file** for current architecture and project status.
4. **`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`** as the only active modernization roadmap; verify each task's status before starting.
5. **`MAINTAINABILITY_HANDOFF.md`** for verified implementation details and recent engineering milestones.
6. **`BRANCHING_AND_RELEASES.md`**, `README.md`, and `CONTRIBUTING.md` for the current development and release workflow.
7. `security_spec.md`, `OPERATION_TRAIL_GUIDE.md`, and `docs/duplication-contract-tests.md` for their specific current topics.

Retired migration, preview, and role-acceptance documents have been removed from the active tree. Their Git history remains available if a specific historical fact needs to be audited. Do not recreate closed workstreams from old commit history.

## 4. Core architecture decisions

### Server authority

The backend is authoritative for:

- authentication and authorization;
- session creation, refresh, revocation, and timeout;
- vehicle check-in, checkout, correction, and deletion;
- subscribers and garage lifecycle mutations;
- balances, subscriptions, manual credits, financial ledgers, and idempotency;
- audit events, operational policy, and protected reporting.

The frontend may use Firestore reads/listeners for display synchronization when rules allow them. Display reads must never authorize a protected operation. Protected mutations must use the Cloudflare Worker API in production.

### Functional programming direction

Do not create a parallel V3 backend. The existing `server/` backend remains the production authority. Improve it incrementally using:

```text
HTTP adapter → typed command → pure domain decision → Firestore transaction → event/idempotency persistence → HTTP response
```

Pure domain functions receive time, IDs, and state explicitly. They do not access Firestore, HTTP frameworks, environment variables, randomness, logging, or hidden mutable state.

### UI/UX contract

Preserve existing screens, visual design, navigation, and user flows by default. Wiring, API, loading, error, and authority repairs are allowed underneath the UI. Redesigns, feature removals, label changes, or workflow changes require explicit owner approval.

The owner-approved product direction includes the 24-hour session timeout, fixed 100 EGP delegate commission policy, 15-day referral eligibility/expiry behavior, rewards-screen removal, and related admin/dashboard changes.

## 5. Product and business decisions already recorded

- Current environment is synthetic pre-production; staging is deferred until real users, customer data, revenue, or destructive operations become relevant.
- The named Firestore database must not be casually changed. Database identity and billing are an owner-level decision.
- The 250 EGP monthly-subscriber flat fee is a **configurable fallback default**, not a permanent price. A persisted admin system setting overrides it.
- Delegate dashboard collection data uses the scoped server endpoint because Firestore list rules correctly deny the previous browser queries.
- The partner dividend calculator’s actual mode uses the current UTC-month authoritative financial report and is explicitly an estimate, not an accounting or settlement ledger.
- Financial behavior must remain server-authoritative, transactional, idempotent, and auditable.

## 6. Completed production-readiness work

The repository has completed and published repairs covering:

- server-authoritative session/API wiring across multiple frontend service paths;
- session timeout/revocation and heartbeat behavior;
- subscriber lifecycle route hardening;
- vehicle authorization and operational policy checks;
- manual-credit and recharge transaction protections;
- delegate dashboard scoped server read;
- admin partner calculator current-month report wiring;
- API client resilience, correlation IDs, operation traces, and health reporting;
- repository dependency/dead-code cleanup;
- removal of the obsolete `public/egypt_crest.svg` asset;
- alignment of the configurable monthly-subscriber fee fallback;
- restoration of Firestore-backed cross-instance PIN rate limiting after a review caught a memory-only regression;
- mandatory active server-session validation for Admin, Delegate, Garage, and Staff Worker routes, plus role-scoped session lookups (PR #35, deployed at `e53b2cb`);
- owner-scoped Firestore staff/garage rules and the actual-rules emulator matrix (PR #37, `2f3a61c`); after explicit owner approval, the exact `main:firestore.rules` source was published on 2026-10-14 to Firebase project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`. A fresh Console reload matched SHA-256 `8404b6a6cd833deaa4192e164a43cf2f2916e38840ce52fbce650feac4634d24` and showed no unpublished draft. No Firestore documents were changed; this applies only to that exact Firebase target;
- delete/refund idempotency protection (F1, PR #40, merged at `c7d452c`): retries are fingerprinted by garage, vehicle, semantic operation, and normalized amount; a mismatched key reuse now returns a clear conflict instead of being mistaken for success;
- the active JARVIS modernization roadmap, owner working agreement, and release documentation.

## 7. Workstream and environment boundaries

The Hono backend transition and owner-authorized Express-runtime removal are complete; no backend migration workstream is active. The JARVIS file named above is the sole active modernization roadmap. Branch previews are not a supported test environment; use local, unit, and emulator tests unless the owner explicitly authorizes a verified alternative. A successful code deployment is not, by itself, approval to launch to real users or operate on real financial/customer data.

## 8. Repository map

- `src/`: React frontend, services, API client, domain helpers, and tests.
- `src/api/apiClient.ts`: frontend HTTP boundary; attaches auth/session/correlation context.
- `src/services/`: frontend service contracts and display-read adapters.
- `src/domain/`: pure business decisions and policy helpers.
- `server/cloudflareWorker.ts`: current production Hono Worker API and route authority.
- `server.ts`: local-only Node HTTP + Vite host that forwards `/api/*` requests to Hono; there is no Node production server.
- `server/routes/`: remaining legacy artifacts and any retained compatibility/test consumers are frozen; vehicle, subscriber, and delegate routers were removed from the migration branch after confirming zero production imports/mounts and Hono/domain ownership.
- `server/domain/`: pure backend decision modules.
- `tools/`: CI, maintainability, benchmark, and release-smoke tools.
- `.github/workflows/`: GitHub Production Gate.
- `wrangler.toml`: active Worker deployment contract. The former generic Docker/Node production path is removed in this maintenance change.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: Firebase configuration.

## 9. Documentation and cleanup policy

Keep the operating guidance concise and current: the README, contributor/owner guides, this knowledge base, the single active JARVIS roadmap, the maintainer handoff, and the focused release/security/domain references listed above. Remove retired plans and temporary handoffs from the active tree when their work is closed; Git history is the archive. Do not keep a file merely because it once belonged to a completed migration.

Never delete a file solely because a static import graph does not find it. External deployment tools, Vitest, Cloudflare, Firebase, and maintainability checks may consume non-document files indirectly; audit those consumers before deleting application/configuration assets. Keep `wrangler.toml` and `wrangler.deploy.toml` as active Worker deployment contracts.

Unreferenced metadata candidates still require external-consumer review before deletion:

- `firebase-blueprint.json`
- `metadata.json`

Never delete a file solely because a static import graph does not find it. External deployment tools, Vitest, Cloudflare, Firebase, and maintainability checks may consume files indirectly.

## 10. Standard validation gate

From the repository root (the directory containing `package.json`):

```bash
npm ci
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

For a deployment-related change, also verify the Cloudflare Worker health/version endpoints and run the documented production smoke checks. Never print secrets or commit credentials.

## 11. Direct operating rules for a future owner-authorized task

1. Start by checking `git status --short --branch`, `git rev-parse HEAD`, and `git rev-parse origin/main`.
2. Read this file, `AGENTS.md`, and `PROJECT_WORKING_AGREEMENT.md` before substantial work; for a roadmap task, check the relevant status and acceptance criteria.
3. Choose one bounded task; do not mix cleanup with business-logic changes.
4. Preserve server authority and existing UI/UX.
5. Use synthetic/in-memory data unless the owner explicitly authorizes a safe external workflow.
6. Run focused tests, then the full validation gate.
7. Use a short-lived branch and reviewed PR for code changes; never bypass the current release gate.
8. Use the “RQ handoff” trigger in `PROJECT_WORKING_AGREEMENT.md` for factual continuity handoffs. It does not authorize deployment or data operations.

This file is the project orientation layer. The JARVIS roadmap is the only active modernization plan.
