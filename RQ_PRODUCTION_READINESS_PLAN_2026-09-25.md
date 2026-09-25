# RQ Production-Readiness Plan

**Prepared:** 2026-09-25  
**Project:** `tarekhamada875-droid/RQ-`  
**Purpose:** Provide one practical plan that states each known problem, the fix, how to implement it, where to make the change, when to do it, dependencies, parallel work, and the exact continuation point for the next agent.

## 1. Overall conclusion

RQ is not a failed application that needs to be rebuilt. It already has a functioning React/Vite progressive web app, an Express API, Firebase Authentication, Firestore, transactional money operations, idempotency protection, authorization checks, projections, and meaningful tests.

The main remaining risk is not missing features. It is **inconsistent authority**: in several areas, the server, browser, reports, projections, and presentation code can still provide different answers about the same fact. The work should therefore be a controlled production-readiness program, not a broad rewrite.

The immediate production gate is the **Firestore database decision**. The repository currently refers to a named Firestore database. If the project must remain on Firebase’s no-cost Spark plan, the data must be migrated to the project’s default Firestore database. Changing the identifier in code without migrating data would make the existing data appear to disappear.

The recommended order is:

1. Confirm the database and billing decision.
2. Establish a safe staging environment and verify the current baseline.
3. Finish the remaining security and authority-boundary work.
4. Reconcile historical financial data.
5. Measure listeners, writes, and operational cost.
6. Perform authenticated staging tests and safe production smoke checks.
7. Only then make a production go-live decision.

## 2. Status legend and important interpretation

| Status | Meaning |
|---|---|
| **Completed; do not redo** | The newer audit says the issue is already corrected in the current source. Verify it with tests or diff review, but do not reimplement it from the older description. |
| **Decision required** | The owner or project decision-maker must choose an operating policy before implementation can be finalized. |
| **Required before production** | Work that must be completed and evidenced before declaring production ready. |
| **Parallel-safe** | Work that can proceed at the same time as the main production track, provided it does not change authentication, financial rules, Firebase behavior, or deployment topology. |

The architecture audit contains older evidence for some defects. The financial and production assessments state that those defects were subsequently fixed. The plan treats the newer assessment as the current status, while requiring regression verification so that the next agent does not repeat old work blindly.

## 3. Problems, fixes, locations, timing, and dependencies

### 3.1 P0: Firestore database and billing plan are unresolved

**Problem.** The checked-in configuration uses a named Firestore database. Firebase’s free database allowance applies to one free database per project, while named databases require billing. The application cannot safely remain on Spark unless it uses the default database.

**Fix.** Choose one of two supported paths:

- **Recommended when no-cost Firebase is mandatory:** migrate the data to the project’s default Firestore database.
- **Alternative when avoiding migration is more important:** keep the named database and enable Blaze billing with budgets, alerts, and a measured usage policy.

Do not replace Firestore merely to avoid this decision. The current data model, rules, SDK usage, tests, and operational knowledge are already built around Firestore.

**How to do it.** First create or confirm a separate staging Firebase project that uses the default database. Validate rules, indexes, document shapes, authentication, and the application against staging. If the default database path is selected for production, prepare a controlled export/import or document migration, compare counts and key aggregates, freeze or carefully coordinate writes during cutover, switch configuration, and run rollback checks. Never test a migration directly against production.

**Where.** Firebase project configuration, `firebase-applet-config.json`, Admin SDK configuration, Firestore indexes and rules, deployment environment variables, and migration/runbook documentation.

**When.** **Phase 0, before production implementation or launch.** This is the first decision because it changes the environment in which every later test must run.

**Dependency.** Blocks final production deployment and any production data migration. It does not block local code-quality cleanup.

**Acceptance evidence.** A written decision, a staging project, a documented database ID, verified rules and indexes, a migration plan or billing-control plan, and a rollback plan.

### 3.2 P0: No formal staging environment is defined

**Problem.** The current repository has production topology documentation, but production readiness cannot be proven solely by local tests. A data migration or authenticated workflow test must not use the production database.

