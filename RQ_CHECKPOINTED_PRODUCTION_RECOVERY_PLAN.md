# RQ Checkpointed Production Recovery Plan

**Date:** 2026-09-25  
**Status:** Ready for controlled execution  
**Owner:** RQ project owner + Manus agents  
**Production source of truth:** `main`  
**Current production commit:** `a8096b5349df6b890d830f04ccb99febb68aac9e`

## 1. The decision in plain language

We will **not rewrite RQ** and we will not create a parallel V3 backend. We will repair the existing product in small, reversible slices:

```text
Cloudflare Pages frontend
        ↓
Railway Express API — production authority
        ↓
Firebase Authentication + Firestore
```

The backend remains authoritative for:

- authentication and authorization;
- session creation, refresh, revocation, and timeout;
- vehicle check-in, checkout, correction, and deletion;
- subscriptions, balances, manual credits, and financial ledgers;
- idempotency, transactions, audit events, and operational policy.

### UI/UX preservation contract

The existing UI and UX are part of the product requirements. Checkpoints may repair API clients, service methods, data adapters, error handling, loading behavior, and backend routes underneath the current screens, but they must not redesign, remove, rename, or add user-facing features. Any visual or interaction change requires a separate explicit request. A checkpoint that changes component structure must prove that the rendered screens, navigation, labels, controls, and user workflow remain equivalent.

Functional programming is a **design rule inside the backend**, not a reason to replace infrastructure:

```text
HTTP adapter → typed command → pure domain decision → Firestore transaction → event/idempotency persistence → HTTP response
```

Pure functions receive time, identifiers, and state explicitly. They do not access Firestore, Express, environment variables, randomness, logging, or hidden mutable state.

## 2. Firebase / Blaze decision

### Recommended decision: keep the named database and enable Blaze

The checked-in project uses a named Firestore database. Official Firestore pricing documentation says named, non-default databases require billing and do not qualify for the free quota. Therefore, changing the identifier casually would not be a harmless optimization: it could make the application point at a different database and appear to lose data.

Enabling Blaze will make the billing plan effective immediately after Firebase/Google Cloud accepts the billing account. It does **not** require a code rewrite or a recurring maintenance task just to keep the app running.

However:

- Blaze is pay-as-you-go after applicable no-cost usage;
- budget alerts notify but do not cap charges;
- Firebase recommends spend caps for applicable services;
- normal production operation still requires monitoring, backups, security reviews, and incident response;
- billing changes are external account changes and must be performed by the account owner in Firebase/Google Cloud Console.

### Firebase checkpoint F0 — billing and database identity

**Owner:** Project owner (account-level action)  
**Agent role:** verify configuration and update documentation only  
**Allowed:** read project configuration, update the plan/checklist  
**Forbidden:** changing billing, deleting databases, migrating data, or changing the database identifier automatically

**Exit evidence:**

- billing account linked to the intended Firebase project;
- project shows Blaze plan;
- named database remains present and is the database used by the application;
- budget alerts and spend controls are configured;
- a billing owner understands that alerts are not hard caps.

**Rollback:** Do not downgrade or detach billing during the recovery plan. Downgrading can disable paid capabilities and is a separate owner-approved operation.

## 3. Non-negotiable agent rules

Every agent must:

1. Read `AGENTS.md`, this plan, `V3_BACKEND_PLAN.md`, and the relevant checkpoint file before editing.
2. Work on a short-lived branch, never directly on `main`.
3. Make one coherent change per checkpoint.
4. Preserve the current `server/` backend authority.
5. Never add a parallel backend generation or dual-write financial path.
6. Never put secrets in source, logs, tests, commits, plans, or screenshots.
7. Never mutate production data during development or test setup.
8. Run focused tests first, then the full validation gate.
9. Stop and record a blocker instead of guessing when a product policy is unclear.
10. Commit only after the checkpoint gate passes.
11. Update the checkpoint ledger with commit, tests, risks, rollback, and the exact next task.

The protected **RQ Backend Operator** connector is for safe operational diagnostics. Agents may use its read-only tools to check `/api/health` and `/api/system-config`. They must not expand it into production mutation tools as part of ordinary feature work.

## 4. Universal checkpoint protocol

Every checkpoint follows this exact lifecycle:

### A. Baseline

Record:

- branch and commit;
- clean/dirty working tree;
- current production deployment commit;
- relevant test baseline;
- known risks and non-goals.

### B. Characterize

Add or confirm tests describing current behavior before changing runtime code. Tests must include success, invalid input, authorization boundaries, missing records, retries, idempotency, and transaction behavior where relevant.

### C. Pure decision module

