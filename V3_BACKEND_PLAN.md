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

## Continuation packet — 2026-09-24

The last completed bounded slice is the **manual-credit accounting hardening** published at commit `409619d0774a5093995a62f4044bab4d609f7a19`. It added `server/domain/manualCredit.ts` and focused tests, required fingerprinted idempotency for recharge approval and rejection, added server-only `manual_credit_ledger` records for approved balance credits and direct admin top-ups, sent idempotency keys from the frontend manual-credit actions, and blocked direct client/admin updates to authoritative garage financial fields in `firestore.rules`.

Validation evidence for that commit: focused manual-credit/idempotency/client tests passed (13 tests), the full test suite passed, TypeScript validation passed, the production build passed, `ci:check` passed, `maintainability:check` passed, and `git diff --check` passed. Repository-wide ESLint remains a pre-existing baseline failure with 602 `no-explicit-any` findings across the repository; it was not introduced or resolved by this slice. Firebase CLI/emulator validation was unavailable in the environment, so Firestore rules still require emulator validation.

The working tree was clean and `HEAD` matched `origin/main` at the published commit. The protected **RQ Railway Backend Operator** connector is enabled; never expose or copy its protected credential. No production mutation or deployment was performed for the manual-credit slice.

### Exact next bounded task

The current execution order is in `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`. The manual-credit route integration slice is complete in `server/manualCreditRoutes.integration.test.ts` with 9 passing tests covering duplicate approval/rejection replay, changed-payload conflict, duplicate direct top-up replay, unauthorized financial writes, atomic persistence, and concurrent approval behavior. The next safe task is **C1 staging boundary**: establish separate Firebase and Railway staging resources before authenticated workflow or reconciliation work. Preserve the current production `server/` authority, do not add a parallel backend, do not contact production data, and do not change financial semantics beyond what the tests prove.

### Copy-paste startup block

> Repository: `/home/ubuntu/RQ`. Read `AGENTS.md`, `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`, `V3_BACKEND_PLAN.md`, and `docs/SUCCESSION_PROTOCOL.md`. Verify `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and the latest validation result. Current published SHA: `962920651732feda65394d32790259f55190130c`. Use the RQ Railway Backend Operator connector only for protected read-only diagnostics; never request or expose its credential. Do not deploy or mutate production. The next safe task is C1 staging boundary; stop and report if separate Firebase/Railway staging access is unavailable. If the owner sends `tokens ending`, stop feature work and repeat `docs/SUCCESSION_PROTOCOL.md` before doing anything else, then tell the next agent to repeat it too.