**Fix.** Create a separate staging Firebase project and separate staging deployment configuration. Keep the established topology: Cloudflare Pages frontend, Railway Express API, Firebase Authentication, and Firestore. Do not introduce a proxy or silently change the production API route.

**How to do it.** Document staging and production environment variables separately. Use test accounts for each role. Deploy a known commit to staging. Confirm that the frontend calls Railway directly and that the `X-Session-ID` header remains allowed by CORS. Keep secrets in protected configuration only.

**Where.** Deployment configuration, environment settings, Firebase project settings, Railway service variables, Cloudflare Pages variables, and the project continuation documentation.

**When.** **Phase 0, in parallel with the database decision.** It must exist before authenticated smoke tests or migration rehearsal.

**Dependency.** Required by security testing, financial reconciliation rehearsal, and database migration rehearsal.

**Acceptance evidence.** Staging URL, deployed commit identifier, health response, successful authenticated login for each test role, and a documented separation from production data.

### 3.3 P0: Session authority must remain singular and server-controlled

**Problem.** The older architecture audit identified competing session authorities: server security records, browser Firestore writes, and browser listeners. The newer production assessment says the important session binding protections have since been repaired. The remaining task is to prove that every protected route consistently enforces them and that no compatibility path reopens the problem.

**Fix.** Make the server transaction the only authority for session acquisition, refresh, and release. Every protected request must verify the Firebase identity, session ID, session freshness, active session record, and the bound entity’s current session. Browser listeners may show a UX signal but must never authorize a request. Browser writes to session-lock fields must be removed or restricted to deliberately approved heartbeat behavior.

**How to do it.** Inventory all session commands and direct writes. Route acquisition, refresh, and release through the API. Keep the session ID and correlation information in the request contract. Add integration tests for stale tabs, logout races, replaced sessions, cross-garage access, expired sessions, and missing session headers. Do not weaken Firebase rules to make tests pass.

**Where.** `server/middleware.ts`, session route/service modules, `src/services/authSessionService.ts`, `src/hooks/useGarageSession.ts`, `src/services/garageService.ts`, `src/services/authService.ts`, Firestore rules, and authorization/integration tests.

**When.** **Phase 1, immediately after staging exists.** This is the first code-level production gate.

**Dependency.** Depends on staging for live workflow verification. It must be completed before final financial and vehicle-flow testing.

**Acceptance evidence.** One documented session authority, no unauthorized browser writes to authoritative session fields, passing stale-session and cross-tenant tests, and staging tests for owner, staff, delegate, supervisor, and admin roles.

### 3.3.1: Product decision — allow multiple concurrent device sessions

**Decision.** The same account may be active on two or more devices or browser sessions. A second login must not invalidate the first session merely because it is a different device. This is a multi-device/concurrent-session policy, not a removal of server-side authorization.

**Required architecture.** Each device or browser receives its own revocable session identifier, while the backend remains the single source of truth for identity, session validity, authorization, and sensitive mutations. Firestore listeners or equivalent real-time subscriptions may synchronize read/display state across devices, but they must not authorize requests or replace server transactions.

**Next-agent task.** During Phase 1, inventory the current single-device replacement and session-lock behavior, then design and implement the smallest safe multi-session change. Preserve Firebase identity checks, session freshness, garage/entity binding, revocation, logout, correlation context, and the canonical `X-Session-ID` request header. Add staging and integration tests for two valid devices, logout of one device without logging out the other, revoke-all sessions, stale/revoked sessions, simultaneous vehicle operations, and concurrent financial retries.

**Concurrency rules.** Do not use client-side last-write-wins behavior for vehicle capacity, subscriptions, wallet balances, packages, commissions, or other financial/state-transition data. Use server-authoritative validation, atomic transactions, and idempotency keys. Define conflict responses when two valid devices attempt incompatible changes at the same time.

**Acceptance evidence.** A written multi-device session policy, passing two-device authorization and revocation tests, passing concurrent vehicle/state-transition tests, proof that financial mutations remain server-only and idempotent, and confirmation that listener/write volume is measured before rollout. Do not remove the single-authority backend model.

### 3.4 P1: Vehicle lock and suspension enforcement must be uniform

