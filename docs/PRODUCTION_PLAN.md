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
- **Vehicle type validation — merged in `main` (PR #227):** the check-in Worker accepts only the UI-supported `hourly` and `overnight` values, defaults omission to `hourly`, and rejects unknown values before any transaction work.
- **Client counter repair — merged in `main` (`f9244be`, PR #228):** removed the garage client’s direct `carsInside` Firestore write; counter correction remains an explicit server-authorized maintenance operation.
- **100-credit trials — merged in `main`:** garage creation now treats the trial flag as a boolean, grants exactly 100 trial credits server-side, writes an immutable `trial_grant` ledger entry in the same transaction, and updates the maintained summary. Both creation forms no longer send trial days or advertise the retired two-day policy.

## Current position and immediate next slice

The security, financial-model, UI-removal, and legacy-write-path work completed so far is merged in `main`. By owner direction, **legacy-data inventory and cleanup are skipped and are not a current launch task**; do not spend time regenerating the missing `/home/ubuntu/firestore_legacy_inventory_2026-10-20.json`, and do not infer that legacy records are absent. No production data may be deleted or altered under this disposition. Reopen this work only if concrete evidence shows a material operational or reporting risk and the owner approves a new bounded scope. If data work is later authorized, exact-scope documentation, a verified backup, explicit owner confirmation, bounded resumable execution, and post-operation verification remain mandatory.

By owner direction, **Reliability and Scale is also skipped as a planned workstream**. The required-index/deployment work and ten-garage staging load/cost test below have not been completed; skipping them is not evidence that they passed or that scale readiness was demonstrated. Do not represent these items as verified. No production deployment or production-data change is authorized by this disposition. With the skipped workstreams excluded from the active plan, the next separate program is Operation Lean UI below.

With legacy-data cleanup and Reliability and Scale skipped by owner, **Operation Lean UI** is the next planned program; do not start it early because of UI file size or visual preference alone.

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

### 6. Legacy data inventory and deletion — skipped by owner

This slice is not currently needed and is not a launch prerequisite. Do not inventory or delete legacy records unless concrete evidence establishes a material operational or reporting risk and the owner explicitly reopens the work. The missing historical inventory must not be reconstructed just to satisfy this plan. If reopened, inventory garages, balances, ledgers, packages, recharge/wallet records, events, activity logs, trials, subscribers, and delegate records; document exact counts and predicates; verify a backup; and delete only explicitly approved legacy records in bounded resumable batches. Never delete active subscriber records, current prepaid balances, current ledger entries, current canonical events, or current commissions. Verify scope and residue after any approved operation.

### 7. Reliability and scale — skipped by owner

This workstream is not currently planned. The intended scope was to deploy required indexes; remove unbounded live-listener fallbacks; add bounded pagination, maintained aggregates, operational metrics, budget alerts, rollback/restore and incident runbooks; and load-test ten garages against the deployment. The report aggregate portion is implemented and has synthetic validation recorded in `docs/testing/RELIABILITY-SCALE-01-REPORT-AGGREGATE.md`. Required-index/deployment verification and the ten-garage staging load/cost test remain unperformed; the staging test contract is in `docs/testing/RELIABILITY-SCALE-02-STAGING-LOAD-TEST.md`. This owner-directed skip does not satisfy those checks, prove production readiness or authorize a deployment. Reopen the work only if the owner directs it.

## Successor plan: Operation Lean UI

**Operation Lean UI** is the next planned program after the active production-plan work. The owner-skipped legacy-data cleanup and Reliability and Scale workstreams are not prerequisites unless explicitly reopened. Their skipped status does not mean their associated cleanup, deployment, backup, restore, or load-test evidence exists. Operation Lean UI is a measurement-led UI performance and maintainability program, not a redesign.

### Operation Lean UI goals

- Keep the existing visual design, bilingual Arabic/English behavior, Egyptian license-plate identity, RTL/LTR layout, responsive behavior, and role flows.
- Reduce initial browser payload and avoid loading rarely used screens or modals before they are needed.
- Reduce unnecessary rerenders, duplicated derived-list work, duplicate data requests, and duplicate live listeners.
- Make large components easier to maintain without splitting files solely for appearance.
- Optimize only measured bottlenecks and preserve behavior through focused regressions.

### Operation Lean UI execution order

1. **Baseline authenticated screens.** Capture reproducible mobile and desktop measurements for the garage dashboard, admin dashboard, subscribers view, garage details, delegate dashboard, history, and financial calculator surfaces. Record first render, interaction latency, DOM size, network requests, active listeners, and relevant browser signals.
2. **Rank actual bottlenecks.** Use the baseline and production-safe synthetic fixtures to identify the single worst screen or interaction. Do not optimize from source-file size alone.
3. **Optimize the first bottleneck.** Select one bounded change, such as lazy-loading a rarely opened modal, reducing unrelated `allGarages` prop plumbing, memoizing repeated derived lists, splitting a responsibility-heavy component, or virtualizing a genuinely long list.
4. **Verify behavior and performance.** Add focused regression coverage, repeat the same baseline, compare the before/after measurements, and confirm no listener, authorization, pagination, financial, or bilingual behavior regressed.
5. **Repeat in small slices.** Only start another optimization after the previous one is merged and its measured benefit is documented in the canonical testing record.

### Operation Lean UI guardrails

- No broad UI rewrite, visual redesign, framework migration, or speculative memoization.
- No weakening of server authority, authentication, authorization, scope checks, rate limits, idempotency, or data minimization.
- Prefer route-level and interaction-level lazy loading over hiding active functionality.
- Treat Firebase, vendor dependencies, CSS, and application chunks as separate measurements.
- Preserve synthetic-fixture isolation; do not use production customer data for profiling.
- Every slice requires focused tests, `npm run ci:check`, `npm run maintainability:check`, a production build, `git diff --check`, a focused branch and PR, and a successful hosted Production Gate before merge.

## Definition of done

The intended production-readiness criteria include focused regressions, full tests, lint, build, maintainability, Firestore rules tests, CI, security/replay tests, reconciliation tests, ten-garage load/cost evidence, and verification of the deployed Worker and ruleset. The owner has skipped the Reliability and Scale workstream; its deployment and ten-garage test evidence remain absent and must not be described as passed. This plan change alone does not certify production readiness or authorize a production deployment. No active UI or service should create retired financial records, and production backup and restore should be tested before destructive data work or launch.
