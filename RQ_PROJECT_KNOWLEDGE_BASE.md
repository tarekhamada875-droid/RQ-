# RQ Project Knowledge Base

**Last updated:** 2026-10-08
**Repository:** `tarekhamada875-droid/RQ-`  
**Production source of truth:** `main` (do not modify for the Unified Hono migration task).
**Active migration branch:** `migration/unified-hono`; the latest workflow-verified code/test baseline was `ae8ab8099e11de07da5d2d87d9a1c863eb6983d1` on 2026-10-08, with H5 Preview Worker [37807079547](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079547) and Production Gate [37807079550](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079550) passing for that exact head. This commit adds opt-in read-only Playwright test infrastructure and documentation, not product behavior. The only post-30cccf runtime/config change remains preview-only `wrangler.preview.toml` CORS allowlisting at `40da805`; production configuration was not changed. A later docs-only synchronization may have a newer SHA; verify the actual branch/head before acting.

## 1. What RQ is

RQ is a bilingual Arabic/English garage-management PWA for vehicle check-in/check-out, monthly subscribers, packages, balances, delegates, staff, supervisors, and admin operations.

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
- Express remains transitional infrastructure for local development, Cloud Run compatibility, and existing integration tests; it is not the production API path.
- `public/icon.svg`, `public/manifest.json`, and `public/_headers` are active deployment assets.
- `wrangler.toml` is the production Worker deployment configuration.

## 3. Document hierarchy

Future agents must use this order:

1. **This file — `RQ_PROJECT_KNOWLEDGE_BASE.md`**: consolidated orientation, architecture, decisions, status, and file map.
2. **`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`**: operational continuation instructions and chained succession protocol.
3. **`AGENTS.md`**: mandatory safety, engineering, UI/UX, secret, and communication rules.
4. **`RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`**: active plan and gate decisions for the safe Hono consolidation experiment.
5. **`docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`**: controlling H6 execution process, safety boundaries, evidence, retry rules, cleanup, and H7 hold criteria.
6. **`RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md`**: role/feature coverage catalog and matrix; execute it only under the controlled H6 runbook.
7. **`MAINTAINABILITY_HANDOFF.md`** and **`BRANCHING_AND_RELEASES.md`**: active repository and release conventions.
8. **`docs/OBSERVABILITY_RUNBOOK.md`** and `docs/CF0_*` through `docs/CF7_*`: operational and Cloudflare migration evidence; use the current Cloudflare instructions and ignore retired provider procedures.
9. Capability-specific documents and dated audits: evidence only unless the active plan explicitly assigns work from them.

Older plans must not override this hierarchy.

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

- 96 test files passed;
- 547 tests passed in the latest full local gate;
- TypeScript validation passed;
- production build passed;
- Cloudflare Worker build passed;
- Worker parity and authorization suites passed;
- `npm run ci:check` passed;
- maintainability check passed;
- `git diff --check` passed;
- the Egypt crest cleanup Production Gate passed.

## 7. Current open work and blockers

The active launch decision remains C10 in the checkpoint plan. Do not declare final production readiness merely because the app loads.

The Cloudflare backend migration is live for the production Pages-to-Worker path. The next architectural workstream is the controlled unified Hono consolidation governed by `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`. Do not delete Express until the Hono preview, role acceptance, parity, rollback, and full quality gates are proven.

C10 evidence still concerns:

- exact-commit CI and deployment evidence;
- authenticated smoke tests against a safe staging/pre-production boundary;
- Firebase billing/database identity decision;
- backup/restore evidence;
- rollback and incident contacts;
- financial and destructive-operation validation using only synthetic data;
- live observability without secrets or sensitive payloads.

C7 historical financial reconciliation remains deferred until the owner approves the accounting period and source-of-truth policy. Any reconciliation must start read-only and use synthetic/exported data.

### Unified Hono H6 status — 2026-10-08