**Problem.** The older audit found that some vehicle mutation routes could bypass locked-garage behavior. The newer assessment states that locked, suspended, expired, deleting, over-capacity, duplicate, and fair-use-invalid check-in decisions are now protected. The remaining risk is inconsistent enforcement in every mutation route and an unresolved product policy for vehicles already inside.

**Fix.** Use one server-side vehicle mutation policy for check-in, checkout, correction, and related operations. Decide explicitly whether a locked or suspended garage may check out or correct vehicles already inside. Enforce the chosen policy consistently through direct API calls, not only through the dashboard.

**How to do it.** Enumerate every vehicle mutation endpoint and call the same pure decision function with explicit current time and state. Add route-level tests that call the API directly while the garage is locked, suspended, expired, deleting, or over capacity. Record the chosen checkout/correction policy in the business rules document.

**Where.** Vehicle domain functions, vehicle route modules, garage-state authorization middleware, dashboard service calls, and regression tests.

**When.** **Phase 1, alongside session verification.** It can proceed in parallel with the session code if the files and tests are separate.

**Dependency.** Depends on the product decision about checkout and correction during lock. It must pass before go-live.

**Acceptance evidence.** A written policy, route coverage for every mutation, and passing direct-API tests for all locked and suspended states.

### 3.5 P0/P1: Financial mutations need one event and idempotency contract

**Problem.** The architecture audit described multiple money paths with incomplete event coverage and nullable idempotency contracts. The newer financial audit says the major affected paths have been corrected: direct wallet top-ups and self-service subscriptions now send keys, approved wallet top-ups credit the wallet correctly, reports separate wallet credits from subscription revenue, and package creation is validated. These fixes must be treated as completed code, but event completeness and historical reconciliation remain required.

**Fix.** Define typed financial commands and events. Every money operation must perform its state mutation, canonical event append, immutable ledger entry where applicable, and idempotency recording in one Firestore transaction. A repeated request with the same actor, operation, key, and fingerprint must return the same committed result. Reusing a key with a different fingerprint must fail.

**How to do it.** Inventory direct recharge, wallet top-up approval, self-subscription, delegate request approval, package purchase, rejection, and commission paths. Give each a discriminated command type and a canonical event type. Make the idempotency key required at the route boundary. Ensure the initiating UI retains the same key when retrying the same user action. Add contract tests asserting that each command emits the event consumed by reports and projections.

**Where.** `server/routes/recharges.ts`, `server/events.ts`, `server/idempotency.ts`, `server/financialReporting.ts`, ledger modules, `src/services/adminService.ts`, `src/services/garageService.ts`, `src/services/delegateService.ts`, and financial tests.

**When.** **Phase 2.** Regression verification of the already-fixed paths can begin in Phase 1; any new event-contract changes should follow session and vehicle authority work.

**Dependency.** Depends on the current data model and staging project. Historical reconciliation depends on the final event contract.

**Acceptance evidence.** Contract test matrix for every financial command, duplicate/retry tests, fingerprint mismatch tests, transaction tests, and reports that distinguish subscription revenue, wallet credits, and total cash collected.

### 3.6 Required decision: financial reporting policy for wallet credits

**Problem.** The current report treats wallet credits as cash collected and keeps later wallet spending separate. This avoids double-counting the top-up and the later purchase, but it is an accounting policy choice.

**Fix.** Confirm whether the business wants:

- cash collected to include wallet credits when money enters the system, with subscription purchases shown separately; or
- revenue to be recognized only when wallet credit is spent, which requires additional accounting labels and rules.

**How to do it.** Record the chosen policy. Update report labels, documentation, and tests so a non-technical operator cannot confuse cash collection with subscription revenue.

**Where.** `server/financialReporting.ts`, admin financial report UI, financial documentation, and report tests.

**When.** **Phase 2, before historical reconciliation is finalized.**

**Dependency.** Business decision required; the current implementation can remain operational while the policy is being confirmed, but it should not be called formal accounting output until then.

**Acceptance evidence.** Written policy, report labels approved by the business owner, and test cases for top-up followed by purchase.

### 3.7 P1: Package entitlement must have one source of truth

