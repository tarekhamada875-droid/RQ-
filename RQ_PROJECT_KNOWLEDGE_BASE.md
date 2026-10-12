# RQ Project Knowledge Base

**Last updated:** 2026-10-12
**Repository:** `tarekhamada875-droid/RQ-`  
**Production source of truth:** `main` at H8 merge `8be859d9ed99bd4009b0dd9d7ec0b7f2c2f2c9f0`; the Hono Worker is deployed.
**Active workstream:** H9 on `migration/unified-hono`; the latest source batch `256335e` removes the final six Express PIN/admin-auth registrations and obsolete direct Express consumers after Hono authentication, rate-limit, authorization, and session-claim coverage was verified. Focused validation passed **5 files / 70 tests** and the full integration gate passed **100 files / 637 tests**, lint, Vite/Node/Cloudflare builds, CI/release/artifact verification, maintainability, and whitespace; generated build outputs were cleaned. All 11 Express auth/session registrations are retired; the active Express registration count is now **8**. Hono remains the supported production/API owner; `main` remains on the H8 baseline and no production operation occurred. Remaining Express runtime/route consumers are retained only where the inventory documents a concrete compatibility, characterization, financial, reporting, or local Node/Vite/static-serving reason.

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
- Express remains transitional infrastructure for local compatibility, 8 remaining API registrations, and existing integration/characterization tests; it is not the production API path. H9 has retired the proven vehicle, subscriber, staff/people, delegate, Admin/system, Supervisor, session-lifecycle, PIN/admin-auth, and multiple garage registrations, while the remaining runtime is blocked by documented financial, reporting/middleware, and local Node/Vite/static-serving dependencies. The unused Cloud Run-specific entrypoint was retired during H9; no Cloud Run deployment workflow is active.
- `public/icon.svg`, `public/manifest.json`, and `public/_headers` are active deployment assets.
- `wrangler.toml` is the production Worker deployment configuration.

## 3. Document hierarchy

Future agents must use this order:

1. **This file — `RQ_PROJECT_KNOWLEDGE_BASE.md`**: consolidated orientation, architecture, current status, and document map.
2. **`AGENTS.md`**: mandatory repository safety and engineering instructions.
3. **`RQ_HONO_SHORTENED_MIGRATION_PLAN.md`**: the **only active project plan** and authority for milestone status and gates.
4. **`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`**: current H9 operating sequence and chained succession protocol; it is a handoff, not a second plan.
5. **`docs/H9_EXPRESS_DECOMMISSION_INVENTORY.md`** and **`docs/H9_SENSITIVE_ROUTE_DISPOSITION.md`**: route evidence/status only, not alternate plans.
6. **`MAINTAINABILITY_HANDOFF.md`**, **`BRANCHING_AND_RELEASES.md`**, and **`docs/OBSERVABILITY_RUNBOOK.md`**: supporting repository/release/operations references.
7. H6 prompts/runbooks, the integrated acceptance task/report, dated handoffs, and `docs/CF0_*` through `docs/CF7_*`: historical evidence only; do not resume them as active tasks.
8. Capability-specific documents and dated audits: evidence only unless the active Hono plan explicitly assigns work from them.

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

## 7. Current work and blockers — 2026-10-12

**The one active project plan is `RQ_HONO_SHORTENED_MIGRATION_PLAN.md`.** The current checkpoint is H9; Hono is already in production from H8. There is no active C7/C9/C10 plan in this repository: those references below and in dated Cloudflare reports are historical milestone/evidence references, not instructions to start a separate workstream.

