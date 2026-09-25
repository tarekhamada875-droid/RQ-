# RQ V3 Backend Plan

**Status:** Active architectural guide; execution is governed by `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`

**Purpose:** Rebuild the real production backend incrementally around functional programming principles while preserving the existing production data model and HTTP compatibility until each capability is proven.

## Authority and scope

The legacy `server/` backend is the current production authority. V3 is the only future backend direction. The project scope includes the frontend, backend, Railway configuration and deployment, Firebase integration, tests, observability, and operational tooling whenever the required credentials or connectors are available.

The repository no longer contains a parallel backend implementation or generation-specific feature flags. Future agents must not recreate a parallel backend generation. V3 work happens behind the existing production routes first, then moves the route adapters toward the functional architecture one bounded capability at a time.

## Target architecture

```text
HTTP adapter
  -> authentication and request parsing
  -> typed command
  -> pure domain decision
  -> typed result or domain error
  -> Firestore adapter and transaction
  -> events and idempotency persistence
  -> compatible HTTP response
```

A pure domain function must not access Firestore, Express, `process.env`, the system clock, randomness, logging, or hidden mutable state. Time and identifiers are explicit dependencies. Firestore repositories and transaction orchestration remain imperative at the boundary.

## Migration order

1. Characterize the existing subscriber lifecycle.
2. Extract subscriber add, renew, update, and delete decisions.
3. Characterize and extract vehicle check-in.
4. Characterize and extract vehicle check-out.
5. Extract non-financial garage policies and deletion planning.
6. Extract authentication and authorization decisions.
7. Refactor reports and projections around typed reducers and adapters.
8. Refactor financial operations last, only after reconciliation, replay, transaction, and rollback evidence.

Financial operations must remain single-authority until an explicitly approved cutover. No dual-write is permitted during ordinary V3 development.

## First bounded slice: subscriber lifecycle

The first functional slice covers these existing routes:

- `/api/subscribers/add`
- `/api/subscribers/renew`
- `/api/subscribers/update`
- `/api/subscribers/delete`

Before changing runtime behavior, tests must characterize successful responses, invalid date ranges, garage-scope authorization, missing records, immutable plate behavior, same-payload idempotent replay, changed-payload idempotency-key reuse, transaction retry behavior, and event/idempotency persistence.

The pure module should live at `server/domain/subscriberLifecycle.ts`. It should receive explicit state and command values and return discriminated results such as `created`, `renewed`, `updated`, `deleted`, `not_found`, `invalid_date_range`, `immutable_plate_change`, and `idempotency_conflict`. Existing route adapters initially retain all Firestore reads, transactions, event writes, idempotency persistence, and HTTP response mapping.

## Validation gates

Every V3 slice must pass focused tests, the complete application test suite, TypeScript validation, ESLint validation, production build, maintainability checks, `git diff --check`, and a secret scan. A deployment slice must additionally pass the exact-commit Railway production smoke gate and document rollback evidence.

Do not claim deployment success from stale or unrelated artifacts. Never commit credentials, expose connector secrets in chat, or put protected values in source, logs, command arguments, or handoff documents.

## Railway operations

Railway is an active project deployment target. The repository owns the Railway build contract through `railway.json`, `Dockerfile`, `server/cloudRun.ts`, and the production gate. External Railway operations require an enabled connector or credentials supplied through a protected workflow. The expected operator variable name is `BACKEND_OPERATOR_TOKEN`; its value must never be printed or placed in Git.

## Recursive continuation protocol

The exact owner phrase `tokens ending` is a durable trigger. When it appears, the active agent must stop feature work, inspect the current SHA and working tree, record completed work and validation evidence, document blockers and connector state without exposing secrets, name exactly one bounded next task, write a copy-paste startup block for the next agent, validate the handoff, and publish the handoff before doing anything else. Every successor must repeat the same protocol and instruct the next successor to do the same.

## Explicit boundaries