**Problem.** The older audit found package duration, capacity, price, and status being reconstructed in UI components from names, IDs, legacy fields, and hard-coded defaults. The newer assessment says server-side package lookup and inactive-package rejection are now fixed in important purchase paths. Presentation fallbacks still need cleanup.

**Fix.** The server package document and package-domain function must be the only source of entitlement. The API should return a normalized `PackageEntitlement` containing price, duration, capacity, discount, unlimited status, active status, and the recorded package identity. The frontend should display that response and not infer business values from names or IDs.

**How to do it.** Inventory every package calculation. Remove hard-coded duration fallbacks from business decisions. Normalize legacy records at the service/domain boundary into view models. If a migration-only fallback is temporarily necessary, add telemetry and a removal date. Add tests for 7-day, 15-day, 30-day, custom, inactive, renamed, and missing packages.

**Where.** `server/packageCatalog.ts`, package routes, `server/routes/recharges.ts`, `src/constants/packages.ts`, `PackagesModal.tsx`, `RechargeHistoryView.tsx`, `GarageDashboardView.tsx`, service adapters, and package tests.

**When.** **Phase 3.** This can start in parallel with historical financial reconciliation if the same package schema is not being migrated.

**Dependency.** Depends on the financial command contract for purchase pricing. It should be complete before user-facing entitlement is treated as reliable.

**Acceptance evidence.** No production business decision depends on a package name or ID fallback, and dynamic-package tests pass across API and UI view models.

### 3.8 P1: Browser Firestore writes bypass the declared API boundary

**Problem.** The project documentation says Railway owns sensitive mutations and Firebase Admin access, but browser services still directly read or write some operational collections. This creates ambiguity about ownership and prevents one transaction from enforcing every invariant.

**Fix.** Split browser services into **queries** and **commands**. Commands for sessions, financial state, lifecycle state, and other sensitive mutations must go through the API. Keep only deliberately user-owned, rules-protected writes in the browser. Document the owner of every collection.

**How to do it.** Build a collection-by-collection inventory. For each direct Firestore operation, classify it as an allowed read, an allowed heartbeat/write, a server-only command, or a deprecated compatibility path. Move server-owned writes behind API routes. Add tests and rules that reject direct client mutation of server-owned fields.

**Where.** `src/services/*`, `src/api/apiClient.ts`, `server/routes/*`, `firestore.rules`, session heartbeat code, and the architecture/maintainability documentation.

**When.** **Phase 3, after session and financial contracts are stable.** Do not perform a broad service rewrite before the canonical commands exist.

**Dependency.** Depends on session and financial authority decisions. Can proceed incrementally, collection by collection.

**Acceptance evidence.** Collection ownership matrix, no unauthorized direct client writes, and route/query tests proving the same business rule is used regardless of caller.

### 3.9 P2: Historical financial records are not yet reconciled

**Problem.** Older activity logs, garage totals, delegate aggregates, manual-credit ledger entries, and domain events may have been produced before the current canonical paths. The current report must not be treated as a complete accounting source until these records are compared.

**Fix.** Create a read-only reconciliation process first. Compare legacy activities, balances, subscription records, wallet ledger entries, delegate aggregates, financial events, and projections. Produce an exception report. Apply corrections only through a reviewed, idempotent, auditable process.

**How to do it.** Define expected equations and tolerances. Run the process against a staging copy or export. Classify each discrepancy as a missing event, duplicated event, incorrect aggregate, expected legacy behavior, or unresolved case. Do not silently rewrite history. If corrections are necessary, append corrective events or approved adjustment records rather than deleting evidence.

**Where.** Reconciliation scripts or server modules, financial event and ledger collections, projection/reconciliation functions, report tests, and an operations runbook.

**When.** **Phase 4, after the financial event contract and reporting policy are fixed.**

**Dependency.** Depends on the database/staging decision and canonical financial event schema.

**Acceptance evidence.** Reconciliation totals, exception list, approved treatment for every exception class, dry-run output, and rollback/audit evidence.

### 3.10 P2: Firestore listener and write costs are not yet measured for one to twenty garages

