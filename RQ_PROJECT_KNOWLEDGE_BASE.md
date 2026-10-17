# RQ Project Knowledge Base

**Last updated:** 2026-10-17
**Repository:** `tarekhamada875-droid/RQ-`  
**Current deployed application code:** `d5a42ba` (PR #77 / WKR-02 subscriber-summary correction). PR #76 also corrected financial-report filtering to use the ISO-string `occurredAt` type stored by domain events. Production Gate [#38932269879](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38932269879) and Cloudflare Worker deployment [#38932269971](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38932269971) succeeded for PR #77; PR #76’s corresponding runs [#38931224079](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38931224079) and [#38931224073](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38931224073) also succeeded. Live Pages, Worker `/api/health`, and `/api/version` returned HTTP 200 after deployment on 2026-10-16; Worker version was `1.0.0-production`.

**Workstream status:** The owner stopped H9 / Express decommissioning on 2026-10-12, then explicitly authorized final Express-runtime removal on 2026-10-13. PR #32 removed the obsolete Express host, packages, middleware, and Node/Docker production artifact path. Hono remains the production backend; no Express runtime remains. The former `migration/unified-hono` branch was deleted after merge; do not recreate it as an active workstream.

**Current JARVIS continuation point (verified 2026-10-17):** Phase 1 and completed roadmap work through **FS-03**, plus the post-review WKR-02 counter correction, are merged and deployed. PR #76 makes the financial event range query match the stored ISO-string `occurredAt` type; PR #77 fixes the global distinct-garage counter when the last subscriber is deleted. CI fast-path and main protection changes are merged in PR #84 (`ab49d40`); PR #85's Markdown-only gate passed. **FS-02** is implemented in branch `feat/fs-02-worker-cursor-pages`, code commit `7d82a46`, PR [#86](https://github.com/tarekhamada875-droid/RQ-/pull/86); local Production Gate passed (126 files / 819 tests) and the synthetic 1k/10k/100k cursor benchmark kept each query at 51 returned rows maximum. Four required Firestore composite indexes were deployed to the configured named database and verified `READY` (the two pre-existing indexes were preserved; no rules or app code were deployed). PR #86 remains open pending its final required PR gate. See [`RQ_PROJECT_JARVIS_REMAINING_PLAN_2026-10-16.md`](./RQ_PROJECT_JARVIS_REMAINING_PLAN_2026-10-16.md) for details.

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
- The garage’s RQ access target is prepaid credits with no expiry; after confirming offline payment, Admin directly grants credits. Garage owners do not purchase packages or top up an EGP wallet to activate credits. The Admin package editor remains as an Admin-only template catalog, not customer checkout. The existing RQ time-based expiry model remains active until a tested, owner-approved cutover.
- The garage’s own monthly parking memberships remain time-based. Their successful renewal consumes five prepaid credits once; later subscriber entries/exits are not charged per visit but remain operationally recorded.
- The agreed shared mistake allowance is three free events per garage per Cairo day across all staff. Exact qualifying actions and behavior after the allowance are unresolved and must be decided before implementation.
- Before billing implementation/cutover, decide zero-credit check-in behavior, insufficient-credit subscriber renewals, treatment of active time plans, disposition and independent uses of legacy EGP wallet balances, correction/refund rules, discount/bonus treatment, and whether daily vehicle-capacity limits remain separate from credit bundles.

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
- production PIN-attempt throttling through the Cloudflare Durable Object; a separate unreferenced Firestore/IP limiter was removed during the 2026-10-15 repository noise audit;
- mandatory active server-session validation for Admin, Delegate, Garage, and Staff Worker routes, plus role-scoped session lookups (PR #35, deployed at `e53b2cb`);
- owner-scoped Firestore staff/garage rules and the actual-rules emulator matrix (PR #37, `2f3a61c`); after explicit owner approval, the exact `main:firestore.rules` source was published on 2026-10-14 to Firebase project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`. A fresh Console reload matched SHA-256 `8404b6a6cd833deaa4192e164a43cf2f2916e38840ce52fbce650feac4634d24` and showed no unpublished draft. No Firestore documents were changed; this applies only to that exact Firebase target;
- delete/refund idempotency protection (F1, PR #40, merged at `c7d452c`): retries are fingerprinted by garage, vehicle, semantic operation, and normalized amount; a mismatched key reuse now returns a clear conflict instead of being mistaken for success;
- staff composite index (FS-01, PR #53): `garageId ASC, createdAt DESC` is deployed and Enabled for the named Firestore database; legacy missing-`createdAt` records are not automatically backfilled;
- activity-log fallback correctness (FS-06, PR #54, deployed at `c1296d7`): fallback is restricted to missing-index failures, returns deterministic newest-first history with a 200-record cap, preserves Cairo-day filtering, and surfaces genuine failures rather than silently showing an empty list;
- private system-config API access and fail-closed diagnostics (RULES-02/SPIKE-01, PR #55, deployed at `20873e3`): anonymous system-config access is denied while active app roles retain full config access; diagnostic endpoints require a scoped secret and explicit environment allowlist, with production hard-disabled;
- add-garage draft preservation (UI-002, PR #48, deployed at `6c5993f`): failed/rejected creation keeps the form draft open for correction or retry; successful creation closes and clears the form;
- accessible primary form controls (UI-003, PR #57, deployed at `5f238ae`): all 11 add-garage/package controls have programmatic labels, and the plate input and subscriber search have accessible names; the plate field also describes the custom keyboard;
- the active JARVIS modernization roadmap, owner working agreement, and release documentation.

## 7. Workstream and environment boundaries

The Hono backend transition and owner-authorized Express-runtime removal are complete; no backend migration workstream is active. The JARVIS file named above is the sole active modernization roadmap. Branch previews are not a supported test environment; use local, unit, and emulator tests unless the owner explicitly authorizes a verified alternative. The frontend still imports `firebase-applet-preview-config.json` for an explicit, isolated build-time target; that does not make preview deployments supported, and the preview target must not be enabled on deployed Pages without an owner decision. A successful code deployment is not, by itself, approval to launch to real users or operate on real financial/customer data.

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
- `wrangler.toml`: active production Worker deployment contract. The `.dockerignore` file was retired as residue; no Docker deployment path is supported.
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

## 12. Latest verified handoff — 2026-10-16

- PR #67 accumulated FE-002, FS-05, FS-04, WKR-03, WKR-01/PERF-01, and WKR-02 on `main` at `bb537194ec3be199d1afd757643ee22faf95aeb4`.
- FS-03 was implemented on a short-lived branch and merged in PR #73 at `31f733fac610cd2dce5b28cbbd28dce1ecd396b2`. Owner-approved undated report behavior is the latest 12 calendar months; explicit date ranges preserve access to older history. Events and settlements now page via stable timestamp/document-name cursors (250 per page) and aggregate incrementally with exact parity, date-boundary, and delegate tests.
- `npm run ci:check` passed with 125 test files / 807 tests, TypeScript, Pages/Worker builds and artifact verification; maintainability and whitespace checks passed. Synthetic 1/3/10-year benchmark results are documented in the active plan and handoff; they are not live Firestore/Worker measurements.
- Post-merge Production Gate [#38921482843](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38921482843) and Worker deployment [#38921482881](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38921482881) passed. Live Pages, Worker health and version endpoints returned HTTP 200. The feature branch was deleted. No production Firebase data/settings changed.
- WKR-02 uses maintained summary documents with bounded fast paths and stale/missing fallback rebuilds. Do not remove the fallback until parity evidence supports it.
- **Next step:** FS-02 — add Worker cursor/page-token support and bound remaining lists. Read its full roadmap block, then verify `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and GitHub PR state before editing. Do not start FS-02 until the owner asks to continue.