The following are not ordinary implementation shortcuts: irreversible production deletion, untested production cutover, financial dual-write, secret exposure, and deployment without rollback evidence. If one is required, stop and obtain the appropriate explicit approval or protected credential path.

## Continuation packet — 2026-09-25 (`tokens ending` handoff)

The latest completed bounded slices are: (1) server-authoritative session refresh/release wiring published at `9629206`, (2) the C6 manual-credit route integration evidence recorded at `fb6e4d9`, (3) the C2 synthetic session route verification and root-marker fix, (4) C3 subscriber route hardening, (5) C4 vehicle authorization policy verification, (6) C5 operational policy verification, (7) C8 frontend API resilience, and (8) C9 observability hardening. C9 adds bounded correlation/operation IDs, safe API error metadata, hashed actor/garage trace references, privacy-safe failed-request logs, and `docs/OBSERVABILITY_RUNBOOK.md`. No UI/UX source or financial semantics were changed.

Validation evidence: C9 focused observability tests passed (7 tests), the full suite passed (457 tests across 82 files), TypeScript validation passed, the production build passed, maintainability validation passed, and `git diff --check` passed. Controlled browser/staging smoke evidence and a deployed synthetic failed-request trace from Cloudflare through Railway logs remain pending. Repository-wide ESLint remains a pre-existing baseline failure with 602 `no-explicit-any` findings across the repository; it was not introduced or resolved by this work. Firebase CLI/emulator validation remains unavailable in the environment, so live Firebase Auth/Firestore smoke evidence and Firestore rules still require a later pre-production/emulator validation pass.

The working tree is clean and `HEAD` matches `origin/main` at `490e8ff`. The protected **RQ Backend Operator** connector is enabled at UID `4735a906-68d1-44ba-85c7-b60dc6adfb6d`; it exposes only `backend_health` and `read_backend_endpoint` and returned HTTP 200 with `adminSdk: true`. Never expose or copy its protected credential. No production data mutation was performed.

### Exact next bounded task

The current execution order is in `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`. The owner has authorized the current Cloudflare Pages → Railway → Firebase deployment as controlled pre-production because there are no real users, customer records, or live financial data yet. C2, C3, C4, C5, C8, and C9 synthetic verification are complete, and C6 manual-credit integration is already complete; live Firebase Auth/Firestore, controlled browser smoke, and deployed failed-request trace evidence remain pending. C7 reconciliation is intentionally deferred until the accounting-period and source-of-truth policy is approved. Do not run reconciliation or repair scripts against unknown data. The next safe bounded task is **C10 launch-gate evidence assembly**, without changing UI/UX or financial semantics. Revisit separate staging before real users, revenue, customer data, or destructive migration.

### Copy-paste startup block

> Repository: `/home/ubuntu/RQ`. Read `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`, `V3_BACKEND_PLAN.md`, `docs/SUCCESSION_PROTOCOL.md`, and `AGENTS.md`. Verify `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and the latest validation result. Inspect the existing RQ Backend Operator connector (UID `4735a906-68d1-44ba-85c7-b60dc6adfb6d`) and verify `backend_health`; never request or expose `BACKEND_OPERATOR_TOKEN`. C6, C8, and synthetic C9 are complete. Do not start C7 reconciliation until the owner approves the accounting-period/source-of-truth policy; once approved, work only on read-only synthetic reconciliation. Start exactly one bounded task: C10 launch-gate evidence assembly, including the remaining live trace/browser/Firebase/rollback/backup/billing evidence. Preserve existing API response contracts and UI/UX; use synthetic/in-memory tests only unless the owner later authorizes a safe pre-production smoke test. Revisit separate staging before real users, revenue, customer data, or destructive migration. Do not mutate unknown data, change billing, or alter the named database. If the connector is missing, generate a new token locally and hand it off only through the protected Railway Variables workflow; never print the value. If the owner sends `tokens ending`, stop feature work and repeat `docs/SUCCESSION_PROTOCOL.md` before doing anything else, then tell the next agent to repeat it too.
