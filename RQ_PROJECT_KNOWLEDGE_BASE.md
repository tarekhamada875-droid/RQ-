# RQ Project Knowledge Base

**Last updated:** 2026-09-29  
**Repository:** `tarekhamada875-droid/RQ-`  
**Current source of truth:** `main`  
**Current verified commit:** `5d24d1a913301224c2055aaec588cd3a1b1b2ef4`

## 1. What RQ is

RQ is a bilingual Arabic/English garage-management PWA for vehicle check-in/check-out, monthly subscribers, packages, balances, delegates, staff, supervisors, and admin operations.

The application is in **controlled synthetic pre-production**. There are currently no real users, customer records, or live financial data. Synthetic pre-production is not permission to touch unknown data, accept real revenue, perform destructive migrations, or claim final production readiness.

## 2. Production topology

```text
Cloudflare Pages frontend
        ↓ HTTPS API requests
Railway Express backend
        ↓ Firebase Admin SDK
Firebase Authentication + Firestore
```

- Frontend: React/Vite/Tailwind static PWA on Cloudflare Pages.
- Backend: Express/Node.js on Railway.
- Data/authentication: Firebase Auth and Firestore.
- Cloudflare serves the SPA only; Railway owns `/api/*`.
- `public/icon.svg`, `public/manifest.json`, and `public/_headers` are active deployment assets.
- Railway uses the existing API-only `server/cloudRun.ts` entrypoint name through `railway.json`.

## 3. Document hierarchy

Future agents must use this order:

1. **This file — `RQ_PROJECT_KNOWLEDGE_BASE.md`**: consolidated orientation, architecture, decisions, status, and file map.
2. **`AGENTS.md`**: mandatory safety, engineering, UI/UX, secret, and communication rules.
3. **`RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`**: active execution plan, checkpoint ledger, gates, rollback rules, and open blockers.
4. **`REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md`**: current authority/wiring map and cleanup evidence.
5. **`V3_BACKEND_PLAN.md`**: active functional-core architecture guide.
6. **`docs/SUCCESSION_PROTOCOL.md`**: mandatory procedure when the owner says the exact phrase `tokens ending`.
7. Capability-specific documents and dated audits: evidence only unless the canonical plan explicitly assigns work from them.

Older plans must not override this hierarchy.

## 4. Core architecture decisions

### Server authority

The backend is authoritative for:

- authentication and authorization;
- session creation, refresh, revocation, and timeout;
- vehicle check-in, checkout, correction, and deletion;
- subscribers and garage lifecycle mutations;
- balances, subscriptions, manual credits, financial ledgers, and idempotency;
- audit events, operational policy, and protected reporting.

The frontend may use Firestore reads/listeners for display synchronization when rules allow them. Display reads must never authorize a protected operation. Protected mutations must use the Railway API.

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

- 84 test files passed;
- 462 tests passed in the latest full local gate;
- TypeScript validation passed;
- production build passed;
- maintainability check passed;
- `git diff --check` passed;
- the Egypt crest cleanup Production Gate passed.

## 7. Current open work and blockers

The active launch decision remains C10 in the checkpoint plan. Do not declare final production readiness merely because the app loads.

C10 evidence still concerns:

- exact-commit CI and deployment evidence;
- authenticated smoke tests against a safe staging/pre-production boundary;
- Firebase billing/database identity decision;
- backup/restore evidence;
- rollback and incident contacts;
- financial and destructive-operation validation using only synthetic data;
- live observability without secrets or sensitive payloads.

C7 historical financial reconciliation remains deferred until the owner approves the accounting period and source-of-truth policy. Any reconciliation must start read-only and use synthetic/exported data.

## 8. Repository map

- `src/`: React frontend, services, API client, domain helpers, and tests.
- `src/api/apiClient.ts`: frontend HTTP boundary; attaches auth/session/correlation context.
- `src/services/`: frontend service contracts and display-read adapters.
- `src/domain/`: pure business decisions and policy helpers.
- `server/app.ts`: Express composition and remaining admin/system endpoints.
- `server/routes/`: authoritative route modules for vehicles, subscribers, delegates, garages, recharges, reports, and auth.
- `server/domain/`: pure backend decision modules.
- `server/cloudRun.ts`: Railway API-only process entrypoint with retained legacy filename.
- `tools/`: CI, maintainability, benchmark, and release-smoke tools.
- `.github/workflows/`: GitHub Production Gate.
- `railway.json`, `Dockerfile`: deployment contracts.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: Firebase configuration.

## 9. Cleanup and documentation policy

No additional confirmed orphan application asset or production module was found in the 2026-09-29 audit.

Keep these active:

- `AGENTS.md`
- `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`
- `REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md`
- `V3_BACKEND_PLAN.md`
- `docs/SUCCESSION_PROTOCOL.md`
- `RAILWAY_DEPLOYMENT_HANDOFF.md`
- `MAINTAINABILITY_HANDOFF.md`
- `BRANCHING_AND_RELEASES.md`

Keep these as historical evidence until unique information is migrated:

- `BUSINESS_LOGIC_AUDIT.md`
- `BUSINESS_LOGIC_FIX_CHECKPOINTS.md`
- `FINANCIAL_AUDIT_REPORT.md`
- `PRODUCTION_AUDIT_2026-09-25.md`
- `PRODUCTION_READINESS_CHECKLIST.md`
- `CODE_QUALITY_CHECKPOINTS.md`

The strongest future archive/delete candidates are:

- `RQ_PRODUCTION_READINESS_PLAN_2026-09-25.md`
- `PROJECT_CONTINUATION_BRIEF.md`

They are already labeled superseded or historical, but must not be deleted until their unique database, billing, staging, rollback, and handoff facts are confirmed as represented here or in the canonical plan.

Unreferenced metadata candidates also require external-consumer review before deletion:

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

For a deployment-related change, also use the documented Railway health and smoke checks. Never print secrets or commit credentials.

## 11. Direct operating rules for the next agent

1. Start by checking `git status --short --branch`, `git rev-parse HEAD`, and `git rev-parse origin/main`.
2. Read this file, `AGENTS.md`, and the canonical checkpoint plan before editing.
3. Choose one bounded task; do not mix cleanup with business-logic changes.
4. Preserve server authority and existing UI/UX.
5. Use synthetic/in-memory data unless the owner explicitly authorizes a safe external workflow.
6. Run focused tests, then the full validation gate.
7. Push directly to `main` according to the owner’s established preference.
8. If the owner says `tokens ending`, stop feature work immediately and follow `docs/SUCCESSION_PROTOCOL.md`; prepare the successor handoff before anything else.

This file is an orientation and consolidation layer. The canonical checkpoint plan remains the authoritative source for current task status and launch decisions.