**Problem.** Garage count alone does not determine cost. Broad listeners, reconnects, document size, dashboard refreshes, and projection write amplification may push the system beyond free quotas or create unnecessary paid usage.

**Fix.** Keep the current architecture but measure and reduce the expensive paths. Use small dashboard summary documents, bounded queries, cursor pagination, active-garage listeners only, immutable activity logs with date ranges, and stable idempotency keys on retries.

**How to do it.** Inventory every realtime listener and query. Record listener scope, expected document count, refresh behavior, and writes per business operation. Load-test representative one-garage, five-garage, and twenty-garage workloads in staging. Add index exemptions only after confirming the fields are never queried. Define log retention and determine whether TTL, backups, PITR, or clones require billing.

**Where.** Frontend listener hooks, admin garage pages, dashboard summary/projection modules, Firestore indexes, operational logging, and staging measurement scripts.

**When.** **Phase 4, in parallel with historical reconciliation.** The cost track must finish before a Blaze/Spark operating decision is declared complete.

**Dependency.** Depends on staging and representative test data. It does not require changing the data model.

**Acceptance evidence.** Per-operation read/write estimates, listener inventory, measured reconnect behavior, projection write-amplification report, quota dashboard, and budget alerts if Blaze is selected.

### 3.11 P2: Dead compatibility wrapper and duplicated presentation logic

**Problem.** `src/utils/formatters.ts` is a compatibility wrapper used only by a test, while presentation components reconstruct package and legacy business data in multiple places. This creates source-of-truth confusion and increases future defect risk.

**Fix.** Move the test to the canonical utility and remove the wrapper, or mark it as temporary with an owner and removal date. Move package and legacy-record normalization to pure service/domain adapters. Keep components responsible for display, not business-rule reconstruction.

**How to do it.** Make one small change at a time. Add characterization tests for existing display behavior before moving logic. Replace component fallbacks with normalized view models. Review the resulting diff manually.

**Where.** `src/utils/formatters.ts`, `src/utils/index.ts`, `RechargeHistoryView.tsx`, `GarageDashboardView.tsx`, service adapters, and tests.

**When.** **Phase 5, after package authority is stable.**

**Dependency.** Depends on the normalized package entitlement contract. This is safe to do in parallel with ESLint cleanup if separate commits are used.

**Acceptance evidence.** No duplicate business calculations in components, passing characterization tests, and a clean repository-wide import search.

### 3.12 P3: Large files conceal responsibilities

**Problem.** Large files such as `server/app.ts`, `GarageDashboardView.tsx`, `AdminGarageDetailsView.tsx`, and `AdminDelegateDetailsView.tsx` combine assembly, route handling, state derivation, presentation, and compatibility logic. This does not prove a runtime defect, but it raises change and review risk.

**Fix.** Refactor by command/query boundary, not by arbitrary line count. Keep `server/app.ts` focused on assembly and middleware. Extract route modules and frontend hooks/selectors only after characterization tests protect behavior.

**How to do it.** Select one bounded responsibility per change. Move code without changing its contract. Run focused tests, full tests, typecheck, build, maintainability checks, and diff checks after each slice. Avoid mixing this work with financial or authentication changes.

**Where.** `server/app.ts`, modular `server/routes/*`, dashboard hooks/selectors, admin components, and characterization tests.

**When.** **Phase 5, after production-critical authority work.**

**Dependency.** Depends on canonical session, financial, package, and query/command boundaries.

**Acceptance evidence.** Smaller modules with unchanged behavior, passing regression coverage, and no change to deployment topology.

### 3.13 P3: ESLint is not yet a production gate

**Problem.** The architecture audit recorded 603 ESLint findings: 593 errors and 10 warnings. The continuation brief says safe cleanup has reduced several categories and that remaining React Hooks findings and broad `no-explicit-any` findings still require review.

**Fix.** Continue with narrow, behavior-preserving ESLint cleanup. Do not mass-fix, disable rules, weaken tests, or add speculative types. Add ESLint to the production CI gate only when the remaining baseline is green or covered by a reviewed, explicit allowlist.

