# RQ production plan

## Goal

Launch a real production application with one simple financial model, no active legacy billing paths, no hidden compatibility behavior, preserved UI/UX, and reliable behavior for the first ten garages.

## Owner-approved rules

- Garage billing: prepaid credits only.
- Trial: exactly 100 trial credits; no two-free-day logic.
- Monthly vehicle subscribers: remain active; no separate subscriber charge; use credits.
- Delegate commission: 100 EGP exactly once per garage after its first successful paid credit grant.
- Old garage subscription billing, duration/capacity packages, recharge requests, wallets/top-ups, old trial paths, and legacy commission paths: remove.
- Old subscription/recharge/package data: delete after inventory, backup, exact-scope confirmation, and bounded verification.
- No UI redesign. Remove only obsolete approved UI actions.

## Completed production slices

- **Ledger collision prevention — merged in `main` (`49e9fe6`, PR #225):** credit ledger IDs are scoped by garage, operation kind, and idempotency key, with regression coverage proving grants and restores cannot overwrite one another.
- **Subscriber lookup security — merged in `main` (`bdb7122`, PR #226):** lookup is authenticated, garage-scoped, and response-minimized so public callers cannot probe or receive private subscriber fields.
- **Vehicle type validation — in progress:** the check-in Worker accepts only the UI-supported `hourly` and `overnight` values, defaults omission to `hourly`, and rejects unknown values before any transaction work.

## Execution order

### 1. Documentation and model freeze

Keep this document as the product authority. Add fixtures for 100 trial credits, credit-based subscribers, and the one-time 100 EGP commission. Do not begin data deletion from assumptions.

### 2. Security and money blockers

Remove or secure the unauthenticated subscriber lookup. Reject unknown vehicle types before writes. Prevent ledger ID collisions. Fix failed-session readiness. Remove the unauthorized client counter-repair call. Enforce authentication, scope, validation, rate limits, and idempotency on all mutations.

### 3. One business truth

Centralize Cairo date-key handling. Make Worker check-in authoritative for subscriber eligibility. Make one daily read model authoritative for entries and exits. Separate current cars, entries, exits, gross revenue, refunds, and net revenue. Apply one refund policy consistently across counters, events, projections, and reports.

### 4. Financial migration

Reject retired fields and routes for new writes. Make 100 trial credits server-owned. Make subscriber renewals credit-based. Make the first-paid-grant marker and one-time 100 EGP commission transactional and idempotent. Make reports use canonical metrics.

### 5. UI and code removal

Remove old garage subscription controls, duration/capacity package controls, old recharge/request/wallet/top-up screens, obsolete commission paths, and two-day trial UI. Preserve active subscriber screens and existing visual behavior. Verify every remaining button has a supported route.

### 6. Data inventory and deletion

Inventory garages, balances, ledgers, packages, recharge/wallet records, events, activity logs, trials, subscribers, and delegate records. Show exact counts and predicates. Export a backup. Delete only approved legacy records in bounded resumable batches. Never delete active subscriber records, current prepaid balances, current ledger entries, current canonical events, or current commissions. Run a zero-residue scan afterward.

### 7. Reliability and scale

Deploy required indexes. Remove unbounded live-listener fallbacks. Add bounded pagination and maintained aggregates. Add route/read/write/latency/transaction/listener/fallback metrics, budget alerts, rollback, restore, and incident runbooks. Load-test ten garages against the actual deployment.

## Definition of done

The application passes focused regressions, full tests, lint, build, maintainability, Firestore rules tests, CI, security/replay tests, reconciliation tests, and the ten-garage load/cost test. The deployed Worker and ruleset are verified. No active UI or service can create retired financial records. Production backup and restore are tested.