Extract or improve one domain module. It must be deterministic and side-effect free. Prefer discriminated results such as `created`, `updated`, `not_found`, `unauthorized`, `invalid_input`, `idempotency_conflict`, and `policy_blocked`.

### D. Adapter integration

Keep Firestore reads, transactions, event persistence, idempotency persistence, logging, and HTTP response mapping in adapters. Do not let the domain module call infrastructure.

### E. Validation

Run the checkpoint-specific tests and the universal gate. A failing pre-existing lint category must be recorded precisely; it must not be hidden with broad disables or weakened tests.

### F. Review and commit

Review the diff for:

- accidental authority changes;
- direct browser writes;
- financial semantics changes;
- missing idempotency keys;
- secret exposure;
- migration or deployment side effects.

Commit the checkpoint and update this plan.

### G. Deployment decision

Development checkpoints do not deploy automatically. Deployment requires:

- CI green;
- exact commit identified;
- staging smoke tests green;
- rollback commit or deployment identified;
- no unresolved P0/P1 blocker for the changed capability.

## 5. Checkpoint sequence

### C0 — Freeze and evidence baseline

**Goal:** make the current state reproducible before changing behavior.

**Tasks:**

- confirm repository, Cloudflare Pages, Railway, and Firebase identifiers;
- record current production SHA and deployment URLs;
- export no secrets;
- confirm health, system-config, frontend load, CORS, and API routing;
- document any existing production incidents.

**Exit gate:** all baseline checks recorded; no production mutation; rollback reference is `a8096b5`.

**Rollback:** none needed; documentation-only checkpoint.

### C1 — Staging boundary

**Goal:** create a safe place for authenticated workflow tests and migration rehearsal.

**Owner decision (2026-09-25):** The project currently has no real users, customer records, or live financial data. Until that changes, the existing Cloudflare Pages → Railway → Firebase deployment is treated as a **controlled pre-production environment** using synthetic test data only. A separate staging environment is deferred, not an immediate implementation blocker. This decision must be revisited before onboarding real users, accepting real revenue, importing customer data, or performing destructive migrations.

**Tasks:**

- create or identify a separate Firebase staging project/database;
- create separate Railway staging variables and service/environment;
- configure Cloudflare preview/staging to target staging Railway;
- create test accounts for owner, staff, delegate, supervisor, and admin roles;
- seed only synthetic data.

**Exit gate when staging is enabled:** authenticated smoke tests run against staging, and a staging failure cannot read or write production data. Until then, synthetic pre-production tests must use clearly labeled records and must not delete or overwrite unknown data.

**Rollback:** disable preview/staging deployment; production variables remain untouched.

**Blocker policy:** staging credentials or account ownership are not required for the current synthetic pre-production phase. Stop and report if a test would touch unknown data, require destructive cleanup, or involve a real user or financial record.

### C2 — Session authority and multi-device behavior

**Goal:** make session behavior coherent and server-authoritative.

**Tasks:**

- characterize login, claim, refresh, timeout, one-device logout, revoke-all, and stale session behavior;
- remove only unsafe browser fallback writes after equivalent server routes are proven;
- keep allowed display listeners separate from authorization writes;
- align root session documents, device session documents, active session arrays, and `currentSessionId` compatibility behavior;
- test two valid devices concurrently.

**Exit gate:** two-device tests, stale-session tests, logout/revoke tests, server outage behavior, and unauthorized Firestore write tests pass in staging/emulator.

**Rollback:** revert the checkpoint commit; keep current production session behavior unchanged until redeployed.

### C3 — Subscriber lifecycle functional slice

**Goal:** complete the existing V3 migration order for subscriber add, renew, update, and delete.

**Tasks:**

- characterize current route contracts;
- implement or refine `server/domain/subscriberLifecycle.ts`;
- preserve route response compatibility;
- test date validation, garage scope, immutable plate behavior, not-found behavior, idempotent replay, changed-payload conflicts, retries, and event persistence.

**Exit gate:** focused tests, full tests, TypeScript, build, maintainability, diff check, and secret scan pass.

**Rollback:** revert only the subscriber slice; no data migration.

### C4 — Vehicle check-in and checkout authorization

**Goal:** enforce one direct-API policy for vehicle operations.

**Tasks:**

- extract check-in and checkout decisions into pure modules;
- **locked/suspended policy:** reject new check-ins when either flag is true;
- **existing vehicles:** allow checkout/correction of vehicles already inside while locked or suspended, preserving an exit path without accepting new exposure;
- enforce that policy in every direct route, not just dashboard UI;
- test duplicate requests, invalid state transitions, garage scope, staff scope, and idempotency.

