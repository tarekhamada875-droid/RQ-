# RQ V3 Backend Plan

**Status:** Active implementation plan

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