H6 remains **OPEN/BLOCKED**. The stable Pages preview is `https://migration-unified-hono.rq-acg.pages.dev`, and the isolated Worker is `https://rq-hono-preview.tarekhamada875.workers.dev`. A preview-only CORS allowlist correction was deployed; a recorded fresh non-production Pages/Worker pairing produced one bounded Admin login/dashboard/read-only-navigation/logout PASS. Reverify the exact deployment against the current candidate before further browser acceptance. Read-only Staff inspection found one synthetic `Mobile QA Staff` row with its PIN masked: Staff transport is **PARTIAL**, while Staff operational access remains **OPEN/BLOCKED**. The Supervisor global-versus-assigned garage-read policy, Owner listener delivery/cleanup evidence, and intentionally untested financial workflows also remain unresolved. An opt-in read-only Playwright smoke exists; it is not role-acceptance E2E, is not in default CI, and closes no H6 role cells. No production cutover is authorized; H7 has not started.

## 8. Repository map

- `src/`: React frontend, services, API client, domain helpers, and tests.
- `src/api/apiClient.ts`: frontend HTTP boundary; attaches auth/session/correlation context.
- `src/services/`: frontend service contracts and display-read adapters.
- `src/domain/`: pure business decisions and policy helpers.
- `server/cloudflareWorker.ts`: current production Hono Worker API and route authority.
- `server/app.ts`: transitional Express composition used by local development, Cloud Run compatibility, and existing integration tests.
- `server/routes/`: transitional Express route modules and characterization references; do not delete until the Hono consolidation is complete.
- `server/domain/`: pure backend decision modules.
- `server/cloudRun.ts`: retained Node/Cloud Run-compatible API-only process entrypoint.
- `tools/`: CI, maintainability, benchmark, and release-smoke tools.
- `.github/workflows/`: GitHub Production Gate.
- `wrangler.toml`, `Dockerfile`: deployment/runtime contracts; inspect before removing legacy compatibility files.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: Firebase configuration.

## 9. Cleanup and documentation policy

The repository was cleaned on 2026-10-05. Superseded deployment plans, duplicate acceptance tasks, old audits, and the old succession protocol were removed from the working tree. Their history remains recoverable through Git.

Keep these active:

- `AGENTS.md`
- `RQ_PROJECT_KNOWLEDGE_BASE.md`
- `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`
- `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`
- `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md`
- `MAINTAINABILITY_HANDOFF.md`
- `BRANCHING_AND_RELEASES.md`
- `README.md`
- `CONTRIBUTING.md`
- `security_spec.md`
- `OPERATION_TRAIL_GUIDE.md`
- `docs/CF0_BASELINE_REPORT.md` through `docs/CF7_FINANCIAL_TRANSACTIONS_AND_REPORTING.md` as migration evidence
- `docs/OBSERVABILITY_RUNBOOK.md`

Keep `Dockerfile` and `server/cloudRun.ts` only as transitional local/Cloud Run compatibility until the Hono consolidation checkpoint explicitly retires them. Keep `wrangler.toml` and `wrangler.deploy.toml` because they are active Worker deployment contracts.

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

## 11. Direct operating rules for the next agent

1. Start by checking `git status --short --branch`, `git rev-parse HEAD`, and `git rev-parse origin/main`.
2. Read this file, `AGENTS.md`, and the canonical checkpoint plan before editing.
3. Choose one bounded task; do not mix cleanup with business-logic changes.
4. Preserve server authority and existing UI/UX.
5. Use synthetic/in-memory data unless the owner explicitly authorizes a safe external workflow.
6. Run focused tests, then the full validation gate.
7. Push only to the branch explicitly authorized for the active task. For Unified Hono H6, that branch is `migration/unified-hono`; do not push, merge, or deploy to production `main` before H6/H7/H8 gates and explicit owner approval.
8. If the owner says `tokens ending`, stop feature work immediately and follow `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`; prepare the next chained successor handoff before anything else.

This file is an orientation and consolidation layer. The canonical checkpoint plan remains the authoritative source for current task status and launch decisions.