**Exit gate:** API-level tests prove that dashboard bypasses cannot violate the same policy.

**Rollback:** revert route adapter and domain slice; preserve existing data.

### C5 — Non-financial operational policies

**Goal:** repair garage deletion planning, staff/delegate scope, operational status, and reporting projections without changing money.

**Tasks:**

- extract garage deletion eligibility and plan decisions;
- enforce lock/suspension and ownership scope consistently;
- type report reducers and projection adapters;
- keep financial fields read-only except through existing authoritative routes.

**Exit gate:** policy matrix tests cover owner, staff, delegate, supervisor, admin, locked, suspended, deleting, and missing-entity states.

### C6 — Manual credit and financial route integration

**Goal:** prove the already-added financial hardening at the route/transaction boundary.

**Tasks:**

- add emulator or equivalent mocked integration coverage;
- test duplicate approval replay;
- test changed-payload idempotency conflict;
- test duplicate rejection and direct top-up replay;
- test unauthorized direct financial-field writes;
- prove atomic ledger/event/idempotency persistence;
- prove concurrent approval behavior.

**Exit gate:** no financial behavior changes are accepted unless tests prove single-authority accounting and replay safety.

**Rollback:** revert the checkpoint; do not run repair scripts against production.

### C7 — Historical financial reconciliation (read-only first)

**Goal:** determine whether historical activity, aggregates, ledgers, and reports agree.

**Tasks:**

- define the accounting period and source-of-truth fields;
- run read-only counts and aggregate comparisons in staging/export;
- classify differences as expected legacy behavior, bug, or missing migration;
- produce a correction plan with idempotent, reversible operations only.

**Exit gate:** reconciliation report approved before any production correction.

**Rollback:** no mutation is permitted in this checkpoint.

### C8 — Frontend contract and resilience pass

**Goal:** make the frontend behave predictably when API calls fail, sessions expire, or data is delayed.

**Tasks:**

- type API envelopes and errors at the boundary;
- remove stale client fallback behavior;
- ensure loading, empty, unauthorized, expired, and retry states are explicit;
- keep mathematical/scientific calculations in pure shared functions with unit tests;
- verify frontend never treats a display listener as authorization.

**Exit gate:** browser tests or controlled staging smoke tests cover every role and failure state.

### C9 — Observability and operational readiness

**Goal:** make production failures diagnosable without exposing secrets or personal data.

**Tasks:**

- standardize correlation and operation IDs;
- record safe structured events for auth, financial, idempotency, and policy failures;
- add health checks and deployment metadata;
- document rollback, incident response, and backup/restore verification;
- configure billing alerts and spend controls after Blaze activation.

**Exit gate:** a simulated failed request can be traced from frontend correlation ID to Railway logs without secret or sensitive payload leakage.

### C10 — Staging release candidate and production launch gate

**Goal:** decide launch readiness from evidence.

**Required evidence:**

- all P0 blockers closed;
- all changed capability P1 blockers closed or explicitly accepted;
- CI green on exact commit;
- staging authenticated smoke tests green for all roles;
- financial and destructive operations tested only with synthetic data;
- production health and frontend smoke tests green;
- rollback deployment/commit identified;
- Firebase billing/database identity recorded;
- backup/restore and incident contacts documented.

**Launch rule:** a landing page loading is not sufficient. The release candidate must pass the complete evidence gate.

## 6. Universal validation gate

For each code checkpoint, run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test -- --run
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

Also run:

- focused tests for the changed capability;
- Firestore emulator or equivalent rule/integration tests where available;
- secret scan;
- exact-commit Railway health check after a deployment;
- Cloudflare frontend and API-origin smoke check;
- controlled authenticated staging smoke tests.

A known baseline failure may be documented but never hidden. The current repository-wide ESLint baseline includes many pre-existing `no-explicit-any` findings; do not mass-autofix that category during launch-critical work.

## 7. Agent work assignment template

Every future agent receives exactly one checkpoint, for example:

> Work only on checkpoint C2, Session authority and multi-device behavior. Read `AGENTS.md`, `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`, `V3_BACKEND_PLAN.md`, and the current checkpoint files. Work on a short-lived branch. Do not contact production data, change Firebase billing, change database identifiers, expose secrets, add a parallel backend, or alter financial semantics. First characterize behavior with tests, then make the smallest server-authoritative change. Run focused tests and the universal validation gate. Commit only if green. Return: commit SHA, changed files, tests, risks, rollback commit, and exactly one next bounded task.

Agents must not receive overlapping write scopes in parallel. Parallel agents may independently research or review, but only one agent may edit the same capability at a time.