**How to do it.** Start with a complete inventory under the current configuration. Review remaining `exhaustive-deps`, `set-state-in-effect`, and `purity` findings one at a time. Prefer findings that can be proven to be unnecessary dependencies. Treat state synchronization and render-time purity findings as behavior-sensitive. Address `no-explicit-any` only at known boundaries with real data shapes.

**Where.** `eslint.config.js`, affected React hooks/components, typed API boundaries, CI configuration, and `CODE_QUALITY_CHECKPOINTS.md`.

**When.** **Parallel track, beginning immediately.** It must not modify financial rules, session behavior, Firebase security, or Cloudflare/Railway topology. Promote ESLint into CI only after its own validation phase passes.

**Acceptance evidence.** Categorized finding inventory, focused tests for each behavior-sensitive fix, green ESLint or reviewed baseline, and CI evidence.

### 3.14 P2/P3: Logging, dependency hygiene, and backend bundle review remain

**Problem.** Structured logging and backend bundle size/dependency review are deferred. The architecture audit also noted Node engine warnings and six moderate dependency audit vulnerabilities. These are not automatically production blockers, but they require classification.

**Fix.** Review logging for levels, correlation IDs, secret redaction, and production verbosity. Review bundle size and dependencies without unsafe externalization. Classify dependency advisories by exploitability, runtime exposure, and available upgrade path.

**How to do it.** Preserve correlation context and redaction. Measure the Railway bundle before and after any dependency change. Upgrade dependencies in isolated commits with tests. Do not replace working deployment behavior merely to reduce bundle size.

**Where.** Logging utilities and middleware, `package.json`/lockfile, server bundling configuration, CI reports, and deployment documentation.

**When.** **Phase 6, after ESLint and authority cleanup.**

**Dependency.** Depends on a stable code baseline so that changes can be attributed correctly.

**Acceptance evidence.** Structured log review, secret-redaction tests, bundle-size comparison, dependency risk register, and a documented decision for each advisory.

## 4. Work that can happen in parallel

The following streams can safely run concurrently when each is isolated in its own reviewable commit:

| Parallel stream | Can start | Must not change |
|---|---|---|
| Staging project and environment separation | Immediately | Production data, secrets, or deployment topology |
| ESLint and maintainability cleanup | Immediately | Financial rules, authentication/session behavior, Firebase security, and API contracts |
| Firestore listener and query inventory | After staging is available | Data schema or production listeners without measurement |
| Documentation and collection-ownership matrix | Immediately | Runtime behavior until the owner is confirmed |
| Safe read-only Cloudflare-to-Railway smoke checks | After connector/configuration review | Financial mutations, account changes, or production data |
| Characterization tests for large components | After baseline verification | Business decisions during test creation |

The following work must remain sequential:

1. Firestore database/billing decision before production migration.
2. Staging before authenticated workflow testing.
3. Session authority before final protected-route verification.
4. Financial event contract before historical reconciliation.
5. Package authority before removing package fallbacks.
6. All critical fixes and reconciliation before a production go-live decision.

## 5. Recommended phase schedule

The timing below is relative to the next agent’s start rather than a calendar promise. A phase may take longer if verification finds a new defect.

### Phase 0: Establish the decision and environment

**Goal:** Decide Spark/default database versus named database/Blaze, create staging, and verify the repository baseline.

**Tasks:** Confirm repository branch and clean/dirty state; record current commit and origin; inspect canonical checkpoint files; create or verify staging; document environment variables; verify safe health checks; decide the Firestore path.

**Exit gate:** Written database decision, staging available, baseline test/build evidence, and no secret exposure.

### Phase 1: Close authorization and state-transition gates

**Goal:** Prove session authority and vehicle lock/suspension enforcement.

**Tasks:** Inventory and test session commands; replace single-device session exclusivity with the approved multi-device policy; remove or restrict browser writes to authoritative session fields; test two-device authorization, individual logout, revoke-all, stale sessions, and cross-tenant access; define conflict handling for concurrent state transitions; decide and enforce checkout/correction behavior for locked garages.

**Exit gate:** Protected-route integration tests pass in staging for all required roles and vehicle states.

### Phase 2: Make financial behavior auditable