H9 is **IN PROGRESS** on `migration/unified-hono`; financial ledger parity head `2646256` passed the full local gate (**104 files / 655 tests**), TypeScript lint, production builds/artifact checks, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`. Express and Hono now both write `manual_credit_ledger` records for approved balance-top-up requests and direct admin wallet top-ups, with focused idempotency/atomicity and Worker regression coverage. Express also emits normalized operation IDs on success, errors, and 404 responses, matching Hono. Earlier auth/session parity remains covered by the same candidate history. The broader H9 source/runtime decommission remains blocked by vehicle/staff, reporting, and local Node/Vite/static-serving parity gaps; financial writes remain prohibited outside synthetic/in-memory tests. No production or `main` change was made.

The owner accepted H6 residual risks for scope purposes and H7 received GO. Staff operational access, Owner listener/cleanup evidence, and financial flows remain OPEN/BLOCKED, OPEN/UNVERIFIED, or intentionally untested; they are not PASS results. Supervisor is retired and legacy records are preserved.

**Preview boundary:** preview targets isolated Firebase project `rq-hono-preview-isolated`; production remains separate and unchanged. The prior authenticated garage-create rehearsal returned 429 twice and was not retried; read-only diagnostics attributed it to an exhausted synthetic per-actor limiter. The one-pass census is complete, and Express `POST /api/garages/rebuild-projections` is now retired; Hono retains the route and synthetic contract tests. Its manual-only rehearsal tooling remains **not dispatched**; no projection rehearsal read/write occurred. Separately, push run [38228265018](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38228265018) auto-triggered the already-retired dashboard-summary route rehearsal: it reported expected isolated synthetic projection checks and `rollback: PASS`. The legacy workflow's push trigger is now manual-only in this follow-up; future data operations remain outside the closeout gate.

Express remains a compatibility runtime with 50 API registrations and 28 direct Express-import files after the projection-route retirement. Source commit `45afc439` adds Admin-only Hono `POST /api/auth/invalidate-all-sessions`, with synthetic coverage for root/device invalidation across roles, marker clearing, account-data preservation, and auth denials. Its full local gate passed **104 files / 648 tests** plus builds, CI/release, maintainability, and whitespace. Workflow fix commit `84ee5bd` uses Wrangler's versioned-secret API after Cloudflare rejected ordinary secret editing on an unpublished Worker version; exact-head Production Gate and H5 Preview Worker both passed, and the isolated candidate deployed successfully. The new route's unauthenticated preview call returned 401; no authenticated invalidation, rehearsal, or production operation occurred. Other session/auth, financial, reporting/middleware, vehicle/staff, and local Node/Vite/static-serving blockers still prevent broader source/runtime retirement. Follow the single active migration plan and latest succession handoff. Keep `main` and production unchanged.

## 8. Repository map

- `src/`: React frontend, services, API client, domain helpers, and tests.
- `src/api/apiClient.ts`: frontend HTTP boundary; attaches auth/session/correlation context.
- `src/services/`: frontend service contracts and display-read adapters.
- `src/domain/`: pure business decisions and policy helpers.
- `server/cloudflareWorker.ts`: current production Hono Worker API and route authority.
- `server/app.ts`: transitional Express composition used by the explicit local compatibility command and existing integration tests.
- `server/routes/`: transitional Express route modules and characterization references; the read-only delegate dashboard handler was retired in H9 after Hono replacement coverage passed; do not delete remaining modules until their route-specific disposition is complete.
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

`docs/H6_*` and `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md` preserve H6 procedures/evidence. H6 is closed for scope; do not restart its old manual acceptance instructions. `docs/CF0_*` through `docs/CF7_*` and C7/C9/C10 references are migration/readiness history, not active plans. The only active project plan is `RQ_HONO_SHORTENED_MIGRATION_PLAN.md`; current H9 continuation instructions are in `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`.

The Cloud Run-specific `server/cloudRun.ts` entrypoint and `build:cloudrun` artifact were retired in H9 after an exact repository/workflow audit found no active Cloud Run deployment. Keep `wrangler.toml` and `wrangler.deploy.toml` because they are active Worker deployment contracts. Keep the generic `Dockerfile` only while the Express compatibility runtime remains useful for local/container tests.

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
7. Push only to the branch explicitly authorized for the active task. For current H9 work, use `migration/unified-hono`; do not merge or deploy to production `main` as part of H9.
8. If the owner says `tokens ending`, stop feature work immediately and follow `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`; prepare the next chained successor handoff before anything else.

This file is an orientation and consolidation layer. The canonical Hono checkpoint plan remains the authoritative project plan and source for current milestone status; the succession handoff supplies the current operational sequence.
