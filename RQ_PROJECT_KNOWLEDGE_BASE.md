# RQ Project Knowledge Base

**Last updated:** 2026-10-12
**Repository:** `tarekhamada875-droid/RQ-`  
**Production source of truth:** `main` at H8 merge `8be859d9ed99bd4009b0dd9d7ec0b7f2c2f2c9f0`; the Hono Worker is deployed.
**Workstream status:** The owner stopped H9 / Express decommissioning on 2026-10-12. Hono remains production; `server/app.ts` has zero reachable Express API registrations. The dormant vehicle, subscriber, and delegate routers were removed from `migration/unified-hono`; the local Express compatibility runtime and its remaining consumers are retained and frozen. No future H9 cleanup is authorized by this record. The migration branch remains an audit/history branch; `main` and production remain at H8.

## 1. What RQ is

RQ is a bilingual Arabic/English garage-management PWA for vehicle check-in/check-out, monthly subscribers, packages, balances, delegates, staff, and Admin operations. The Supervisor role has been retired by owner decision; existing legacy Supervisor records are preserved and do not represent active accounts.

The application is in **controlled synthetic pre-production**. There are currently no real users, customer records, or live financial data. Synthetic pre-production is not permission to touch unknown data, accept real revenue, perform destructive migrations, or claim final production readiness.

## 2. Production topology

```text
Cloudflare Pages frontend
        ↓ HTTPS API requests
Cloudflare Worker API (Hono)
        ↓ Firebase Admin SDK
Firebase Authentication + Firestore
```

- Frontend: React/Vite/Tailwind static PWA on Cloudflare Pages.
- Production backend: Hono/Fetch-native Cloudflare Worker named `rq`.
- Data/authentication: Firebase Auth and Firestore.
- Cloudflare Pages serves the SPA; the Worker owns the production `/api/*` routes.
- Production Worker URL: `https://rq.tarekhamada875.workers.dev`.
- Production Pages URL: `https://rq-acg.pages.dev`.
- Express remains transitional local runtime infrastructure for development, static serving, middleware characterization, and any remaining non-API test harnesses; it has **zero API registrations** and is not the production API path. H9 has retired the vehicle, subscriber, staff/people, delegate, Admin/system, Supervisor, session-lifecycle, PIN/admin-auth, financial/report, and multiple garage registrations. The unused Cloud Run-specific entrypoint was retired during H9; no Cloud Run deployment workflow is active.
- `public/icon.svg`, `public/manifest.json`, and `public/_headers` are active deployment assets.
- `wrangler.toml` is the production Worker deployment configuration.

## 3. Document hierarchy

For any separately owner-authorized future work, use this order:

1. **This file — `RQ_PROJECT_KNOWLEDGE_BASE.md`**: consolidated orientation, architecture, current status, and document map.
2. **`AGENTS.md`**: mandatory repository safety and engineering instructions.
3. **`RQ_HONO_SHORTENED_MIGRATION_PLAN.md`**: closed-workstream record only; it is not an active plan and does not authorize H9 continuation.
4. **`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`**: historical evidence only; its old operating sequence and succession protocol are inactive.
5. **`docs/H9_EXPRESS_DECOMMISSION_INVENTORY.md`** and **`docs/H9_SENSITIVE_ROUTE_DISPOSITION.md`**: historical route evidence only.
6. **`MAINTAINABILITY_HANDOFF.md`**, **`BRANCHING_AND_RELEASES.md`**, and **`docs/OBSERVABILITY_RUNBOOK.md`**: supporting repository/release/operations references.
7. H6 prompts/runbooks, the integrated acceptance task/report, dated handoffs, and `docs/CF0_*` through `docs/CF7_*`: historical evidence only; do not resume them as active tasks.
8. Capability-specific documents and dated audits: evidence only unless a new owner request explicitly assigns work from them.

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