## 8. Current checkpoint ledger

| Checkpoint | Status | Evidence / next action |
|---|---|---|
| C0 baseline | Complete | Production commit `a8096b5`; audit completed |
| F0 Firebase decision | Owner decision required | Recommended: keep named DB + enable Blaze + alerts/spend controls |
| C1 staging | Deferred by owner; synthetic pre-production authorized | Current deployment may be used for clearly labeled synthetic tests only; revisit before real users, revenue, customer data, or destructive migration |
| C2 sessions | Code and synthetic verification complete; live pre-production evidence pending | Added 5 in-memory HTTP tests for two-device refresh, stale/revoked session, timeout, one-device release, and unauthorized release; added browser outage fail-closed coverage. Fixed release-session root `activeSessionIds`/`currentSessionId` drift. Full suite: 432 tests passed. Live Firebase Auth/Firestore smoke evidence remains pending because emulator credentials are unavailable |
| C3 subscribers | Synthetic implementation and verification complete | Added route-level in-memory coverage for add, renew, update, delete, idempotent replay/conflict, immutable plates, garage scope, invalid dates, and event persistence. Fixed immutable-plate errors returning HTTP 500 instead of the established 409 conflict envelope. Full suite: 438 tests passed; build, TypeScript, maintainability, and diff gates passed |
| C4 vehicles | Synthetic policy verification complete | Formalized and tested the existing policy: locked/suspended garages reject new check-ins, while vehicles already inside remain eligible for checkout/correction. Pure check-in/checkout decisions, direct-route scope tests, deletion lock tests, invalid transitions, and idempotency boundaries passed; no UI/UX or financial behavior changed |
| C5 operations | Synthetic policy verification complete | Added a complete role/state matrix for admin-only garage deletion and maintenance, owner/staff same-garage scope, delegate/supervisor denial, missing/completed deletion recovery, admin-only reports, and deterministic projection rebuilds. Full suite: 447 tests passed; build, TypeScript, maintainability, and diff gates passed |
| C6 manual credit | Complete | `server/manualCreditRoutes.integration.test.ts`: 9 passing tests covering replay, changed-payload conflict, unauthorized writes, atomic rollback, ledger/event/idempotency persistence, and concurrent approval |
| C7 reconciliation | Deferred | C6 is complete; perform read-only reconciliation only after the accounting-period/source-of-truth policy is approved and synthetic pre-production data is clearly identified |
| C8 frontend resilience | Synthetic boundary verification complete; browser smoke pending | Typed API errors and envelopes at the client boundary, added abortable 15-second request timeouts, preserved session-expiry events, removed the direct Firestore system-config fallback, and verified network/timeout/HTML/malformed-JSON/business/unauthorized states. Full suite: 454 tests passed; controlled browser/staging smoke remains pending |
| C9 observability | Synthetic implementation and verification complete; live trace smoke pending | Added bounded correlation/operation IDs, standardized safe error metadata, hashed actor/garage references, privacy-safe failure logs, deployment-health metadata, and `docs/OBSERVABILITY_RUNBOOK.md`. Full suite: 457 tests passed; build, TypeScript, maintainability, and diff gates passed. A deployed synthetic failed-request trace from Cloudflare through Railway logs remains required before the C9 exit gate is fully closed |
| C10 launch gate | Next bounded task | Assemble evidence-based release-candidate decision; do not claim launch readiness until live browser/API smoke, rollback, backup/restore, Firebase identity, billing controls, and unresolved C1/C2/C8 evidence are addressed |

## 9. What the owner needs to do

1. Enable Blaze on the intended Firebase/Google Cloud project if preserving the named database is the priority.
2. Configure budget alerts and, where applicable, spend caps. Treat alerts as notifications, not hard limits.
3. Confirm or create a separate staging Firebase project and Railway/Cloudflare staging environment.
4. Decide the locked/suspended garage checkout policy.
5. Provide controlled test accounts or approve their creation in staging.
6. Do not paste secrets into chat, GitHub, source files, or plans.

## 10. Success definition

RQ is ready for production when:

- the current app still works through the same topology;
- authenticated workflows pass in staging for every role;
- the server is the only authority for protected writes and financial operations;
- pure domain modules have tests and no infrastructure dependencies;
- duplicate requests cannot duplicate money or vehicle transitions;
- Firestore database identity and billing are explicit;
- rollback and observability are proven;
- the release candidate passes C10.

This is a repair-and-hardening program, not a restart. The vision remains intact; the implementation becomes dependable through checkpoints.

## Official billing references

- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Cloud Firestore pricing](https://cloud.google.com/firestore/pricing)
