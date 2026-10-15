# RQ Project Knowledge Base

**Last updated:** 2026-10-14
**Repository:** `tarekhamada875-droid/RQ-`  
**Production source of truth at review start:** `main` at `895e0cbaff25eeec8216d5b3f5fe5f436b1c3416`; the Hono Worker deploy and Production Gate both reported success for this revision.
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
- No Express runtime remains in `main`. Local development uses a small Node HTTP adapter to connect Vite to the existing Hono API; production builds contain the Pages frontend and Cloudflare Worker only. H9 retired the old API routes; PR #32 removed the remaining compatibility host and its unused legacy trace-persistence logic. The Cloud Run entrypoint was previously retired, and no Cloud Run deployment workflow is active.
- `public/icon.svg`, `public/manifest.json`, and `public/_headers` are active deployment assets.
- `wrangler.toml` is the production Worker deployment configuration.

## 3. Document hierarchy

For any future work, use this order:

1. **`PROJECT_WORKING_AGREEMENT.md`**: owner preferences for plain-language updates, autonomy, and explanations of each finished item.
2. **This file — `RQ_PROJECT_KNOWLEDGE_BASE.md`**: consolidated orientation, architecture, current status, and document authority.
3. **`AGENTS.md`**: mandatory repository safety, engineering, and release instructions.
4. **`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`**: active modernization roadmap; check each task's status before starting it.
5. **`RQ_HONO_SHORTENED_MIGRATION_PLAN.md`**: closed-workstream record only; it is not an active plan and does not authorize H9 continuation.
6. **`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`**: historical evidence only; its old operating sequence and succession protocol are inactive.
7. **`docs/H9_EXPRESS_DECOMMISSION_INVENTORY.md`** and **`docs/H9_SENSITIVE_ROUTE_DISPOSITION.md`**: historical route evidence only.
8. **`MAINTAINABILITY_HANDOFF.md`**, **`BRANCHING_AND_RELEASES.md`**, and **`docs/OBSERVABILITY_RUNBOOK.md`**: supporting repository/release/operations references.
9. H6 prompts/runbooks, the integrated acceptance task/report, dated handoffs, and `docs/CF0_*` through `docs/CF7_*`: historical evidence only; do not resume them as active tasks.
10. Capability-specific documents and dated audits: evidence only unless a new owner request explicitly assigns work from them.

No C7/C9/C10 or other non-Hono workstream is currently an active project plan. Historical milestone names in archived reports do not authorize a new workstream.

Superseded plans, duplicate acceptance tasks, and the old succession protocol were removed from the working tree on 2026-10-05. Their content remains recoverable from Git history if a specific fact must be audited.

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
- documentation cleanup and this consolidated knowledge base.

Baseline validation on `895e0cb` during the 2026-10-13 review included:

- 109 test files passed;
- 663 tests passed in the full local gate;
- TypeScript validation passed;
- production build passed;
- Cloudflare Worker build passed;
- Worker parity and authorization suites passed;
- `npm run ci:check` passed;
- maintainability check passed;
- `git diff --check` passed;
- the Production Gate and Worker deployment workflows reported success for `895e0cb`.

## 7. Workstream closure — 2026-10-12

**There is no active migration plan.** The 2026-10-12 H9 stop decision remains historical; on 2026-10-13 the owner explicitly requested removal of the final Express compatibility runtime. That bounded cleanup is complete in PR #32 and deployed from `main`; it did not revive the broader migration program.

H9 API retirement was verified on the migration branch: zero reachable legacy API registrations remained. The local Express compatibility runtime was retained at that time and later removed from `main` by PR #32. The older historical cross-runtime equivalence work is not being repeated; production readiness and live authenticated/financial acceptance are **not established**. This cleanup is not a general production launch approval.

No other Manus task/agent, ScheduleTask, or Trigger for H9 was found. The H9-related open documentation PR was closed, and the dedicated H5 Preview Worker was removed. PR #32 also removed the stale manually dispatchable Firebase preview deployment and H9 rehearsal workflow files. The general Production Gate and production deployment workflow remain enabled.

**Preview boundary:** no branch preview is an active test environment. Old isolated preview configuration and historical H6 rehearsal results are evidence only; do not assume they are deployed or reuse their old procedures.

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

## 9. Cleanup and documentation policy

The repository was cleaned on 2026-10-05. Superseded deployment plans, duplicate acceptance tasks, old audits, and the old succession protocol were removed from the working tree. Their history remains recoverable through Git.

Keep these as current orientation and operating documents:

- `AGENTS.md`
- `RQ_PROJECT_KNOWLEDGE_BASE.md`
- `RQ_HONO_SHORTENED_MIGRATION_PLAN.md`
- `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`
- `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md` (historical coverage catalog only; not an active task)
- `MAINTAINABILITY_HANDOFF.md`
- `BRANCHING_AND_RELEASES.md`
- `README.md`
- `CONTRIBUTING.md`
- `security_spec.md`
- `OPERATION_TRAIL_GUIDE.md`
- `docs/CF0_BASELINE_REPORT.md` through `docs/CF7_FINANCIAL_TRANSACTIONS_AND_REPORTING.md` as migration evidence
- `docs/OBSERVABILITY_RUNBOOK.md`

`docs/H6_*` and `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md` preserve H6 procedures/evidence. H6 is closed for scope; do not restart its old manual acceptance instructions. `docs/CF0_*` through `docs/CF7_*` and C7/C9/C10 references are migration/readiness history, not active plans. The H9 plan and handoff files remain historical records; the specific final Express-removal request was completed by PR #32.

The Cloud Run-specific `server/cloudRun.ts` entrypoint and `build:cloudrun` artifact were retired in H9 after an exact repository/workflow audit found no active Cloud Run deployment. Keep `wrangler.toml` and `wrangler.deploy.toml` because they are active Worker deployment contracts. PR #32 removed the generic Dockerfile and Express compatibility runtime.

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
2. Read this file, `AGENTS.md`, and the closed-workstream record before any separately authorized editing; do not treat it as an active plan.
3. Choose one bounded task; do not mix cleanup with business-logic changes.
4. Preserve server authority and existing UI/UX.
5. Use synthetic/in-memory data unless the owner explicitly authorizes a safe external workflow.
6. Run focused tests, then the full validation gate.
7. Do not push to `migration/unified-hono`, merge to `main`, or deploy for the closed H9 workstream. A future task must name its own authorized branch and scope.
8. The former `tokens ending` chained succession protocol is archived and inactive; do not create a successor for H9.

This file is an orientation and consolidation layer. The H9 plan and succession handoff are closed/history records; no migration workstream is active.