**Goal:** Confirm the already-fixed money paths and complete the event/idempotency contract.

**Tasks:** Run regression tests for direct top-up, approval, self-subscription, package purchase, commission, retry, and report behavior. Define typed commands/events. Confirm the wallet-credit reporting policy.

**Exit gate:** Every financial command has one transaction, one canonical event path, durable idempotency, and a clear report interpretation.

### Phase 3: Make package and query/command boundaries explicit

**Goal:** Remove remaining competing entitlement and browser-command paths.

**Tasks:** Normalize package entitlement, remove component inference, classify direct Firestore operations, move sensitive browser writes behind the API, and update rules/tests.

**Exit gate:** Server package authority and collection ownership are documented and enforced.

### Phase 4: Reconcile history and measure operating cost

**Goal:** Establish whether historical reports and the projected workload are trustworthy.

**Tasks:** Run a read-only financial reconciliation; classify discrepancies; measure listeners, reads, writes, reconnects, and projection amplification for one, five, and twenty garages; configure budget/quota monitoring for the selected billing path.

**Exit gate:** Reconciliation exceptions are approved or corrected through an auditable process, and the usage plan is documented.

### Phase 5: Refactor safely after behavior is protected

**Goal:** Reduce maintainability risk without changing business behavior.

**Tasks:** Remove the formatter wrapper; move legacy normalization into adapters; split large files by command/query boundary; keep each change small and fully validated.

**Exit gate:** Regression suite, typecheck, build, maintainability check, and diff checks pass after every slice.

### Phase 6: Complete quality and operational review

**Goal:** Finish ESLint promotion, logging, dependency, and bundle review.

**Tasks:** Resolve or explicitly classify remaining ESLint findings; add the check to CI; review structured logging and redaction; classify dependency advisories; measure the backend bundle.

**Exit gate:** CI quality gate is green, operational risks are documented, and no unsafe externalization or secret exposure was introduced.

### Phase 7: Final production readiness decision

**Goal:** Decide whether RQ is ready for production or needs a specific follow-up.

**Required evidence:**

- Current commit and clean working tree.
- Full tests with the constrained worker setting.
- TypeScript check.
- ESLint result and policy.
- Production frontend and backend build.
- Maintainability check.
- `git diff --check`.
- Staging authenticated tests for owner, staff, delegate, supervisor, and admin.
- Read-only Cloudflare-to-Railway health and smoke checks.
- Firestore migration or billing decision and rollback evidence.
- Financial reconciliation report and unresolved exception list.
- Listener/write/cost report.
- Deployment commit verification.

A go-live decision should be **No-Go** if the database path is unresolved, staging is unavailable, protected requests fail session binding, financial reconciliation has unexplained material differences, or the production deployment cannot be verified.

## 6. Already-fixed work that must not be repeated

The newer assessments state that the following corrections are already present in the current source. The next agent should verify them, not recreate them from the older audit:

- Session binding and stale-session protections were added.
- Trial decisions were scoped by role and garage ownership.
- Locked-garage check-in enforcement was added.
- Direct wallet top-ups were separated from subscription activation.
- Approved wallet top-ups credit the wallet and write the correct ledger/event records.
- Active and missing package validation is enforced on purchase paths.
- Direct top-ups and self-subscriptions send idempotency keys.
- Client-supplied identity fields are not trusted for authorization.
- Package creation validates and normalizes price, duration, capacity, discount, and active-state fields.
- Financial reports separately expose subscription revenue, wallet credits, and total cash collected.
- The dashboard’s overlapping standalone Arabic `تجريبي` badge was removed without changing trial logic.

The exact current status must still be checked from the repository’s current branch and tests because the supplied documents were produced at different points in the project history.

## 7. Required operating rules for every future agent

Before changing anything, the agent must verify the repository path, branch, current commit, origin commit, and working-tree state. It must read the continuation and checkpoint files and choose exactly one bounded task.

Every change must be coherent and reviewable. The agent must run focused tests first, then the relevant full validation gate, inspect the diff, and run `git diff --check`. It must not weaken tests, hide lint findings, expose secrets, perform irreversible production deletion, or make financial mutations during smoke testing.