Pure domain functions receive time, IDs, and state explicitly. They do not access Firestore, Express, environment variables, randomness, logging, or hidden mutable state.

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
- documentation cleanup and this consolidated knowledge base.

Recent validation evidence includes:

- 104 test files passed;
- 647 tests passed in the latest full local gate;
- TypeScript validation passed;
- production build passed;
- Cloudflare Worker build passed;
- Worker parity and authorization suites passed;
- `npm run ci:check` passed;
- maintainability check passed;
- `git diff --check` passed;
- the Egypt crest cleanup Production Gate passed.

## 7. Workstream closure — 2026-10-12

**There is no active migration plan.** At the owner's request, H9 / Express decommissioning is stopped. The existing plan file is now a closure record. Do not continue route/runtime parity, remove more Express compatibility code, create an H9 phase, or assign a successor unless the owner makes a new explicit request.

H9 API retirement was verified on the migration branch: zero reachable Express API registrations remain, and the dormant vehicle, subscriber, and delegate route files were removed. The local Express compatibility runtime remains **retained and frozen**. Full historical Express-vs-Hono response equivalence was not exhaustively re-proven; production readiness and live authenticated/financial acceptance are **not established**. This closure is not a production launch approval.

No other Manus task/agent, ScheduleTask, or Trigger for H9 was found. The H9-related open documentation PR was closed, and the dedicated H5 Preview Worker, Firebase Preview Firestore Config, and H9 rehearsal workflows were disabled. The general Production Gate and production deployment workflow remain enabled. `main` and production are unchanged.

**Preview boundary:** the currently deployed migration preview uses isolated Firebase project `rq-hono-preview-isolated`. Arbitrary branch previews must not be assumed isolated unless their source code selects the preview Firebase configuration. Historical rehearsal results and blocked or unverified H6 acceptance cells remain evidence only; do not resume their old procedures.

## 8. Repository map

- `src/`: React frontend, services, API client, domain helpers, and tests.
- `src/api/apiClient.ts`: frontend HTTP boundary; attaches auth/session/correlation context.
- `src/services/`: frontend service contracts and display-read adapters.
- `src/domain/`: pure business decisions and policy helpers.
- `server/cloudflareWorker.ts`: current production Hono Worker API and route authority.
- `server/app.ts`: historical/local compatibility composition with zero reachable Express API registrations; not the production API authority.
- `server/routes/`: remaining legacy artifacts and any retained compatibility/test consumers are frozen; vehicle, subscriber, and delegate routers were removed from the migration branch after confirming zero production imports/mounts and Hono/domain ownership.
- `server/domain/`: pure backend decision modules.
- `tools/`: CI, maintainability, benchmark, and release-smoke tools.
- `.github/workflows/`: GitHub Production Gate.
- `wrangler.toml`: active Worker deployment contract. `Dockerfile`: generic Node/container compatibility artifact; it is not an active Cloud Run deployment contract.
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

`docs/H6_*` and `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md` preserve H6 procedures/evidence. H6 is closed for scope; do not restart its old manual acceptance instructions. `docs/CF0_*` through `docs/CF7_*` and C7/C9/C10 references are migration/readiness history, not active plans. There is no active H9 or Express-removal plan; the plan and handoff files are closure/history records only.

The Cloud Run-specific `server/cloudRun.ts` entrypoint and `build:cloudrun` artifact were retired in H9 after an exact repository/workflow audit found no active Cloud Run deployment. Keep `wrangler.toml` and `wrangler.deploy.toml` because they are active Worker deployment contracts. The generic `Dockerfile` and Express compatibility runtime remain frozen; this closure does not authorize further removal.

Unreferenced metadata candidates still require external-consumer review before deletion:

- `firebase-blueprint.json`
- `metadata.json`

Never delete a file solely because a static import graph does not find it. External deployment tools, Vitest, Cloudflare, Firebase, and maintainability checks may consume files indirectly.

## 10. Standard validation gate

From `/home/ubuntu/RQ`:

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