The production `server/` backend remains authoritative until a bounded replacement slice has passed tests and an explicit cutover has been approved. Financial operations remain single-authority until reconciliation and rollback evidence exist. The existing Cloudflare Pages to Railway topology must remain unchanged.

If the owner sends the exact phrase **`tokens ending`**, the agent must stop feature work immediately and follow `docs/SUCCESSION_PROTOCOL.md`. It must record the current SHA, branch, origin, working-tree status, changed files, focused and full validation, deployment evidence, connectors, blockers, completed slice, and one exact next bounded task. It must publish only the handoff documentation and tell the successor to repeat the same protocol.

## 8. Copy-paste startup block for the next agent

> Repository: `/home/ubuntu/RQ-`. Read `PROJECT_CONTINUATION_BRIEF.md`, `CODE_QUALITY_CHECKPOINTS.md`, `BUSINESS_LOGIC_FIX_CHECKPOINTS.md`, `V3_BACKEND_PLAN.md`, `docs/SUCCESSION_PROTOCOL.md`, and `AGENTS.md`. Verify `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and the latest validation result. Do not repeat already-fixed wallet, package, session, trial, or locked-check-in investigations without new evidence. The next bounded production-readiness task is to confirm the Firestore database/billing decision and staging environment, then verify the current session and vehicle authorization protections. Preserve the Cloudflare Pages to Railway topology, server ownership of sensitive mutations, financial single-authority rules, and secret-handling boundaries. If the owner sends `tokens ending`, stop feature work and repeat the succession protocol before doing anything else.

## 9. Source documents

This plan was consolidated from the following supplied documents:

- [Production architecture assessment](</home/ubuntu/upload/PRODUCTION_ARCHITECTURE_ASSESSMENT.md>)
- [Financial audit report](</home/ubuntu/upload/FINANCIAL_AUDIT_REPORT.md>)
- [Architecture audit](</home/ubuntu/upload/ARCHITECTURE_AUDIT_2026-09-25.md>)
- [Project continuation brief](</home/ubuntu/upload/PROJECT_CONTINUATION_BRIEF.md>)
- [Succession protocol](</home/ubuntu/upload/SUCCESSION_PROTOCOL.md>)

## References

[1]: https://firebase.google.com/pricing "Firebase pricing and plan comparison"
[2]: https://firebase.google.com/docs/firestore/quotas "Cloud Firestore quotas and limits"
[3]: https://cloud.google.com/firestore/pricing "Cloud Firestore pricing"

The Firestore plan and quota statements in this plan are based on the Firebase and Google Cloud documentation cited above. The repository-specific findings and status statements are based on the supplied audit and handoff documents listed in Section 9.

---

**Prepared by:** Manus AI
**Constraint followed:** No WebDev or GameDev tooling was used.

## 10. Immediate next task

The next agent should begin with one bounded task: **verify the current repository state and resolve/document the Firestore database path and staging prerequisites**. It should not start a broad rewrite. If the database decision is already documented elsewhere, verify it against the current configuration and move directly to staging validation. After that, the next bounded task is the session-authority and locked-garage direct-API verification described in Phase 1.

**Current plan state:** planning complete; implementation not started in this task.

**Known blockers:** Firestore database/billing choice, availability of a separate staging Firebase project, and business confirmation of wallet-credit reporting policy.

**Parallel work available now:** ESLint inventory/cleanup, collection-ownership documentation, and read-only deployment health verification, provided all safety boundaries are preserved.

**Do not claim that production is ready until the Phase 7 evidence exists.**

---

## References

[1]: https://firebase.google.com/pricing "Firebase pricing and plan comparison"
[2]: https://firebase.google.com/docs/firestore/quotas "Cloud Firestore quotas and limits"
[3]: https://cloud.google.com/firestore/pricing "Cloud Firestore pricing"

The Firestore plan and quota statements in this plan are based on the Firebase and Google Cloud documentation cited above. The repository-specific findings and status statements are based on the supplied audit and handoff documents listed in Section 9.

---

**Prepared by:** Manus AI  
**Constraint followed:** No WebDev or GameDev tooling was used.
