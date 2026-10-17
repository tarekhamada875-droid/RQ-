# Project JARVIS — RQ Maintainability, Cost & Performance Plan

**Baseline:** checkout `9d0c705f21311902cb9bc956dc94d8cf87b66ea5` (main, after PR #34)
**Review mode:** read-only synthesis of the eight supplied area reviews
**Date:** 2026-10-14
**Audience:** product owner, engineering owner, and the future coding agent

**Current delivery status (2026-10-14):** The plan began as a read-only review. After the owner approved autonomous implementation of the roadmap, **AUTH-01** was delivered in PR #35 and deployed to `main` at `e53b2cba40218fc694de2528db71f45791cf629c`. Protected Admin, Delegate, Garage, and Staff Worker requests now require an active server session; session validation checks only the caller's role collection. The local gate passed 105 test files / 645 tests plus production build and maintainability checks; GitHub's production gate, Firestore rules emulator suite, Worker deployment, and live health smoke all passed. Other roadmap items remain open unless a later dated status says otherwise.


**Current delivery status (2026-10-15):** **FS-01** is merged in PR #53. **FS-06** is merged in PR #54 at `c1296d7aba9958acdd6714e8f161e74b93fcd827` and deployed; its post-merge Production Gate, Worker deployment, and live smoke passed. **RULES-02** and **SPIKE-01** are merged in [PR #55](https://github.com/tarekhamada875-droid/RQ-/pull/55) at `20873e3306d7472621005e4ff20cfcb06e43c9c2`. Production Gate run `38776681656` and Worker deployment/smoke run `38776681671` succeeded. Live read-only smoke returned HTTP 200 for Pages/Worker health/version, 401 for anonymous system-config, and 403 for the production-disabled spike read. No Firebase rules/documents or Cloudflare diagnostic bindings/secrets were changed.

**Firestore rules implementation status (2026-10-14):** **RULES-01** and the scoped **TEST-01** emulator matrix were merged to `main` by PR #37 at `2f3a61c67a8f93395cae9069d2fd2d1e71071808`. Local checks, the main-branch Production Gate, and the post-merge Cloudflare Worker workflow all passed. Staff cannot directly create/delete records or change sensitive fields; owners/Admins retain only validated name/phone edits in direct rules, while role/PIN/garage assignment changes remain on the Worker. Protected garage settings require an active owner or Admin session; staff retain only the narrow heartbeat update. The emulator covers Admin, owner, staff, delegate, sessions, `system_config`, cross-garage denial, and retired Supervisor behavior. On 2026-10-14, after the owner's explicit approval, the exact `main:firestore.rules` source (39,098 bytes; SHA-256 `8404b6a6cd833deaa4192e164a43cf2f2916e38840ce52fbce650feac4634d24`) was published in Firebase Console to project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`. A fresh reload matched that hash and showed no unpublished draft. This deployment changed rules only, not Firestore documents, and applies only to this exact target; do not infer that any other Firebase project/database was updated.

## 1. Executive explanation

The product is working, but several parts are harder and more expensive to change than they need to be. The biggest risks are:

1. **Security boundaries:** some privileged requests can rely on a token role claim instead of a live server session, and Firestore rules are broader than the Worker authorization policy in a few staff/garage cases.
2. **Avoidable Firebase work:** some screens and requests read the same data more than once, listen to the same collection more than once, or read whole collections when a bounded page or summary would do.
3. **Retry and data correctness:** one delete/refund idempotency path uses the wrong scope; malformed money values can poison reports; and some day/package rules are duplicated or trust callers too much.
4. **Change cost:** `server/cloudflareWorker.ts` is a 4,912-line route monolith, `src/services/adminService.ts` is a 710-line mixed service, and `useGarageApp` exposes about 94 flat values. These should be decomposed in small, behavior-preserving moves—not rewritten in one large change.
5. **Release confidence:** the main-push workflows repeat expensive verification, deploy and smoke are not one immutable-commit chain, and one health check accepts a response that merely contains the word `status`.

This plan sequences the safest correctness and security fixes first, then measures and reduces Firebase reads/writes, then performs incremental decomposition. **No 10x, 50x, or other large speed/cost claim is made without the benchmarks specified below.**

> **Current billing-model direction (owner-approved 2026-10-16):** Replace time-based RQ garage-access plans, including the existing seven-day feature from PR #34, with manually granted, non-expiring prepaid entry credits. Keep the current implementation only until a separately tested and approved cutover; do not retain two competing RQ billing models as the end state. This does **not** replace the date-based monthly subscriptions that garages sell to their own parking customers. This roadmap update records the direction only; it does not change application code or data.

## 2. Review boundary and original read-only review status
### Boundary

The synthesis covers exactly these eight review areas:

1. Frontend screens, forms, mobile usability, and state composition.
2. Frontend services, hooks, Firestore reads/writes, and listener callsites.
3. Hono Worker API structure, route composition, and request performance.
4. Subscription, garage, vehicle, subscriber, and financial domain flows.
5. Authentication, authorization, sessions, backend operator access, and Firestore rules.
6. Firestore schema/indexes, Worker Firestore adapter, and backend query/read design.
7. Tests, release gates, build scripts, and developer feedback loop.
8. Cross-cutting code-size hotspots, coupling, and decomposition sequence.

The source material identifies the checkout as clean at commit `9d0c705...`, with no files changed during the reviews. The supplied review confidence is high for every area. The source-backed findings include concrete file/line references and proposed tests; this document keeps those references rather than adding new area-level research.

### Status when this review was first published

At publication time, this report made **no application, database, rules, workflow, or configuration changes**. It was a roadmap only. AUTH-01 has since been implemented as documented below; the rest of the roadmap remains planning guidance. Each future task should remain a separate, reviewable change with its listed acceptance tests.

## 3. What is verified versus what is a hypothesis

### Verified facts from the reviews

- The baseline is checkout `9d0c705...` after PR #34; the seven-day subscription is already on main.
- The Worker has 4,912 lines and 87 route registrations; `server/api.ts` is the stable Fetch-native composition point.
- `src/services/adminService.ts` has 710 lines, 55 methods, 22 `apiFetch` calls, 9 `onSnapshot` calls, and 7 `getDocs` calls; the merged `firestoreService` facade is referenced by 40 source files.
- `src/hooks/useGarageApp.ts` is 442 lines and returns approximately 94 flat members; `src/App.tsx` binds 85 values from it and passes 28 direct props to `GarageDashboardView`.
- The reviews found concrete duplicate listeners/reads, unbounded collection reads, a fallback-listener cleanup defect, an idempotency-scope defect, authorization/rules mismatches, missing-index risks, and release-gate gaps. Exact references are in the task register below.
- Existing bounded behavior that must remain includes the 200-record activity cap, subscriber pagination, Cairo-day boundaries, resumable 200-record garage deletion, idempotency/optimistic rollback behavior, and existing response envelopes unless a task explicitly changes a contract.

### Hypotheses requiring measurement

- Any percentage improvement in latency, Worker CPU, memory, Firestore cost, or runner minutes.
- The exact savings from session indexes, summary documents, canonical subscriber lookups, streaming, route extraction, or shared listeners.
- Whether a summary counter remains fresh under every add/renew/delete/check-in/check-out path.
- Whether a new page size is acceptable to users and whether a default financial-report window is acceptable to the product/finance owner.
- Whether moving subscriber lookup into the check-in transaction improves or worsens contention.

The acceptance criteria below therefore use count, parity, correctness, and bounded-behavior gates first. Performance targets are proposed measurement targets, not promises.

## 4. Eight-area scorecard

| Area | Current evidence | Material findings | Priority posture | Owner outcome |
|---|---|---:|---|---|
| Frontend screens/forms/state | Clean checkout; large route shell; major forms and overlays have accessibility, retry, listener, and scroll-lock gaps | 6 | P1/P2 | Preserve mobile behavior while making failure/retry, naming, listeners, and route ownership safer |
| Frontend services/hooks/Firestore callsites | Most hooks unsubscribe and some reads are bounded, but several duplicate/unbounded paths remain | 5 | P1/P2 | Reduce duplicate startup/read/listener work and make admin lists bounded |
| Worker API/composition/request performance | Fetch contract and 11/11 bounded API tests pass; 4,912-line Worker has unbounded summaries, auth fan-out, and buffering | 5 | P1/P2 | Bound hot requests and extract routes mechanically |
| Domain flows | 8 files/38 bounded tests pass; pure domains are generally good, but four correctness risks remain | 4 | P1/P2 | Make retries, dates, package classification, and money invariants explicit |
| Auth/rules/operator access | Deliberate server sessions exist, but claim bypass, broad rules, public config, pseudo-rules tests, and spike endpoints remain | 6 | P1/P2 | Align all privileged access with one enforceable authority |
| Schema/indexes/query design | Some caps/indexes exist; Worker adapter lacks cursors and several endpoints scan whole collections | 6 | P1/P2 | Add missing index, prevent silent fallback corruption, and introduce bounded pages |
| Tests/release/build loop | 105 files/640 Vitest tests; rules and smoke are separate; duplicate verification and weak health check | 6 | P1/P2 | Make one SHA-bound, reproducible release gate |
| Cross-cutting decomposition | Worker, admin service, and app hook are high-coupling hotspots | 3 | P1/P2 | Split behind compatibility facades and route inventories |

**Finding count:** 41 review findings. Some findings intentionally overlap (for example, the Worker session fan-out is discussed under API performance and auth, and decomposition repeats the file-size evidence). They remain separate tasks only where the proposed implementation or acceptance gate differs.

## 5. Dependency-ordered roadmap

### Phase 0 — Baseline and safety rails (before behavior changes)

**Goal:** make current behavior measurable and make every later PR easy to roll back.

- Capture the 87 method/path route inventory, response envelopes, TypeScript/build status, bounded Worker tests, Firestore rule test status, and current CI runner-minute/read-count baselines.
- Add read-count/latency instrumentation or deterministic mocks for session resolution, summaries, subscriber lookup, system config, and the listed admin collections. Do not change behavior in the instrumentation PR.
- Add an explicit PR rule: one finding or one tightly coupled acceptance gate per PR; no simultaneous Worker extraction + service facade migration + App contract migration.
- Preserve the current public routes, aliases, Hono default fetch export, Firestore paths, and time-based RQ garage billing only until the tested prepaid-credit cutover; preserve historical records.

**PR-sized deliverable:** `P0-01 Baselines and route/read inventories` (S/M). Rollback is removal of instrumentation and generated reports; no product behavior changes.
### Phase 1 — Security and correctness blockers

Implement in this order:

1. **AUTH-01:** require live server-session resolution for privileged Worker roles.
2. **RULES-01 and TEST-01:** tighten same-garage staff/garage rules and test the actual rules in the emulator.
3. **F1:** separate delete/refund idempotency scopes and fingerprints.
4. **F4:** establish finite, non-negative money-event validation.
5. **UI-002:** preserve failed admin-garage drafts.
6. **FE-003, FE-005, FE-004:** stop delegate polling self-trigger, clean fallback listeners, and remove duplicate staff-login read.
7. **FS-01 and FS-06:** deploy the missing staff index and remove/contain silent activity-log degradation.
8. **RULES-02 and SPIKE-01:** project public config fields and close unauthenticated diagnostic surfaces.

**Status (2026-10-15): Phase 1 is complete.** All listed work is merged. UI-002 merged in [PR #48](https://github.com/tarekhamada875-droid/RQ-/pull/48) at `6c5993fb28fd58311e346ab45c8789eebdba896c`; its post-merge Production Gate run `38710169798` and Cloudflare Worker deployment run `38710169831` succeeded.

**Exit gate:** no privileged route succeeds with a stale/missing session; emulator matrix passes; same-key different-operation requests are rejected; malformed monetary events cannot produce non-finite totals; failed forms retain drafts; listener/read-count regression tests pass; required index behavior is explicit.

### Phase 2 — Accessibility and bounded frontend data flow

1. **UI-003 and UI-004:** accessible names for form fields and icon-only controls.
2. **UI-005:** one garage-scoped listener for dashboard plus overlays.
3. **UI-006:** reference-counted body scroll lock.
4. **FE-001:** one system-config owner, preserving wallet/local-storage guards.
5. **FE-002:** paged admin garage/delegate lists with explicit totals/search contract.

**Exit gate:** axe/name tests pass, nested overlay locks are safe, config mount has one listener/API fallback, duplicate garage listeners are gone, and admin first-page behavior is bounded without under-reporting totals.

### Phase 3 — Backend read/cost controls

1. **FS-05:** defer unused stored dashboard summary read.
2. **FS-04:** deterministic subscriber lookup inside check-in transaction.
3. **WKR-03:** shared subscriber lookup and conditional legacy fallback.
4. **WKR-01 and PERF-01:** canonical session index with legacy fallback and parity telemetry.
5. **WKR-02:** maintained summary documents/counters with dual-read parity and rebuild path.
6. **FS-03:** define report window, then cursor-page financial aggregation.
7. **FS-02 and WKR-04:** cursor-capable adapter, bounded endpoints, and streamed Node responses.

**Exit gate:** dedicated Firebase read/write-cost plan below reports before/after counts; all fast paths have parity against current full scans; missing/stale summaries and legacy records have recovery behavior; no unbounded normal path remains where the task says it should be bounded.

### Phase 4 — Replace time-based RQ garage billing with prepaid entry credits

**Owner-approved direction (2026-10-16; Admin-direct-grant flow clarified 2026-10-17):** The garage’s RQ access uses a non-expiring credit balance. One credit costs 1 EGP. A successful regular, non-subscriber vehicle entry consumes one credit; checkout does not refund it. The Admin package editor remains as an Admin-only template catalog for credit quantities and prices, without durations; garage owners do not select or purchase packages. After confirming offline payment, Admin directly grants the chosen template quantity or an entered integer amount. Retire the EGP-wallet-top-up-to-owner-package-purchase path at cutover; BILL-01 must determine how any legacy EGP balance is preserved and whether it has an independent use. A garage’s own monthly parking subscriber remains date-based: renewal consumes five credits once, and that subscriber’s normal visits do not incur per-entry credit debits. Subscriber arrivals and departures still need operational records and staff feedback. The three free mistake/correction events are shared by the whole garage across staff for a Cairo calendar day—not three per staff member.

**Referral reward decision (owner-approved 2026-10-17):** Replace the legacy referral reward of subscription days with **20 non-expiring referral credits**, each covering one successful regular, non-subscriber vehicle entry. Award them once to the referring garage when the referred garage receives its first Admin-confirmed paid credit grant. Do not award for a complimentary/unpaid grant, a self-referral, or later paid grants to the same referred garage. These referral credits cannot pay for the five-credit monthly parking-subscriber renewal. Track the referral award and its use distinctly from EGP received and paid-credit grants; enforce one award per referred garage with server-authoritative idempotency. This replaces the legacy duration/15-day package eligibility condition at cutover. Existing day-based referral behavior remains unchanged until the tested, owner-approved billing cutover.

This is an intentional product and financial-contract change, not a compatibility-preserving refactor. The remaining Phase 3 bounded-read work (FS-02 and WKR-04) is complete. The next roadmap item is the BILL-01 contract and cutover decision gate; do not begin billing implementation until its product decisions are recorded. Execute this phase before general domain cleanup and large-file decomposition. Do not implement the billing transition as a second permanent model running alongside time-based access.

1. **BILL-01 — Finalize the billing contract and cutover policy (decision gate).** Confirm zero-credit behavior for new entries, insufficient-credit monthly renewals, exactly which actions count as a “mistake,” what happens after the shared three-event allowance, handling/reversal of erroneous entries, treatment of existing active time plans, disposition and any independent uses of legacy EGP wallet balances, and whether package discounts or operational daily-capacity limits remain. Referral reward policy is decided: award 20 non-expiring referral credits, usable for 20 regular non-subscriber entries only, once when a referred garage receives its first Admin-confirmed paid credit grant; exclude unpaid/complimentary grants, self-referrals, repeat paid grants, and subscriber renewals. The owner has now also decided the paid/referral debit rule, active-plan conversion, wallet conversion, correction behavior, discount policy, and capacity retirement below. Compare representative garages’ expected monthly cost with the current model before enabling the new rate. No schema migration or customer-facing cutover before the implementation gates are passed.

#### BILL-01 decision record — approved 2026-10-17

The owner has now selected the policies below. This closes the product-decision portion of BILL-01, but it does not itself perform implementation, migration, or cutover. BILL-02 through BILL-08 remain separate, reviewable tasks.

| Decision | Approved contract / implementation rule | Current state |
|---|---|---|
| Regular entry with zero credits | Reject the entry before creating it; do not create a negative balance. | **Decided — block the entry.** |
| Monthly parking-subscriber renewal with fewer than five credits | Block the renewal; no grace/debt balance or automatic bypass. Later subscriber visits remain non-debiting. | **Decided — block the renewal.** |
| What is a mistake/correction event | Only an authorized vehicle deletion/refund counts. Failed requests, duplicate check-ins, checkout corrections, and other actions do not consume the allowance unless separately approved later. | **Decided — three vehicle deletion/refund events per garage per Cairo day, shared across staff.** |
| After the third shared event | Block further staff corrections until the next Cairo day. | **Decided — no paid bypass or per-staff reset.** |
| Erroneous entries and refunds | Admin-only vehicle deletion/refund; restore the consumed credit, including the applicable paid/referral credit record; no cash/EGP refund. Preserve source history and audit/idempotency records. | **Decided.** |
| Active time-based RQ plans at cutover | Convert remaining plan value at 10 credits per remaining plan day: `10 × remaining days`. For example, three remaining days become 30 credits. | **Decided — convert, not honor as a parallel time plan.** |
| Legacy EGP wallet balances | Convert using the approved `1 EGP = 1 credit` rule while preserving the historical monetary record. | **Decided — convert; do not delete or silently reinterpret value.** |
| Discounts and bonus credits | No discounts or bonus credits. | **Decided.** |
| Daily vehicle capacity | Retire the separate daily vehicle-capacity limit at cutover. | **Decided — do not encode capacity in credit expiry or bundle quantity.** |
| Debit order for eligible regular entries | Paid and referral credits have no priority or user/Admin choice between them for eligible regular entries. Referral credits remain separately auditable and cannot pay subscriber renewals. | **Decided — interchangeable for eligible regular entries, restricted by purpose.** |

Before implementation, retain the plain-language examples above, identify affected historical records, document rollback/support treatment, and compare representative garages’ expected monthly cost against the current model. The decision record does not itself execute code, migration, or cutover; those remain subject to the BILL-02 through BILL-08 release gates and explicit cutover approval.
2. **BILL-02 — Add an auditable prepaid-credit ledger (bounded foundation implemented 2026-10-17).** The pure integer-only ledger contract now models Admin-confirmed paid grants, the one-time 20-credit referral award, one-credit regular-entry debits from the combined eligible pool, five-credit subscriber-renewal debits from paid credits only, and authorized correction restores. Each transition carries garage, actor, reason/reference, timestamp, and idempotency-key fields; paid and referral balances remain separate and referral credits are not eligible for subscriber renewals. Focused tests cover no negative/overflow balances, award eligibility, subscriber restriction, correction restoration, and deterministic entry identity. Worker route integration, Firestore transaction wiring, migration, and cutover remain bounded to BILL-03 through BILL-08; no existing billing behavior changed in BILL-02.
3. **BILL-03 — Convert Admin package definitions to non-expiring credit bundles (bounded foundation implemented 2026-10-17).** The Admin package catalog now validates and stores an explicit `catalogType: credit_bundle`, integer `creditQuantity`, and price; the Admin entry points no longer collect duration, daily capacity, or discounts for new templates. Legacy time-based records remain visible for review and compatibility until cutover. Credit templates are excluded from the garage owner’s legacy self-purchase selector. Example quantities such as 40, 100, 200, or 400 remain examples, not a required catalog. Template selection does not confirm payment or grant credits; Admin-confirmed direct grants, credit-ledger wiring, and audit history are implemented in the separate BILL-06 branch below. No migration, automatic payment, owner checkout, or customer-facing cutover changed in BILL-03. Keep any true operational vehicle-capacity limit separate from the credit bundle.
4. **BILL-04 — Charge regular vehicle entries and enforce the shared mistake allowance (bounded implementation verified 2026-10-17).** The opt-in `prepaid_credits` check-in path now debits one paid-first/interchangeable credit atomically with a successful regular check-in, never on checkout; it preserves vehicle, occupancy, projection, and audit writes and records the paid/referral source in `credit_ledger`. Zero-credit entries are rejected before vehicle creation; subscriber-authoritative check-in attempts do not debit. Authorized vehicle deletion/refund restores the original credit bucket in the same transaction with an auditable correction entry. The existing shared three-event Cairo-day staff correction allowance is covered at its boundary. The garage balance card shows paid/referral/total credits above the plate input, announces the updated balance, emphasizes a confirmed debit in red, animates downward arrows only after a server-confirmed debit, and respects reduced motion. Legacy time-based garages remain unchanged until cutover; manual grants, subscriber-renewal debits, migration, and production cutover remain later tasks.
5. **BILL-05 — Debit monthly parking-subscriber renewals (bounded implementation verified 2026-10-17).** The opt-in `prepaid_credits` renewal path now debits exactly five paid credits atomically with a successful monthly renewal, blocks the renewal when paid credits are insufficient even if referral credits exist, returns the remaining balance, and records a distinct auditable `subscriber_renewal_debit` ledger entry. Idempotent retries return the cached result without a second debit or renewal event. Later subscriber entry/exit operations remain non-debiting. Legacy time-based renewals remain unchanged; Admin grants, reporting, migration, and cutover remain later tasks. Subscriber membership expiry, visitor recognition, occupancy, and activity/history remain distinct from garage RQ credit expiry.
6. **BILL-06 — Add the manual Admin grant and garage credit experience.** After Tarek confirms the external payment, an authorized Admin directly grants the selected template quantity or an entered amount through the Worker. Garage owners do not purchase packages or top up an EGP wallet to activate credits. Show remaining non-expiring credits and clear grant/usage history in the garage/Admin screens; the garage view is for balance/status, not checkout. Do not add automatic payments.
   **Implementation checkpoint (2026-10-17; PR #101 merged):** Added an Admin-only Worker grant route for an already `prepaid_credits` garage, supporting an active credit-bundle template or positive entered integer, explicit offline-payment confirmation, reference, reason, and idempotency. The transaction updates only the paid-credit bucket and writes auditable ledger/activity records. The first-paid-grant marker is recorded once; it awards a distinct 20-credit ledger entry only when the referrer is already prepaid-enabled and records `referrer_not_prepaid` otherwise. Admin details expose up to 50 scoped history entries with audit fields; garage users receive only amount/bucket/balance/time/kind. The Worker was deployed on merged main commit `f99a67b2e7023d61d36fd1df1f27c40cf9bbc071`; post-merge Production Gate [39033339698](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39033339698) and Worker deployment/health smoke [39033339649](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39033339649) passed. With owner approval, Firestore composite index `credit_ledger(garageId ASC, occurredAt DESC)`, collection scope, was created and verified Enabled (index ID `CICAgJj7z4EK`) in project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`. No Firestore documents/rules, migration, Pages deployment, automatic payment, reporting change, or customer-facing cutover occurred. Local validation passed (11 focused tests; full 130-file/856-test CI; maintainability and diff checks). BILL-07 was subsequently owner-authorized on 2026-10-17; its separate implementation checkpoint follows.
7. **BILL-07 — Extend financial reporting without mixing units.** Report EGP received/recorded separately from credit grants, credit consumption, and subscriber renewals. Extend the bounded report contract and audit trail; do not reinterpret or rewrite historical money events or combine “credits” and “EGP” into one balance. Preserve F4’s money validation and add integer-credit invariants.
**BILL-07 implementation checkpoint (2026-10-17; PR #103 open, checks pending, not merged or deployed):** Owner clarified that the money is transferred outside RQ, then Admin records the amount already received and confirms it; the owner approved a strict 1 EGP per credit. Manual grants now require the verified integer EGP amount to equal the credit quantity, and atomically write the payment amount to the Admin-only ledger plus a new immutable payment event. New credit-bundle prices must also equal their credit quantities. The bounded financial report adds a separate EGP receipts total and separate integer credit grant, referral, entry, renewal, correction, and historical-unrecorded-amount metrics; existing cash/net-revenue totals and partner-dividend math remain unchanged. The bilingual Admin report card displays EGP and credits separately. Historical paid grants without a saved payment amount remain explicitly identified as unrecorded rather than inferred. Focused validation passed (132 tests); full `npm run ci:check` passed (131 files / 872 tests, including TypeScript, rules/build/artifact gates); `npm run maintainability:check` and `git diff --check` passed. No production data/rules, migration, payment, deployment, or cutover changed.

8. **BILL-08 — Cut over and retire time-based RQ access.** First rehearse the migration on synthetic fixtures and choose how currently active time plans are honored or converted. Preserve historical records. Only after parity, authorization, accounting, support/rollback, and owner cutover approval may new RQ access stop using `balanceExpiry`, duration-based offers/filters, the legacy day-based referral reward and claim path, the owner-side package purchase/activation path, and the EGP-wallet-top-up-to-package flow. Keep the garage’s own monthly parking subscriptions time-limited.

**Acceptance and test gates:** transaction-level tests for grants/debits, concurrent check-ins, retry/idempotency, no negative balance, and subscriber renewal; referral reward eligibility, first-paid-grant trigger, one-award-per-referred-garage idempotency, 20-entry exhaustion, and prohibition on subscriber-renewal use; shared allowance boundary tests with multiple staff and Cairo midnight; zero-credit/insufficient-credit behavior; proof checkout is not blocked by a lack of entry credits; old and new reports reconcile without changing history; Admin-only direct-grant authorization and audit fields, no owner package-checkout path, debit-only balance animation; synthetic migration rehearsal using the approved 10-credits-per-remaining-day and 1-EGP-per-credit conversions. These are now implementation acceptance tests, not open product decisions.

**Explicitly retire at cutover:** time-expiring RQ garage-access plans, their duration-based package filters/pricing/expiry display, the legacy referral reward measured and claimed as subscription days, the garage-owner package purchase/self-service activation and EGP-wallet-top-up-to-package flow, and the separate daily vehicle-capacity limit. Do not delete historical EGP money events; convert legacy EGP wallet value at the approved 1 EGP-to-1-credit rule while preserving the historical record. Keep garage customer monthly-subscription dates.

### Phase 5 — Domain consistency and release reliability

1. **F2:** make reconciliation day-safe even with a wider/malformed input array.
2. **F3:** one package-unlimited classifier.
3. **RQ-TG-01 through RQ-TG-06:** one SHA-bound release DAG, strict smoke, pinned emulator CLI, artifact smoke, and fail-fast local gate.

### Phase 6 — Incremental decomposition

1. **Cross-F1 / WKR-05:** extract read routes, then vehicle, subscriber, financial/recharge/delegate, and garage route factories.
2. **Cross-F2:** split `adminService` behind unchanged `firestoreService` keys; only then change system-config transport policy if still needed.
3. **Cross-F3 / UI-001:** characterize `useGarageApp`, group its return contract, and move App route/overlay ownership one route at a time.
## 6. Detailed task register

Each task below is a PR-sized unit. “Keep” statements are compatibility requirements, not optional polish.

### A. Frontend screens, forms, mobile usability, and state composition

#### UI-001 — Move route and overlay ownership out of App

- **Source:** `src/App.tsx:48-135`, `src/App.tsx:171-205`, `src/App.tsx:200-393`, `src/App.tsx:483-575`; `src/components/admin/AdminNavigationAndViews.tsx:32-61`; `src/components/admin/AdminDashboard.tsx:420-460`.
- **Simple explanation:** App currently knows 85 hook values, 28 garage-dashboard props, the route decision tree, and the global modal set. A screen change therefore crosses the global shell.
- **Implementation design / behavior to keep:** Add typed `GarageRoute` and `AdminRoute` containers. Keep App responsible only for auth/session gates, route choice, `useBackTrapping`, and a small typed session/action model. Keep `useGarageApp` authentication and mutations compatible; move one route at a time. Preserve route names, back behavior, RTL/LTR, custom plate keyboard, pagination, modal callbacks, and mount/unmount semantics unless tests explicitly characterize a change.
- **Expected benefit:** One route-level owner, shorter prop chains, and route tests without mounting the whole application; fewer unrelated renders are a target to measure, not a promise.
- **Acceptance criteria:** Before: 85 bindings, 28 direct dashboard props, 578-line App. After target: no more than 15 direct App bindings, 8 route-boundary props, App at most 300 lines; AST/stable script records counts. A render-count test shows a garage-local overlay toggle does not re-render the login/admin route container.
- **Test plan:** Route-container tests for login, garage, delegate, admin, both admin-detail fallbacks; back-navigation tests for each modal/overlay; action contract tests for check-in, checkout, delete, logout.
- **Risk / rollback:** Medium—mount timing and browser back behavior can change. Move one route per PR; revert the route container and retain the old App wiring if its contract tests fail.
- **Effort:** L.

#### UI-002 — Preserve add-garage draft after failed save

- **Source:** `src/components/admin/AdminAddGarageModal.tsx:121-150`; `src/components/admin/AdminDashboard.tsx:268-277,473-485`; `src/components/admin/AdminDashboard.test.tsx:45-47`.
- **Simple explanation:** A failed `createNewGarage` result resolves as `undefined`, but the modal clears six draft values anyway.
- **Implementation design / behavior to keep:** Make `onSubmit` return `Promise<boolean>` or a typed success result. Parent returns false on failed create and true only on success. Modal clears local/lifted form and PIN state only for true; false or rejection leaves modal open and values intact. Keep current mutation/toast and success-close behavior.
- **Expected benefit:** Users can retry without retyping rates, phone, name, and eight-digit PIN, especially on mobile.
- **Acceptance criteria:** False result clears 0 form values and leaves modal open; success clears/closes once. Test name, rates, phone, and PIN unchanged after false.
- **Test plan:** Direct modal controlled-draft false/true tests; parent handler tests for `createNewGarage` false/true and rejected promise.
- **Risk / rollback:** Low—avoid clearing in exception paths; revert contract change if success behavior differs.
- **Effort:** S.
- **Implementation status (2026-10-15):** Merged in [PR #48](https://github.com/tarekhamada875-droid/RQ-/pull/48) at `6c5993fb28fd58311e346ab45c8789eebdba896c` and deployed. The modal clears its local and parent-held draft only when creation returns `true`; failures keep the draft and report unexpected rejections without closing the modal. Regression tests cover false/rejected outcomes and successful close/clear behavior. Post-merge Production Gate run `38710169798` and Cloudflare Worker deployment run `38710169831` succeeded; no Firebase rules or data changed.
- **Verification:** Local `npm run ci:check` passed (109 test files / 739 tests, TypeScript, and Pages/Worker production build); `npm run test:rules` passed against the local demo emulator; `npm run maintainability:check` and `git diff --check` passed. The focused UI tests and TypeScript check also passed after a final test-type refinement.

#### UI-003 — Add programmatic names to primary form controls
 - **Source:** `src/components/admin/AdminAddGarageModal.tsx:153-200,263-298`; `src/components/admin/AdminPackagesView.tsx:358-424,426-442`; `src/components/garage/RegistrationCard.tsx:126-153`; `src/components/garage/SubscribersView.tsx:478-487`.
 - **Simple explanation:** Visible labels are not associated with controls; transparent plate input and subscriber search lack reliable names.
 - **Implementation design / behavior to keep:** Add unique IDs/`htmlFor` or a small Field wrapper. Add a localized accessible name and description for the transparent plate input; add a visible or visually-hidden search label. Keep custom plate rendering, keyboard, RTL/LTR, and filtering unchanged.

- **Source:** `src/components/admin/AdminAddGarageModal.tsx:153-200,263-298`; `src/components/admin/AdminPackagesView.tsx:358-424,426-442`; `src/components/garage/RegistrationCard.tsx:126-153`; `src/components/garage/SubscribersView.tsx:478-487`.
- **Simple explanation:** Visible labels are not associated with controls; transparent plate input and subscriber search lack reliable names.
- **Implementation design / behavior to keep:** Add unique IDs/`htmlFor` or a small Field wrapper. Add a localized accessible name and description for the transparent plate input; add a visible or visually-hidden search label. Keep custom plate rendering, keyboard, RTL/LTR, and filtering unchanged.
- **Expected benefit:** Screen readers and mobile automation can identify controls; tests can use names rather than placeholders.
- **Acceptance criteria:** All cited input/select/textarea controls have non-empty accessible names; 11 admin labels are associated; axe/equivalent has zero label/name violations in the four cited flows.
- **Test plan:** `getByRole` named-control tests; plate virtual-keyboard update test; subscriber search filtering test.
- **Risk / rollback:** Low—duplicate IDs/localization errors; keep one ID per control and revert only the association layer if visual behavior changes.
- **Effort:** S.

- **Implementation status (2026-10-15):** Merged via [PR #57](https://github.com/tarekhamada875-droid/RQ-/pull/57) at `5f238aee60f3da0aab2a58f4ae6c53d529fe8e39` and deployed. All 11 admin labels now explicitly label their corresponding controls; the trial switch, transparent Arabic plate input, and subscriber search expose meaningful names, with a plate-input description. Existing plate rendering, virtual keyboard, and subscriber filtering are preserved.
- **Verification:** Testing Library named-role/accessible-name regressions cover all 11 admin fields and the plate/search flows; the plate keyboard update and existing subscriber search filtering remain covered. Focused UI suites passed (4 files / 12 tests). `npm run ci:check` passed (114 test files / 769 tests, TypeScript, and Pages/Worker production builds); `npm run test:rules`, `npm run maintainability:check`, and `git diff --check` passed.
- **Release verification:** Post-merge Production Gate [#38781032792](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38781032792) and Worker deployment [#38781032673](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38781032673) succeeded. Live Pages returned HTTP 200; the deployed AdminDashboard bundle contains the add-garage/package IDs and the GarageDashboardView bundle contains the plate description and subscriber-search ID. Worker health/version returned HTTP 200 and anonymous system-config returned HTTP 401. No production Firebase data/rules or configuration changed.

#### UI-004 — Name icon-only actions

- **Source:** `src/components/modals/CheckOutModal.tsx:161-223`; `src/components/garage/dashboard/GarageDashboardHeaderAndDrawer.tsx:89-111`; `src/components/garage/dashboard/GarageActiveVehiclesList.tsx:48-55`; `src/components/garage/SubscribersView.tsx:567-589`; `src/components/admin/AdminAddGarageModal.tsx:105-111,299-310`.
- **Simple explanation:** Important controls expose only icons or unreliable `title` text.
- **Implementation design / behavior to keep:** Add a typed IconButton requiring `aria-label` and optional visually-hidden text. Name controls from existing callbacks; if side buttons are semantically identical, consolidate only if current behavior proves that is intended. Keep icons, touch targets, callbacks, and layout.
- **Expected benefit:** Non-visual users can complete checkout, menu, edit/delete, close, and PIN generation actions; names also stabilize tests.
- **Acceptance criteria:** 100% of buttons in cited flows have non-empty names; axe/button-name checks have zero violations; checkout names are distinct and meaningful.
- **Test plan:** Role/name and callback tests for checkout, menu/close, subscriber edit/delete, PIN generator.
- **Risk / rollback:** Low—stale labels; colocate label with callback and revert wrapper application without changing callbacks.
- **Effort:** S.

- **Implementation status (2026-10-15):** Merged via [PR #59](https://github.com/tarekhamada875-droid/RQ-/pull/59) at `94cd7f3ae6d227648581f782a6794e5726c9890e` and deployed. The shared typed `IconButton` requires an accessible name and supports optional visually-hidden text. Checkout left/right actions now have distinct names; menu/close, active-list close, subscriber edit/delete, and garage/PIN controls are named without changing callbacks or visual behavior.
- **Verification:** Focused UI tests passed (6 files / 11 tests). `npm run ci:check` passed (118 test files / 777 tests, TypeScript, and Pages/Worker production builds); `npm run test:rules`, `npm run maintainability:check`, and `git diff --check` passed. PR Production Gate [#38786708295](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38786708295) succeeded.
- **Release verification:** Post-merge Production Gate [#38787413682](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38787413682) and Worker deployment [#38787413241](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38787413241) succeeded, including their deployment/health smoke steps. Live Pages returned HTTP 200; all 26 discovered JavaScript assets returned HTTP 200 and contained the six checked UI-004 accessibility labels. Worker `/api/health` and `/api/version` returned HTTP 200 (`1.0.0-production`); anonymous `/api/system-config` returned the expected HTTP 401.
- **Release boundary:** No Firestore data, rules, or production configuration changed.


#### UI-005 — Consolidate duplicate garage listeners
- **Source:** `src/components/garage/GarageDashboardView.tsx:147-231,240-256`; `src/components/garage/RechargeHistoryView.tsx:21-52`; `src/components/garage/SubscribersView.tsx:164-187`; `src/components/garage/GarageDashboardOverlays.tsx:72-77`.
- **Simple explanation:** Dashboard badges and opened full-screen views subscribe to the same garage collections independently.
- **Implementation design / behavior to keep:** Add garage-scoped subscription hook/store keyed by garage ID. One recharge listener supplies badge/history data; one subscriber first-page listener supplies badge/list data. Preserve `getMoreSubscribers`, first-page cursor, 50-row load-more behavior, freshness, cleanup, and mutation contracts.
- **Expected benefit:** Fewer callbacks, React updates, and Firebase listener reads; one snapshot source prevents disagreement.
- **Acceptance criteria:** Mocked service shows one recharge listener, one subscriber listener while overlay open, and zero after close/unmount. Pagination still requests older pages correctly.
- **Test plan:** Listener-count and cleanup tests; one snapshot updates badge and history/list; older-page test.
- **Risk / rollback:** Medium—freshness/cursor behavior can change. Characterize callback payloads before removing listeners; feature-flag or revert shared store if parity fails.
- **Effort:** M.

- **Implementation status (2026-10-16):** Merged via [PR #64](https://github.com/tarekhamada875-droid/RQ-/pull/64) at `3e0b32ae548dcedbd3f55fe21d5b03d02e8d45c7`. `useGarageDashboardLiveData` owns the garage-ID-scoped recharge and subscriber snapshots; dashboard badges and full-screen overlays consume that same data. Firestore orders recharge results by timestamp descending before applying the requested limit (one latest row for the badge; 50 for history); the bounded 100-record fallback is also ordered newest-first. The three-field composite index was already declared and is asserted by the emulator test. Subscriber first-page cursor, 50-row load-more calls, and local older-page merging are preserved.
- **Listener lifecycle clarification:** The garage-owner dashboard still needs these snapshots for its live badges, so its one subscriber listener and one recharge listener remain while that dashboard is mounted, including when an overlay closes. Overlays add no duplicate listener; unmount releases both. For staff, the subscriber listener is only enabled while the subscriber overlay is open. This preserves existing realtime badge behavior while keeping cleanup deterministic.
- **Coverage and verification:** Service tests prove a one-row request selects the newest recharge and the fallback is ordered; a dashboard integration test opens/closes both real overlay hosts repeatedly, confirms snapshots update the badge/list, observes one live listener, and verifies unmount cleanup. Garage-switch stale-callback and older-page pagination tests also pass. Local `npm run ci:check` passed (121 test files / 785 tests, TypeScript and Pages/Worker production builds); `npm run test:rules` passed against the local demo emulator; `npm run maintainability:check` and `git diff --check` passed.
- **Release verification:** PR Production Gate runs passed; post-merge Production Gate [#38870045568](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38870045568) and Worker deploy/health smoke [#38870045551](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38870045551) succeeded. Read-only live Pages, Worker health, and version requests returned HTTP 200. No Firebase documents or security rules were changed.

#### UI-006 — Centralize nested-overlay scroll locking

- **Source:** `src/App.tsx:483-563`; `src/components/modals/CheckOutModal.tsx:80-86`; `src/components/modals/DeleteVehicleConfirmModal.tsx:18-23`; `src/components/modals/CheckInModal.tsx:36-41`; `src/components/garage/SubscribersView.tsx:179-187`; `src/components/garage/RechargeHistoryView.tsx:21-52`.
- **Simple explanation:** Each overlay restores `body.overflow` independently, so closing one can unlock the page while another remains open.
- **Implementation design / behavior to keep:** Use modal-host ownership or reference-counted `useBodyScrollLock`; capture previous overflow and restore only after final release. Keep z-index, close/back callbacks, visual components, and mobile touch targets.
- **Expected benefit:** Background cannot scroll during nested/overlapping overlays.
- **Acceptance criteria:** Two locks remain hidden after either release; final release restores the pre-existing value. Include release-first and release-second order.
- **Test plan:** Deterministic unit tests plus mobile viewport interaction test for checkout/delete, check-in, subscribers, recharge history.
- **Risk / rollback:** Medium—incorrect prior-value restoration. Keep old utility behind a small adapter and revert to prior hook if main dashboard scrolling changes.
- **Effort:** M.

- **Implementation status (2026-10-16):** Merged via [PR #65](https://github.com/tarekhamada875-droid/RQ-/pull/65) at `673787972cbc72ee4e8b7b3bf2761730c9eab67c`. A shared token-based `useBodyScrollLock` keeps the page locked until the final overlay releases it, restores the original inline overflow exactly, and supports out-of-order release. Per-body lock sessions prevent late cleanup from restoring state onto a replaced or detached `document.body`. All application-level body overflow writers now use this hook; the garage dashboard's unconditional cleanup reset was removed. Admin, delegate, garage history/subscriber views, and modal owners are covered.
- **Coverage and verification:** Eight hook tests cover both two-owner release orders, exact prior-style restoration, enable/disable, React StrictMode replay, and body removal/replacement; a mobile-viewport CheckIn + DeleteVehicle modal integration test confirms closing one owner does not unlock the other. Local `npm run ci:check` passed (123 test files / 794 tests, TypeScript and Pages/Worker builds); `npm run lint`, `npm run test:rules`, `npm run maintainability:check`, and `git diff --check` passed.
- **Release verification:** Post-merge Production Gate [#38873331878](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38873331878) and Worker deployment/health smoke [#38873331931](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38873331931) succeeded, including the live smoke check. UI-006 is merged/deployed; no Firebase documents or security rules changed.

### B. Frontend services, hooks, Firestore reads/writes, and listener callsites

#### FE-001 — Make system config single-owner

- **Source:** `src/hooks/useGarageApp.ts`; `src/hooks/useGarageSystemConfigSync.ts`; `src/hooks/useSystemConfig.ts`; `src/components/admin/AdminGlobalSettingsView.tsx`; `src/components/admin/AdminWalletView.tsx`; `src/services/adminService.ts` system-config subscription/fallback.
- **Simple explanation:** Fee hooks and `useSystemConfig` share a hook-level singleton, but wallet/prices and two admin views also read config independently; a normal mount can create several API fetches/listeners.
- **Implementation design / behavior to keep:** Have `useSystemConfig` return wallet number and subscription prices (or typed selectors). Remove independent wallet/price subscriptions. Preserve non-empty guards, local-storage wallet behavior, API fallback ordering, defaults, and public fee-hook values.
- **Expected benefit:** Fewer startup reads/listeners and duplicate React updates.
- **Acceptance criteria:** Cold mount with all consumers: 3 to 1 `onSnapshot` and `/api/system-config` calls; one config update has one shared notification path; singleton unsubscribes once after all consumers unmount.
- **Test plan:** Hook subscription-count and last-consumer cleanup tests; empty-value preservation, partial-price merge, and admin-form refresh tests. The service API/Firestore fallback path is unchanged and audited.
- **Risk / rollback:** Medium—could erase cached wallet or alter startup defaults. Keep guards and revert consumers while retaining instrumentation if parity fails.
- **Effort:** M.

- **Implementation status (2026-10-16):** Merged in [PR #66](https://github.com/tarekhamada875-droid/RQ-/pull/66) at `9a5d4d83ec622d964a3e208a01b3186960dcbf1e`. `useGarageApp` uses `useGarageSystemConfigSync` for shared wallet/prices; the admin global-settings and wallet views consume that state, and the separate wallet/price listener wrappers were removed. The shared-listener work remains complete. The later billing cutover may remove only obsolete RQ time-plan price settings; preserve the wallet number/manual-transfer details still needed for Admin-issued credits and any separate garage-customer subscription pricing.
- **Coverage and verification:** Tests prove config plus fee consumers share one subscription/snapshot, cleanup waits for the last consumer, empty wallet/price events preserve cached/default state, partial prices merge, wallet text is normalized, and global-settings edits survive a refresh. Focused tests passed (4 files / 7 tests). Final `npm run ci:check` passed (125 test files / 798 tests, TypeScript and Pages/Worker builds); `npm run lint`, `npm run test:rules`, `npm run maintainability:check`, and `git diff --check` passed. Independent review found no blockers. The listener-sharing tests mock the service rather than mounting the complete App tree; source audit confirms no separate app-level config fetch remains.
- **Release boundary:** PR #66 is merged. No Firebase data or security rules changed as part of FE-001. The prepaid-credit phase must audit consumers before retiring any old price setting.

#### FE-002 — Page admin garage/delegate lists

- **Source:** `src/hooks/useGarageSync.ts:168-192`; `src/services/garageService.ts:68-106,132-170`; `src/services/delegateService.ts:75-90`; `src/components/admin/AdminOverviewView.tsx:21-84`; `src/components/admin/AdminPeopleView.tsx:22-31,229-230`.
- **Simple explanation:** Admin listeners read all garages and delegates, then filter/sort in the browser.
- **Implementation design / behavior to keep:** Add first-page/cursor/hasMore state and explicit count/summary or server-backed search. Keep selected-garage detail listener, totals semantics, filtering semantics, and detail workflows. Do not silently make first-page counts the dashboard total.
- **Expected benefit:** Bounded initial reads/payloads and predictable growth.
- **Acceptance criteria:** For N garages/delegates, first page returns at most configured size; no second-page read until requested; totals/search regression passes chosen contract.
- **Test plan:** Cursor ordering/hasMore service tests; hook no-unbounded-listener test; totals/search tests.
- **Risk / rollback:** High—under-reporting totals or missing search results. Ship count/search contract first; retain old listener behind compatibility switch until parity.
- **Effort:** L.

#### FE-003 — Stabilize delegate dashboard polling

- **Source:** `src/hooks/useGarageSync.ts:128-151`; `src/services/delegateService.ts:41-46`; `src/components/delegate/DelegateDashboardView.tsx:119-133,159-160,179-202`.
- **Simple explanation:** Effect depends on whole delegate object; each response creates a new object and can immediately retrigger a full dashboard request.
- **Implementation design / behavior to keep:** Depend on `delegate?.id`, keep 15-second interval stable per ID, and separate profile refresh from polling identity if needed. Preserve cancellation and current response data/search/commission behavior.
- **Expected benefit:** Request rate matches documented polling instead of response-driven loops.
- **Acceptance criteria:** In 60 seconds, initial plus at most four interval loads (five including initial); object-identity-only change creates no extra request; ID change cancels old interval and starts one new load.
- **Test plan:** Fake timers, fresh delegate objects, ID switch, late response after unmount.
- **Risk / rollback:** Medium—wrong-account polling if ID handling is wrong. Keep stable-ID guard and revert effect dependency only if cancellation tests fail.
- **Effort:** S.
- **Implementation note (2026-10-15):** `useGarageSync` now keys this effect by stable `delegate?.id` rather than the full profile object. Regression tests cover the one-minute five-load ceiling, a same-ID profile refresh, ID-switch timer cleanup, and a late response after unmount.
- **Local verification:** `npm run ci:check` passed (110 test files / 744 tests, TypeScript, Pages and Worker build); `npm run lint`, `npm run maintainability:check`, `npm run test:rules` against the local demo emulator, and `git diff --check` passed.

#### FE-004 — Reuse first staff-login garage read

- **Source:** `src/hooks/useAdminAndGarageManagement.ts:203-219,239-245`.
- **Simple explanation:** Staff login reads the same garage document once for status, then immediately reads it again for state.
- **Implementation design / behavior to keep:** Store first snapshot/data in `handleGarageLogin` and reuse it. Preserve pending/rejected guard, pin scrubbing, session release, missing-garage behavior, and state shape.
- **Expected benefit:** One fewer Firestore read and network round trip per successful staff login.
- **Acceptance criteria:** Successful login calls `getDoc` once and sets returned garage; pending/rejected cases never perform a second read.
- **Test plan:** Success, pending/rejected, missing-garage tests.
- **Risk / rollback:** Low—control-flow mistake could bypass status validation. Keep validation before state transition; revert local reuse if status tests fail.
- **Effort:** S.
- **Implementation note (2026-10-15):** The first linked-garage snapshot is now reused for the post-auth state update. The pending/rejected guard, garage/staff PIN scrubbing, and missing-document behavior remain intact; regression tests assert one garage read across those paths.
- **Local verification:** `npm run ci:check` passed (111 test files / 748 tests, TypeScript, Pages and Worker build); `npm run lint`, `npm run maintainability:check`, `npm run test:rules` against the local demo emulator, and `git diff --check` passed.

#### FE-005 — Clean recharge fallback listener

- **Source:** `src/services/adminService.ts:461-510`; `src/components/garage/RechargeHistoryView.tsx:21-52`; `src/components/garage/GarageDashboardView.tsx:147-149`.
- **Simple explanation:** Firebase does not use the unsubscribe function returned from an error callback, so fallback listener cleanup is lost.
- **Implementation design / behavior to keep:** Declare `fallbackUnsub` outside error callback, assign it, and call primary/fallback cleanup idempotently; unregister tracker once. Keep bounded fallback query and normal indexed behavior.
- **Expected benefit:** No hidden listeners or continued reads after close, including repeated index-error open/close cycles.
- **Acceptance criteria:** Forced primary error + unmount leaves zero active mocked subscriptions; 20 cycles leave zero residual callbacks; normal path unsubscribes once.
- **Test plan:** Controllable `onSnapshot` mocks, fallback callback after unmount, tracker count.
- **Risk / rollback:** Low—double-unsubscribe. Null handles/boolean guard and revert cleanup implementation if normal path count changes.
- **Effort:** S.
- **Implementation note (2026-10-15):** The owning subscription now retains primary and fallback unsubscribe handles and closes both plus the tracker idempotently. Late listener emissions are ignored after close; the bounded 100-record fallback query is preserved. Tests cover repeated cleanup and 20 forced index-error open/close cycles.
- **Local verification:** `npm run ci:check` passed (112 test files / 751 tests, TypeScript, Pages and Worker build); `npm run lint`, `npm run maintainability:check`, `npm run test:rules` against the local demo emulator, and `git diff --check` passed.

### C. Worker API structure and request performance

#### WKR-01 — Add indexed session resolution with compatibility fallback

- **Source:** `server/cloudflareWorker.ts:98-119,376-410`.
- **Simple explanation:** A session can cause eight role-session reads plus an entity read, and generic worker tokens can add up to three serial probes.
- **Implementation design / behavior to keep:** Write uid+sessionId index at session-claim time with role, entity collection, and entity ID; read index then selected session/entity. Keep expiry/revocation/token verification and legacy four-role fallback during migration; keep `WorkerUser` and rejection codes.
- **Expected benefit:** Lower authenticated-request read count and auth latency; exact savings require benchmark.
- **Acceptance criteria:** Instrument valid/expired/revoked/unknown sessions: indexed hit no more than 3 reads and zero role-probe loop; parity with legacy result/error.
- **Test plan:** All four roles, no match, expiry, revocation, atomic index writes, Hono contract tests.
- **Risk / rollback:** Medium—stale/wrong index could reject/select wrong entity. Dual-resolution parity telemetry and fallback permit rollback.
- **Effort:** L.
- **Implementation status (2026-10-16):** Added a server-owned `session_index/{sha256(uid:sessionId)}` written atomically with delegate, admin, garage, and staff session claims. The index stores role, entity collection/id, garage scope, active state, last-active time, and only a non-secret session hash; root/device records remain unchanged. Worker authentication now attempts index → selected device session → selected entity (the shipped entity-preserving target is at most three session-resolution reads), validates expiry, role, UID, and entity active-session markers, and falls back to the legacy role scan for missing/incomplete migration records. Refresh, release, and invalidate-all paths synchronize index state. Resolution logs bounded indexed-hit versus legacy-fallback telemetry without exposing session IDs.
- **Verification (2026-10-16):** Added canonical-path coverage proving no four-role probe occurs on an indexed garage session; existing expiry, revocation, role, release, and legacy-compatibility tests remain green. Full `npm run ci:check` passed with 125 test files / 803 tests, TypeScript, Pages/Worker builds, and production artifact verification.

#### WKR-02 — Replace normal full-scan summaries with maintained summaries

- **Source:** `server/cloudflareWorker.ts:1259-1278,1313-1327,1358-1375`.
- **Simple explanation:** Garage, admin, and monthly subscriber summaries read whole collections and count in JavaScript.
- **Implementation design / behavior to keep:** Instrument first. Add maintained per-garage summary/counters updated atomically with vehicle/subscriber writers; use aggregate counters/daily summaries for admin; keep full scan as operator reconciliation and temporary stale/missing fallback. Preserve response fields and exact active/date semantics.
- **Expected benefit:** Fixed/bounded reads and memory instead of growing with fleet size.
- **Acceptance criteria:** Fresh garage-summary path reads summary docs only; parity at N/M fixtures 0,100,1,000,10,000; missing/stale summary rebuild/fallback works.
- **Test plan:** Route read assertions, add/renew/delete/check-in/out parity, admin large-fixture response envelope tests.
- **Risk / rollback:** High—counter drift/date semantics. Dual-read rollout and recovery path; do not remove scans until parity clean.
- **Effort:** L.
- **Implementation status (2026-10-16):** Added versioned maintained summary documents for per-garage current counters, per-garage Cairo-day counters, the global admin aggregate, and the global subscriber aggregate. Normal garage, admin, and monthly-subscriber summary reads now use bounded summary-document reads when the summary is present and not marked stale; legacy full collection scans remain as migration/reconciliation fallbacks and rebuild the corresponding read models. Vehicle check-in/check-out/delete-refund and subscriber add/renew/update/delete transaction writers update the maintained counters atomically; garage and delegate creation seed the maintained aggregates.
- **Verification (2026-10-16):** Added maintained-summary fast-path coverage across all three summary routes and preserved garage-creation idempotency assertions for root documents. Focused WKR-02 and vehicle/subscriber compatibility tests passed (52 tests). Full `npm run ci:check` passed with 125 test files / 804 tests, TypeScript, Pages/Worker builds, production artifact verification, and release gate green.
- **Post-review correction:** Merged in PR [#77](https://github.com/tarekhamada875-droid/RQ-/pull/77) at `d5a42ba`. Deleting the final subscriber in a garage now decrements the maintained global distinct-garage count in the same Firestore transaction; deleting one subscriber while others remain does not change that count. Focused route regression coverage passed (16 subscriber/read-route tests). Full `npm run ci:check` passed with 125 test files / 808 tests, Pages/Worker production builds, and artifact verification; `npm run maintainability:check` and `git diff --check` passed. Post-merge Production Gate [#38932269879](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38932269879) and Worker deployment [#38932269971](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38932269971) succeeded. Live Pages/Worker smoke checks returned HTTP 200.

#### WKR-03 — Centralize subscriber lookup and reduce serial/duplicate reads

- **Source:** `server/cloudflareWorker.ts:1176-1204,1563-1575,2209-2212`.
- **Simple explanation:** Check-subscriber tries ID, raw plate, formatted plate, and phone serially; check-in runs both plate queries; add reads deterministic doc plus legacy query unconditionally.
- **Implementation design / behavior to keep:** Shared helper preserves ID > raw > formatted > phone precedence. Run eligible fallbacks concurrently but select deterministically; later canonical lookup can make normal path one read. Add queries legacy only if deterministic doc absent. Preserve legacy compatibility and duplicate protection.
- **Expected benefit:** Fewer RPCs and less serial latency; no large gain promised without benchmark.
- **Acceptance criteria:** Query-count/latency measurements for hits/misses; add duplicate deterministic case uses one read; ambiguous matches retain current precedence and reject/diagnose where required.
- **Test plan:** Precedence, count, raw/formatted legacy, check-in compatibility, canonical lifecycle parity.
- **Risk / rollback:** Medium—ambiguous/stale canonical keys. Keep fallback and explicit precedence until backfill parity.
- **Effort:** M.
- **Implementation status (2026-10-16):** Added one shared Worker subscriber lookup helper for public checks, transactional vehicle check-in, and subscriber creation duplicate protection. It preserves ID > raw plate > formatted plate > phone precedence; attempts the deterministic canonical plate document before any legacy query; runs eligible legacy fallbacks concurrently after a canonical miss; and selects/deduplicates matches deterministically. Subscriber creation now avoids legacy queries when the canonical duplicate exists.
- **Verification (2026-10-16):** Added canonical-hit, precedence, fallback-count, deterministic-duplicate, and check-in compatibility regression coverage. Focused WKR-03 suite passed (33 tests). Full `npm run ci:check` passed with 125 test files / 802 tests, TypeScript, Pages/Worker builds, and release artifact verification.

#### WKR-04 — Bound and stream Node Fetch adapter

- **Source:** `server/nodeAdapter.ts:7-12,35-163`; regression coverage in `server/nodeAdapter.test.ts` and `server/api.test.ts`.
- **Simple explanation:** Adapter consumes every request body, even GET/HEAD, and buffers every response; there is no body limit.
- **Implementation design / behavior to keep:** Skip GET/HEAD body consumption; enforce configured max with Content-Length and streaming byte counter for body methods; pipe `response.body` to Node when available; keep status/headers, Fetch contract, app injection, and buffered fallback where Web stream unavailable.
- **Expected benefit:** Lower avoidable memory and latency under large/concurrent requests.
- **Acceptance criteria:** Zero GET/HEAD bytes consumed; one bounded write body; no full response buffer when stream exists; oversized Content-Length/chunked requests fail explicitly.
- **Test plan:** GET/HEAD-with-body, byte-equal streaming, oversized requests, concurrent large responses, health smoke.
- **Risk / rollback:** Low/medium—backpressure and limit compatibility. Keep fallback and configurable limit; revert stream bridge if ordinary Node health test fails.
- **Effort:** M.

- **Implementation status (2026-10-17):** The local Node adapter now skips GET/HEAD request-body iteration; checks declared Content-Length before reading other methods; counts actual streamed bytes for chunked bodies; and returns 413 `REQUEST_BODY_TOO_LARGE` once the configured limit is exceeded. The default cap is 1 MiB, configurable with `RQ_NODE_ADAPTER_MAX_BODY_BYTES` or the server’s `maxRequestBodyBytes` option. Fetch response bodies use Node’s Web-stream bridge and `pipeline` with backpressure when available, with the prior buffered fallback retained. The app-injection contract and response status/headers are preserved. This is local Node/Vite adapter code, not a Worker route or production API behavior change.
- **Verification (2026-10-17):** Added direct unread-body tests and real HTTP GET/HEAD-with-body tests; exact-limit and oversized Content-Length/chunked request cases; environment-override, response byte-parity, buffered-fallback, four concurrent 256 KiB responses, and health coverage. Local `npm run ci:check` passed (127 test files / 830 tests, TypeScript, Firestore rules emulator tests, Pages/Worker production build, and artifact verification); `npm run maintainability:check` and `git diff --check` passed. No latency or memory benchmark was run, so the resource benefit remains expected, not measured.
- **Release status:** PR [#88](https://github.com/tarekhamada875-droid/RQ-/pull/88) merged at `fa5fa33`. PR Production Gate [#39014085759](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014085759), initial-push Production Gate [#39014081978](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014081978), post-merge Production Gate [#39014289983](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014289983), and guarded Worker verification/deployment plus health smoke [#39014289997](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014289997) succeeded. The Worker workflow ran, but WKR-04 itself changes only the local Node adapter; no Firebase data, rules, or production settings changed.

#### WKR-05 — Extract Worker route modules mechanically

- **Source:** `server/cloudflareWorker.ts:1-50,2175-2424,2426-3295,3288-3945,3947-4383,4700-4912`; `server/api.ts:1-12`.
- **Simple explanation:** One file mixes imports, handlers, aliases, and cross-cutting setup; extraction reduces review blast radius but is not itself a latency fix.
- **Implementation design / behavior to keep:** Keep app, middleware, error normalization, Firebase binding, and default export in Worker. Add typed deps and extract bounded route factories one family at a time; alias helper may register arrays of paths. Preserve aliases, middleware order, transaction bodies, envelopes, CORS, IDs, idempotency, domain/projection writes.
- **Expected benefit:** Independently reviewable/testable route families.
- **Acceptance criteria:** Route inventory remains identical (87 registrations); each moved module owns its registrations; API/domain tests pass after every family.
- **Test plan:** Generated method/path manifest and alias contract tests; existing Hono suites after each extraction.
- **Risk / rollback:** Medium—route shadowing/order/middleware loss. Mechanical moves only; revert the single module registration and compare inventory.
- **Effort:** L.

### D. Domain flows

#### F1 — Correct delete/refund idempotency scope and fingerprint

- **Source:** `server/cloudflareWorker.ts:1938-1944,2078-2079,2090-2091`; `server/idempotency.ts` contract; route aliases.
- **Simple explanation:** Delete and refund share literal delete scope and omit a request fingerprint, so a key can silently collide across operations, vehicles, or amounts.
- **Implementation design / behavior to keep:** Give the delete/refund route family one dedicated shared scope across its aliases; fingerprint canonical garageId, vehicleId, semantic operation, and normalized requested refund amount. Preserve the transaction, vehicle checks, accounting, events, and maximum eligible refund. A matching fingerprint replays the same result without further writes; a different fingerprint returns `IDEMPOTENCY_KEY_REUSE` with no writes.
- **Expected benefit:** Safe retries and diagnosable misuse.
- **Acceptance criteria:** Same-key refund retry has one event/accounting change; cross-operation, vehicle, or amount reuse rejects in either order.
- **Test plan:** Route-level transaction tests cover same-refund retries across aliases (including equivalent numeric spellings), plus cross-operation, vehicle, and amount reuse in both orders; keep existing delete/refund rules.
- **Risk / rollback:** Medium—intentional error for previously incorrect clients. Release contract clearly; revert only if valid same-body retries fail.
- **Effort:** M.
- **Status (2026-10-14):** Completed in PR #40, merged to `main` at `c7d452c2bc5f354052d986dd58a9db804cc28749`. Local validation passed (`npm run ci:check`, 106 test files / 647 tests, lint, build, maintainability, and Firestore rules emulator). The PR gate and post-merge Production Gate/live smoke passed; the Cloudflare Worker deployment succeeded. No Firebase rules or documents were changed by F1.

#### F2 — Make reconciliation day-safe

- **Source:** `server/domain/garageReconciliation.ts:49-79,81-114`; `server/cloudflareWorker.ts:3577-3593`; `server/domain/garageReconciliation.test.ts:11-16`.
- **Simple explanation:** Reducer counts any truthy `occurredAt`; only the current route prefilters Cairo day, so wider reuse can mix days and malformed timestamps.
- **Implementation design / behavior to keep:** Shared pure Cairo date-key predicate; count only valid events whose Cairo date equals `today`. Keep route range optimization and valid prefiltered output. Decide/document `totalRecordedEvents` semantics without weakening day fields.
- **Expected benefit:** Pure function remains correct when reused and malformed/off-day events cannot alter today’s ledger.
- **Acceptance criteria:** Previous/next-day, missing, invalid, and non-date timestamps do not affect today fields; daily projection and reconciliation agree.
- **Test plan:** Mixed-history tests, invalid values, prefiltered route regression, legacy-date reset.
- **Risk / rollback:** Medium—diagnostic consumers may expect raw array length. Preserve separate raw count if needed; revert only field semantics, not day filtering.
- **Effort:** M.

#### F3 — One unlimited-package classifier

- **Source:** `server/packageCatalog.ts:40-50`; `server/domain/vehicleCheckIn.ts:70-76`; `server/cloudflareWorker.ts:1604-1615,4331-4336`.
- **Simple explanation:** Catalog recognizes five Arabic unlimited names and explicit flags, but check-in/fair-use routes use narrower `مفتوح`/capacity checks.
- **Implementation design / behavior to keep:** Pure classifier accepts `isUnlimited`, capacity, and name with documented precedence; use in catalog, check-in, fair-use. Preserve valid numeric capacity and current fair-use decisions; make legacy variants consistent only after characterization.
- **Expected benefit:** One rule and no drift for legacy package names.
- **Acceptance criteria:** Matrix of five variants, explicit flags, zero/nonzero capacity, missing/numeric-string fields yields identical classification in all paths.
- **Test plan:** Conflict/legacy matrix and existing unlimited/fair-use tests.
- **Risk / rollback:** Medium—conflicting legacy fields. Document precedence first; do not reinterpret explicit bounded data without decision.
- **Effort:** M.
- **Billing-model impact (2026-10-16):** Do not apply the legacy duration/capacity package classifier to prepaid credit bundles. BILL-01 must decide whether daily vehicle capacity remains a separate operational limit; retain and test that rule separately if it does, otherwise mark the corresponding legacy package behavior superseded at cutover.

#### F4 — Enforce finite, non-negative money event invariant

- **Source:** `server/events.ts:86-101`; `server/projections.ts:71-92`; `server/financialReporting.ts:77-113`; `server/domain/garageReconciliation.ts:41-47,64-79`; `server/domain/vehicleCheckOut.ts:38-43`.
- **Simple explanation:** Event validation permits missing/invalid costs and negative/NaN/Infinity refunds; reducers then produce corrupted totals.
- **Implementation design / behavior to keep:** Pure money parser/validator: finite, non-negative, two-decimal policy. Apply at vehicle-exited/refunded creation and all reducers for historical malformed data. Preserve event names/payload names, valid rounding, and normal positive calculations; choose skip/quarantine/diagnostic policy for bad history.
- **Expected benefit:** No NaN/Infinity/negative-refund corruption.
- **Acceptance criteria:** All reducer monetary outputs finite/non-negative where contract requires; malformed new events reject; valid totals byte/value-equivalent.
- **Test plan:** Missing/negative/NaN/Infinity event tests and historical reducer tests; malformed counter/diagnostic coverage.
- **Risk / rollback:** Medium—reveals producer bugs and requires historical policy. Do not silently reinterpret valid history; deploy diagnostic first.
- **Effort:** M.
- **Implementation status (2026-10-15):** Merged in [PR #46](https://github.com/tarekhamada875-droid/RQ-/pull/46) to `main` as commit `41ef58aba5b33f24cd54492a5c88201bdcc9d031` and deployed. Worker deployment run [#38704341053](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38704341053) succeeded, including its Worker health smoke test; Production Gate run [#38704341183](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38704341183) also passed, including the live deployment smoke. The live Worker health and Pages endpoints both returned HTTP 200. A shared two-decimal money parser validates new financial event amounts; daily projections, financial reports, dashboard bucket aggregation, reconciliation, and vehicle deltas skip invalid legacy amounts rather than allowing them to poison totals. Invalid checkout costs are rejected in the domain before writes, explicit bad refund requests return HTTP 400, and invalid package prices/fixed discounts are rejected at catalog validation with a client error. Corrupt cached dashboard money is not served.
- **Historical-data policy:** Malformed stored amounts are omitted from money aggregates while their corresponding operation/event counts remain; source records are not rewritten. This keeps reports finite and deterministic but can understate totals if malformed history exists, so any data repair or quarantine should be a separate audited task.
- **Verification (2026-10-15):** Local `npm run ci:check` passed (109 test files / 736 tests, TypeScript, and Pages/Worker build); `npm run test:rules`, `npm run maintainability:check`, and `git diff --check` passed. Rules tests used the local demo emulator. Production deployment was through the guarded main-branch workflow; no production Firebase data or rules were changed.

### E. Authentication, authorization, sessions, rules

#### AUTH-01 — Require active server session for privileged Worker roles

- **Source:** `server/cloudflareWorker.ts:359-423`; `firestore.rules:96-115,487-532`; `src/api/apiClient.ts:101-122`; `src/__tests__/mockFirestore.ts:276-299`.
- **Simple explanation:** A verified token with a privileged role claim can bypass active-session/revocation checks.
- **Implementation design / behavior to keep:** Require `X-Session-ID` and resolve role/entity from authoritative server session for admin/garage/staff/delegate; reject missing/revoked/expired/mismatched with 401. Keep operator read-only path separate and allow only explicitly enumerated diagnostic/auth routes to skip resolution. Stage bounded compatibility telemetry for known legacy callers only.
- **Expected benefit:** Revocation and role authorization become enforceable at Worker boundary.
- **Acceptance criteria:** Claim-only privileged requests return 401 and do no business reads/writes; revoked/expired session with old claim returns 401; valid role sessions and operator GET remain valid; operator mutations 403.
- **Test plan:** Worker role matrix and no-read/write assertions; session expiry/revocation tests.
- **Risk / rollback:** High—legacy callers may be rejected. Stage telemetry and bounded compatibility flag; never retain bypass on privileged routes.
- **Effort:** M.
- **Delivery status (2026-10-14): COMPLETE for the core session-enforcement behavior.** PR #35 requires the active session for protected privileged roles and scopes the lookup to the verified role; its CI and Worker deployment passed. The owner confirmed this is synthetic pre-production with no real users, and the normal frontend sends the server-issued session ID, so no legacy-caller compatibility bypass was kept. This completion does not close RULES-01/02, PERF-01, SPIKE-01, or any other auth-related task.

#### RULES-01 — Align Firestore staff/garage rules with owner/admin policy

- **Source:** `firestore.rules:123-141,451-457,634-642,646-665`; `server/domain/authorization.ts:105-129,157-165`; `server/cloudflareWorker.ts:3780-3795,3896-3905`; `src/__tests__/workerParityRoutes.test.ts:215-230`.
- **Simple explanation:** Same-garage staff can directly change peer staff or restricted garage fields under rules even though Worker policy denies it.
- **Implementation design / behavior to keep:** Separate active garage-owner helper from any garage-scoped session. Owner/admin only for staff CRUD and restricted rates/trial fields; if heartbeat remains direct, allow only explicit small field set and immutable role/garageId/PIN/ownership. Preserve Admin SDK server writes.
- **Expected benefit:** Direct client writes cannot bypass route authorization.
- **Acceptance criteria:** Emulator denies same-garage staff role/garageId/name/PIN and restricted garage fields; owner/admin positives pass; heartbeat-only case remains allowed if chosen.
- **Test plan:** Actual emulator matrix plus Worker parity matrix.
- **Risk / rollback:** High—legacy UI direct writes may surface. Run emulator/client integration before release; migrate caller rather than broaden rules.
- **Effort:** M.
- **Delivery status (2026-10-14):** Merged in PR #37 at `2f3a61c`; the active-owner helper is separate from a garage-scoped staff session. Sensitive staff create/delete/role/PIN/garage-assignment changes remain Worker-only, with validated owner/Admin name/phone edits and staff self-heartbeat preserved. Staff cannot change rates or trial settings; owner/Admin controls pass the actual emulator. The PR and main-branch gates passed. After explicit owner approval, these exact rules were published to project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`; a fresh Firebase Console reload matched the `main:firestore.rules` SHA-256 recorded above. The publication changed no Firestore documents and does not cover any other Firebase target.

#### RULES-02 — Make system-config public projection explicit

- **Source:** `server/cloudflareWorker.ts` (`GET /api/system-config`); `firestore.rules:609-612`; `src/__tests__/cloudflareWorkerFoundation.test.ts`.
- **Simple explanation:** Public Worker route returns every Admin SDK config field even though Firestore client reads require sign-in.
- **Implementation design / behavior to keep:** Choose public allowlist for non-sensitive startup fields plus authenticated full endpoint, or make all private. Do not spread full document. Preserve admin-only write route and pre-login bootstrap if public projection chosen.
- **Expected benefit:** New sensitive config fields do not become public accidentally.
- **Acceptance criteria:** Public keys equal reviewed allowlist and exclude wallet/payment/admin fields; synthetic sensitive field absent; authenticated full-config matrix matches policy.
- **Test plan:** Foundation/public projection, role auth, emulator read tests.
- **Risk / rollback:** Medium—private cutover can break bootstrap. Prefer allowlist if pre-login config is required.
- **Effort:** S.
- **Delivery status (2026-10-15):** The verified UI has no required pre-sign-in config field: admin color uses the existing local/default fallback before login, and payment settings are used after sign-in. The full-config GET now requires an active session and an Admin/Garage/Staff/Delegate app role; anonymous and diagnostic-viewer requests are rejected. The pre-login client skips the private API request while keeping existing defaults; the admin-only write route is unchanged. Worker tests cover anonymous denial before Firestore reads and full config for each app role; actual-rules emulator tests cover anonymous denial and full authenticated reads. Merged in PR #55 at `20873e3` and deployed. No Firestore rules or data were changed.

#### PERF-01 — Canonical session index for repeated role scans

- **Source:** `server/cloudflareWorker.ts:80-140`; `src/api/apiClient.ts:119-122`; `src/__tests__/workerSessionRoutes.test.ts:269-287`.
- **Simple explanation:** Resolver loops four role definitions and can do up to nine reads per request.
- **Implementation design / behavior to keep:** Server-written uid + non-secret session hash index with role/entity/active state/lastActive; keep root/device records and bounded legacy fallback during migration. Preserve revoke/refresh and old records until fallback reaches zero.
- **Expected benefit:** Role-independent, cheaper auth path.
- **Acceptance criteria:** Canonical path target <=2 document reads when entity data is sufficient; read/latency p50/p95 by role; zero fallback over agreed window before removal.
- **Test plan:** Read-count cases for all roles/missing/expired/wrong role; revoke/refresh race and legacy compatibility.
- **Risk / rollback:** Medium—partial migration can create false revocation. Dual-resolution compare and retain fallback.
- **Effort:** M.
- **Implementation status (2026-10-16):** Shipped the canonical hashed session index as the migration fast path while retaining root/device records and the bounded legacy fallback. The index is updated on claim, refresh, release, and global invalidation; missing or structurally incomplete indexes continue through the legacy resolver, so migration can be rolled back without rejecting older sessions. The current design deliberately keeps the entity marker read for revocation parity; therefore it documents the WKR-01 three-read target rather than claiming PERF-01's optional two-read entity-sufficient target.
- **Verification (2026-10-16):** Canonical indexed resolution and legacy fallback are covered by Worker authorization/session tests; the migration read-count characterization was updated to include the intentional canonical-index miss. Full CI passed with 125 test files / 803 tests and all production gates green. p50/p95 traffic benchmarking and fallback-zero removal criteria remain rollout measurements, not yet claimed complete.

#### TEST-01 — Execute actual Firestore rules in emulator

- **Source:** `src/__tests__/stage5SecurityRules.test.ts:1-49`; `tools/firestore-rules-supervisor.test.mjs:1-12,42-69`; `firestore.rules:634-665`.
- **Simple explanation:** Much of the current security test suite models rules in local JavaScript rather than loading the real rules.
- **Implementation design / behavior to keep:** Keep pure policy tests, label them; add required emulator matrix for active roles, staff/garage restricted fields, sessions, delegates, system_config, cross-garage and retired roles. Ensure harness fails if rules file is not loaded.
- **Expected benefit:** Deployed policy language—not a duplicate model—becomes the security gate.
- **Acceptance criteria:** At least one allow and deny per listed role/operation; zero unexplained route/rules mismatches; CI reports emulator assertion count.
- **Test plan:** Emulator tests listed above; retain Supervisor characterization separately.
- **Risk / rollback:** Medium—exposes undocumented legacy writes. Fix/migrate callers; do not weaken rules.
- **Effort:** M.
- **Delivery status (2026-10-14):** The actual-rules emulator harness now exercises active Admin, garage-owner, Staff, and Delegate permissions; session immutability/heartbeat, `system_config`, cross-garage access, and retired-role denies. It passed locally and in the merged PR #37 Production Gate through `npm run test:rules`. This is the scoped matrix for RULES-01; it does not claim every rule path in the file has been exhaustively audited.

#### SPIKE-01 — Gate preproduction diagnostic endpoints

- **Source:** `server/cloudflareWorker.ts` (diagnostic guard and three `/api/test-*` routes); `src/__tests__/cloudflareWorkerCompatibilitySpike.test.ts`.
- **Simple explanation:** Non-production environment string is the only gate for Admin SDK-backed test read/write endpoints.
- **Implementation design / behavior to keep:** Require narrowly scoped operator/diagnostic credential plus explicit environment allowlist; reject mutating calls without both; keep `_spike_tests` isolated and add payload bounds. Never put credential in source.
- **Expected benefit:** Misconfigured staging cannot become unauthenticated Admin SDK surface.
- **Acceptance criteria:** Missing/wrong credentials return 401/403 and create zero docs; authorized calls work only in allowed environment; unexpected/missing environment fails closed.
- **Test plan:** All three endpoints, environment matrix, collection isolation.
- **Risk / rollback:** Low/medium—local spike usability. Use injected test credential and revert endpoint gate only in test harness, not production.
- **Effort:** S.
- **Delivery status (2026-10-15):** All three endpoints require a separate `X-RQ-Diagnostic-Token` credential of at least 32 characters and an explicit environment allowlist; production is hard-disabled even if accidentally listed. Firebase ID-token verification remains a separate requirement on the auth-verification route. Diagnostic write bodies are capped at 2 KiB and payload strings at 512 characters; reads/writes stay within `_spike_tests`. No secret or allowlist was added to production configuration, so production endpoints remain disabled. Tests cover allowed/unlisted/missing/production environments, missing/wrong/weak credentials, zero writes on rejection, bounds, and collection isolation. Merged and deployed in PR #55; no Firebase rules or data changed.

### F. Firestore schema, indexes, adapter, and query design

#### FS-01 — Add staff composite index

- **Source:** `src/services/adminService.ts:105-115`; `firestore.indexes.json:1-70`; `server/cloudflareWorker.ts:3828-3863`.
- **Simple explanation:** Staff query combines garage equality and descending createdAt, but checked-in index lacks it.
- **Implementation design / behavior to keep:** Add `garageId ASC, createdAt DESC`; deploy normally; preserve query/document shape/order. Define behavior/backfill for legacy records missing createdAt.
- **Expected benefit:** Staff list works without missing-index failure and retains intended order.
- **Acceptance criteria:** Seeded two-garage emulator query returns only requested garage, descending createdAt; CI parity test detects deletion.
- **Test plan:** Emulator query/index and legacy-document behavior.
- **Risk / rollback:** Low—index rollout; backfill must precede assumptions.
- **Effort:** S.
- **Implementation note (2026-10-15):** Worker-created staff documents include `createdAt`. Legacy staff documents without that field remain excluded by the existing ordered query; the emulator test documents this behavior. No automatic production backfill will be performed, to avoid modifying existing records; any later remediation needs a separately scoped migration.
- **Local verification:** `npm run ci:check` passed (112 test files / 751 tests, TypeScript, Pages and Worker builds); `npm run lint`, `npm run maintainability:check`, `npm run test:rules` against the local demo emulator, and `git diff --check` passed. The emulator matrix checks the index declaration, garage scoping, descending order, and missing-`createdAt` legacy behavior.
- **Production deployment (2026-10-15):** Created the matching `staff` index in project `gen-lang-client-0091669619`, named database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`; Firebase Console shows **Enabled** (index ID `CICAgOjXh4EK`). This was index-only; no documents or security rules were changed.

#### FS-02 — Add Worker cursor/page-token support and bound lists

- **Source:** `server/firebaseWorkerAdmin.ts:151-156,223-242`; `server/cloudflareWorker.ts:1452-1460,1480-1507,2953-2987,3091-3117,3543-3552`.
- **Simple explanation:** Adapter cannot express cursors; several endpoints read/sort whole collections.
- **Implementation design / behavior to keep:** Add stable order + encoded last value/document name cursor; return `items,hasMore,nextCursor`, with default/max page. Migrate garages, recharge requests, admin delegates, and delegate child lists; update callers and preserve filters/role scopes/old fields during compatibility window.
- **Expected benefit:** Read/payload/Worker memory bounded by page size.
- **Acceptance criteria:** Page reads at most size + sentinel, no duplicates/skips at boundary, no unbounded `get()` in migrated endpoints; measure at 1k/10k/100k.
- **Test plan:** First/next page, stable tie-break, filters, expired cursor, read-count mock, REST cursor encode/decode.
- **Risk / rollback:** High—callers may expect completeness. Preserve compatibility fields or migrate atomically; revert endpoint-by-endpoint.
- **Effort:** L.
- **Implementation status (2026-10-17):** Merged in PR [#86](https://github.com/tarekhamada875-droid/RQ-/pull/86) at `1b6f1caeae7e97e7f1b920543310b66379642545` (code commit `7d82a46`). Scope-bound cursors expire after 30 minutes; page size defaults to 50 and caps at 100. Worker garage, Admin delegate, recharge-request, Admin delegate-detail child, and delegate-dashboard reads now fetch at most page size plus one sentinel. Existing response arrays, filters, role scopes, and explicit historical pages are preserved; Admin/delegate callers have user-triggered continuation controls.
- **Verification:** `npm run ci:check` passed (126 test files / 819 tests, TypeScript, Pages/Worker build, and artifact verification); `npm run maintainability:check` and `git diff --check` passed. Final PR gate [#39012455049](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39012455049), post-merge Production Gate [#39012670932](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39012670932), and Worker deployment [#39012670930](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39012670930) passed. Pages, Worker `/api/health`, and `/api/version` returned HTTP 200; health reported `status: ok`, `adminSdk: true`, version `1.0.0-production`. Route/adapter tests cover first/next pages, stable tie-breaks, cross-scope tokens, filters, malformed/expired cursors, and bounded reads.
- **Measurement:** `npm run firestore-pagination:benchmark` (15 local runs per size, page size 50) measured 1k records: 20 pages, 1,019 modeled query-row reads, max 51/query, p95 4.867 ms; 10k: 200 pages, 10,199 reads, max 51/query, p95 14.367 ms; 100k: 2,000 pages, 101,999 reads, max 51/query, p95 256.534 ms. These are synthetic local traversal metrics, not live Firestore billing or Worker/network measurements.
- **Index rollout (2026-10-17):** Four required composite indexes were deployed index-only to the configured named database and reached `READY` after 79 seconds: `garages(createdByDelegateId ASC, createdAt DESC)`, `garages(referrerId ASC, createdAt DESC)`, `recharge_requests(delegateId ASC, createdAt DESC)`, and `recharge_requests(status ASC, createdAt DESC)`. The deploy explicitly declined deletion of two existing indexes. Firestore rules/data and application code were not deployed or changed by this rollout.

#### FS-03 — Bound financial reports and aggregate page by page

- **Source:** `server/cloudflareWorker.ts:3230-3269`; `src/__tests__/cloudflareWorkerFinancialRoutes.test.ts:493-550`.
- **Simple explanation:** No-date report reads all event/settlement history and materializes it.
- **Implementation design / behavior to keep:** Owner-approved bounded date/default window or explicit validation; cursor-page events/settlements and aggregate without retaining all arrays; preserve inclusive-start/exclusive-end and delegate filter. Later daily aggregates may optimize normal reports; ledger rebuild remains.
- **Expected benefit:** Bounded memory/reads and explicit finance contract.
- **Acceptance criteria:** Chosen no-date behavior tested; multi-page totals exactly match current calculation and boundary semantics; 1/3/10-year benchmark records reads/CPU/memory/p95.
- **Test plan:** Date contract, page totals, delegate filter across pages, settlement totals.
- **Risk / rollback:** High—historical report expectations. Default window must be owner-approved; retain explicit historical path.
- **Effort:** L.
- **Implementation status (2026-10-16):** Merged in PR [#73](https://github.com/tarekhamada875-droid/RQ-/pull/73) at `31f733fac610cd2dce5b28cbbd28dce1ecd396b2`. Owner-approved behavior: undated reports default to the latest 12 calendar months; explicit date ranges allow older history. Partial ranges are bounded. Event and settlement reads use stable timestamp/document-name cursors with 250-record pages; settlements are aggregated before events using totals and per-delegate settlement cutoffs rather than full document arrays. Inclusive-start/exclusive-end and delegate filters are preserved. Exact multi-page parity, settlement cutoff, delegate isolation, date-window, and REST cursor tests were added.
- **Verification and rollout:** `npm run ci:check` passed (125 test files / 807 tests, TypeScript, Pages/Worker build and artifact verification); `npm run maintainability:check` and `git diff --check` passed. PR Production Gate checks passed. Post-merge Production Gate run [#38921482843](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38921482843) and Cloudflare Worker deployment [#38921482881](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38921482881) succeeded. Pages, Worker `/api/health`, and `/api/version` returned HTTP 200 after deployment. `npm run financial-report:benchmark` (25 synthetic local runs per size) measured 1y: 1,616 modeled reads / 1.716 ms p95 / 185,680-byte peak heap growth; 3y: 4,824 / 1.645 ms / 325,288 bytes; 10y: 16,064 / 4.637 ms / 332,648 bytes. The benchmark is not live Firestore, billing, network, or Worker runtime measurement. No production data/settings were changed.
- **Post-review correction:** Merged in PR [#76](https://github.com/tarekhamada875-droid/RQ-/pull/76) at `8e78856` and deployed. Domain events store `occurredAt` as ISO strings, so report range predicates now use ISO-string bounds; settlement `settledAt` remains a Firestore timestamp/date. Route regression fixtures use the stored event shape. Focused tests passed (31 tests); full CI passed (125 test files / 807 tests); post-merge Production Gate [#38931224079](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38931224079), Worker deployment [#38931224073](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38931224073), and live Pages/Worker checks succeeded.

#### FS-04 — Resolve subscriber in check-in transaction

- **Source:** `server/cloudflareWorker.ts:1560-1579,1582-1598,1627-1641,2194-2223`; `src/types.ts:190-215`.
- **Simple explanation:** Two plate scans happen before transaction, so renewal/delete can race and classification can be stale.
- **Implementation design / behavior to keep:** Inside transaction, get deterministic normalized plate document first; if absent, perform bounded legacy fallback and deduplicate. Derive active-date decision from transaction snapshot; preserve vehicle/garage/dailyStats writes, response, legacy fallback, and idempotency.
- **Expected benefit:** One normal read and consistent `isSubscriber` snapshot.
- **Acceptance criteria:** New deterministic subscriber path one document read; legacy forms still work; concurrency retry classification corresponds to transaction snapshot.
- **Test plan:** Deterministic, legacy representation, transaction conflict/concurrent renewal, existing vehicle/activity/projection tests.
- **Risk / rollback:** Medium—larger transaction read set and contention. Benchmark and feature-gate deterministic path.
- **Effort:** M.
- **Implementation status (2026-10-16):** Check-in subscriber classification now runs inside the Firestore transaction. It reads the deterministic `plate_<base64url(normalizedPlate)>` document first; only when absent does it use bounded `limit(1)` legacy lookups for both stored plate representations, deduplicating matching documents. The active-date decision is therefore based on the transaction snapshot while preserving legacy records and existing writes/responses.
- **Verification (2026-10-16):** Vehicle route regression coverage confirms deterministic classification and legacy fallback behavior, including the expected read-count difference. Focused check-in tests passed. Full `npm run ci:check` passed with 125 test files / 801 tests, TypeScript, Pages/Worker builds, and release artifact verification.

#### FS-05 — Defer unused stored dashboard summary read

- **Source:** `server/cloudflareWorker.ts:3723-3755`; `src/__tests__/workerAuthorizationMatrix.test.ts:307-349`.
- **Simple explanation:** Route reads buckets, garage, and stored summary even when live buckets make stored summary unused.
- **Implementation design / behavior to keep:** Read buckets/garage first; only if buckets empty read stored summary and preserve freshness/source headers and scope checks.
- **Expected benefit:** One fewer live-path document read.
- **Acceptance criteria:** Live bucket path reads 2 instead of 3; fallback/stale path reads third only after empty buckets; responses unchanged.
- **Test plan:** Read-count live/fallback/stale tests.
- **Risk / rollback:** Low—fallback becomes sequential; benchmark rare path and revert ordering if latency/response changes.
- **Effort:** S.
- **Implementation status (2026-10-16):** The dashboard-summary route now reads the current projection buckets and garage document first, and fetches `dashboard_summary/current` only when no live bucket exists. Response envelopes, freshness checks, source headers, garage scope, and stale/not-ready errors are unchanged.
- **Verification (2026-10-16):** Authorization/read-route tests passed, including a read-count regression proving the live path avoids the stored-summary read and the fallback path performs exactly one additional document read. Full `npm run ci:check` passed with 125 test files / 800 tests, TypeScript, Pages/Worker builds, and release artifact verification.

#### FS-06 — Make activity-log index/fallback behavior explicit

- **Source:** `src/services/vehicleService.ts:129-151,170-193`; `firestore.indexes.json:44-59`; `src/services/vehicleServiceActivityLimit.test.ts:46-66`.
- **Simple explanation:** Missing-index fallback removes ordering but still returns arbitrary 200 records.
- **Implementation design / behavior to keep:** Make declared composite index a release gate. During migration, deterministic timestamp/doc-ID fallback or explicit unavailable error; retain Cairo-day filtering and 200 cap.
- **Expected benefit:** No silently incomplete newest activity history.
- **Acceptance criteria:** Forced primary failure returns correct newest 200 or explicit unavailable error, never arbitrary subset; missing-index occurrences measured.
- **Test plan:** 1,000 deliberately unordered logs, emulator index test, successful 200-cap test.
- **Risk / rollback:** Medium—undeployed indexes may surface. Verify/deploy before strict mode.
- **Effort:** M.
- **Delivery status (2026-10-15):** Merged in PR #54 at `c1296d7aba9958acdd6714e8f161e74b93fcd827` and deployed. Production Gate run `38772778719`, Worker deployment run `38772778657`, and post-deploy live smoke passed. Firebase Console had confirmed the `activity_logs` composite index Enabled; no index, rules, or documents were changed by the PR.

### G. Tests, release gates, build scripts

#### RQ-TG-01 — One canonical verification job

- **Source:** `.github/workflows/production-gate.yml:3-6,36-60`; `.github/workflows/cloudflare-worker-deploy.yml:3-5,29-45`; `package.json:13-18`.
- **Simple explanation:** Main push runs two installs/full Vitest runs and an extra subscriber suite.
- **Implementation design / behavior to keep:** One verify job installs, runs full suite/typecheck/rules/maintainability/builds, uploads artifacts; deploy consumes artifact. Remove redundant focused rerun while retaining its coverage in full suite; preserve rules/build checks.
- **Expected benefit:** Less duplicate CI work and clearer failures.
- **Acceptance criteria:** One full Vitest invocation and one install per main push; same SHA verified/deployed; subscriber failure blocks deployment.
- **Test plan:** Workflow SHA/artifact tests and intentional subscriber failure.
- **Risk / rollback:** Medium—omitted check or wrong artifact. Explicit SHA and artifact assertions; revert workflow composition.
- **Effort:** M.

#### RQ-TG-02 — Make deploy/smoke one immutable-commit DAG

- **Source:** `.github/workflows/cloudflare-worker-deploy.yml:47-75`; `.github/workflows/production-gate.yml:62-70`; `wrangler.toml:7-11`; `tools/release-smoke.ts:35-50,69-75`.
- **Simple explanation:** Deploy and smoke are separate workflow paths, and human version `1.0.0-production` cannot prove which commit is serving.
- **Implementation design / behavior to keep:** Verify → deploy → smoke; add immutable SHA while retaining human label; rollback same artifact/version and smoke.
- **Expected benefit:** Green release proves exact verified commit is serving.
- **Acceptance criteria:** Stale SHA fails smoke; smoke cannot start before deploy; rollback reports exact selected SHA.
- **Test plan:** Unit stale/matching/malformed health; workflow DAG and rollback rehearsal.
- **Risk / rollback:** Medium—monitoring/client version expectations. Add immutable field rather than replace label.
- **Effort:** M.

#### RQ-TG-03 — Replace grep health check with strict release smoke

- **Source:** `.github/workflows/cloudflare-worker-deploy.yml:77-90`; `tools/release-smoke.ts:15-24,37-45`.
- **Simple explanation:** Shell check can pass `{status:"error"}` because it contains the word `status`.
- **Implementation design / behavior to keep:** Invoke strict `release:smoke` or shared predicate; preserve retries, timeouts, GET-only health, and frontend check.
- **Expected benefit:** Unhealthy-but-200 deployment cannot go green.
- **Acceptance criteria:** status error, missing adminSdk, unknown/stale version, non-JSON, frontend non-2xx all fail; exact healthy fixture passes.
- **Test plan:** Deterministic fixtures and workflow invocation.
- **Risk / rollback:** Low—may block currently superficial deployments; fix endpoint contract, do not weaken check.
- **Effort:** S.

#### RQ-TG-04 — Pin Firebase CLI and align local rules gate

- **Source:** `package.json:20,32-55`; `.github/workflows/production-gate.yml:30-46`; `tools/ci-check.ts:22-28,51-53`.
- **Simple explanation:** `npx --yes firebase-tools` resolves an unpinned registry version; local `ci:check` omits rules tests.
- **Implementation design / behavior to keep:** Add pinned devDependency, use local binary, include rules in canonical full gate; retain Java 21 preflight.
- **Expected benefit:** Reproducible emulator version and local/CI parity.
- **Acceptance criteria:** Clean `npm ci` + rules uses lockfile version; local/CI same allowed/denied fixtures; intentional rule change fails both.
- **Test plan:** Clean install and Java 21 CI run.
- **Risk / rollback:** Medium—CLI/Java incompatibility. Validate pin before removing npx.
- **Effort:** S.

#### RQ-TG-05 — Smoke the built Worker artifact

- **Source:** `src/__tests__/cloudflareWorkerContract.test.ts:1-17,34-70`; `server/api.ts:8-12`; `tools/build-cloudflare.mjs:7-14`; workflows `production-gate.yml:48-57` and `cloudflare-worker-deploy.yml:38-42`.
- **Simple explanation:** Source contract tests pass while CI only checks that `dist/worker.js` is non-empty.
- **Implementation design / behavior to keep:** Post-build dynamic import of built default fetch; test health/version, CORS preflight, unauthenticated protected denial. Keep source tests and no-write semantics.
- **Expected benefit:** Bundling/runtime failures caught before deployment.
- **Acceptance criteria:** Artifact requests return expected status/JSON; broken alias/export fails even if source tests pass; command runs in both verification/deploy.
- **Test plan:** Build and artifact smoke fixtures.
- **Risk / rollback:** Low/medium—Cloudflare shims may be needed. Keep shims test-only.
- **Effort:** M.

#### RQ-TG-06 — Make local CI check fail fast

- **Source:** `tools/ci-check.ts:11-19,51-53`; `package.json:16`; `.github/workflows/production-gate.yml:39-60`.
- **Simple explanation:** A failed step is recorded but later expensive steps still run; local command differs from CI.
- **Implementation design / behavior to keep:** Fail fast for install/typecheck/test; optional explicit diagnostics mode can run all checks. Align canonical commands with CI and retain artifact assertions.
- **Expected benefit:** Faster actionable feedback and faithful local rehearsal.
- **Acceptance criteria:** Injected lint/typecheck/test failure invokes zero later expensive steps; successful path runs all required checks; nonzero failures stay actionable.
- **Test plan:** Stub each command failure and successful path.
- **Risk / rollback:** Low—secondary failures hidden in default mode. Keep diagnostic mode.
- **Effort:** S.

### Infrastructure release-control update — 2026-10-17

- PR [#84](https://github.com/tarekhamada875-droid/RQ-/pull/84), merged as `ab49d40a5aca752a62132300f0eb88df25386767`, added a fail-closed, NUL-safe Markdown-only fast path. Markdown-only diffs retain the required `verify` job and run `git diff --check`; non-Markdown, empty, or unclassifiable diffs continue through the full Production Gate. The Worker deployment workflow skips only Markdown-only pushes to `main`.
- Active ruleset [25292182](https://github.com/tarekhamada875-droid/RQ-/rules/25292182) requires PRs and the GitHub Actions `verify` check with up-to-date branches, blocks force-push/deletion, and has no bypass actors.
- PR checks passed; post-merge Production Gate [39006255537](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39006255537) and Worker deployment [39006255503](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39006255503) succeeded. Live Pages, Worker health, and Worker version checks returned HTTP 200. The app, Firebase rules, and Firebase data were unchanged.
- Documentation-only PR [#85](https://github.com/tarekhamada875-droid/RQ-/pull/85) verified the required PR fast path: run [39006619479](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39006619479) passed after Markdown validation while application setup/tests/build/smoke steps were skipped. The initial branch-push run [39006610687](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39006610687) correctly failed closed to the full gate because its base SHA was unavailable, and passed.
- This operational checkpoint does not alter roadmap sequencing: **FS-02 remains the next implementation task**.

### H. Cross-cutting decomposition

#### Cross-F1 — Extract Worker routes one family at a time

- **Source:** `server/cloudflareWorker.ts:1-52,218-328,330-427,430-1023,1024-1526,1527-2177,2178-3284,3291-3827,3828-4378,4383-4912`.
- **Simple explanation:** Worker route families share one 4,912-line edit surface; extraction improves reviewability, not request latency by itself.
- **Implementation design / behavior to keep:** First typed `RouteDeps`, then read/system, vehicle, subscriber, financial/recharge/delegate, garage. Keep global middleware/auth/error/rate limits/app/default fetch in monolith until all modules characterized. Preserve every alias and route order.
- **Expected benefit:** Smaller PRs and independent route-family tests.
- **Acceptance criteria:** Baseline 4,912 lines/30 imports/87 registrations; after each extraction route inventory identical and old handler span absent from monolith; no performance claim without benchmark.
- **Test plan:** Generated route manifest, family suites, fresh-app registration smoke, correlation/401/403/operator/rate-limit tests.
- **Risk / rollback:** High if rewritten; medium for mechanical move. Move one block, compare inventory, revert module only.
- **Effort:** L.

#### Cross-F2 — Split adminService behind unchanged facade

- **Source:** `src/services/adminService.ts:1-16,49-240,242-348,350-400,402-566,568-618,620-710`; `src/services/index.ts:1-17`.
- **Simple explanation:** Staff, packages, subscribers, coupons, activity, announcements, system config, and financial actions are one service object used by 40 files.
- **Implementation design / behavior to keep:** Move method bodies into domain modules; compose same keys in `firestoreService`. Preserve names, return types, listener cleanup, callback timing, pagination, and transport semantics in first PR. Add focused system-config call-count tests before policy changes.
- **Expected benefit:** Domain-sized edit surfaces without mass caller migration.
- **Acceptance criteria:** No module exceeds old 710-line baseline; facade key set unchanged; system config successful snapshot at most one API call and error/empty at most one fallback; existing pagination/component tests pass.
- **Test plan:** Config document exists/missing/error/unsubscribe/order; facade compile/runtime contract; activity/subscriber regression.
- **Risk / rollback:** Medium—callback timing/cleanup. Keep compatibility facade and revert module composition.
- **Effort:** M.

#### Cross-F3 — Group useGarageApp contract before migrating App

- **Source:** `src/hooks/useGarageApp.ts:22-37,176-227,241-257,259-343,345-441`; `src/App.tsx:48-135,200-393`.
- **Simple explanation:** Five domain hooks are flattened into about 94 values and App has no direct orchestration test.
- **Implementation design / behavior to keep:** Add renderHook characterization for session readiness, offline gating, fallback views, forwarding, and cleanup. Return stable groups: session, navigation/ui, garageData, vehicleOperations, subscriptions, adminManagement; temporarily retain flattened aliases, then migrate App and delete aliases only after matrix passes. Keep domain-hook boundaries and all callback identities/behavior.
- **Expected benefit:** Fewer wiring errors and role-specific contract ownership.
- **Acceptance criteria:** App consumes no old flat list after migration; no more than six named groups; view/state transition matrix matches baseline; every setup has one cleanup.
- **Test plan:** Auth/admin/delegate/garage renderHook matrix, handler forwarding, wallet/price and PIN subscription cleanup, existing component suites.
- **Risk / rollback:** Medium—omitted fields/callback identity. Keep aliases for one migration step and revert App consumer independently.
- **Effort:** M.

## 7. Dedicated Firebase read/write-cost measurement plan

This plan is required before claiming savings. It distinguishes **document reads**, **listener snapshot deliveries**, **writes/transactions**, **payload bytes**, and **Worker execution**. It must not log credentials, PINs, session IDs, or full user documents.

### 7.1 Baseline dataset and scenarios

Use deterministic fixtures at small and large sizes. The reviews explicitly call for representative sizes; use:

- Garage summary: 0, 100, 1,000, and 10,000 inside vehicles/subscribers.
- Admin lists: at least first-page fixtures plus totals/search cases; record N garages and N delegates.
- Financial report: 1-year, 3-year, and 10-year event/settlement histories.
- Activity: 201 and 1,000 same-day logs in deliberately non-time order for index/fallback correctness.
- Sessions: admin, delegate, garage, staff, valid, missing, expired, revoked, wrong role.
- Subscriber lookup: ID hit, raw plate hit, formatted plate hit, phone hit, complete miss, ambiguous legacy match.

Run each scenario with the current implementation and the candidate implementation against the same fixture, same region/emulator settings, and same query inputs. Warm and cold runs must be labeled separately.

### 7.2 What to measure

| Metric | How to measure | Required comparison |
|---|---|---|
| Firestore document reads | MockFirestore counters in unit/route tests; emulator request traces where available; production Firebase usage dashboard for staged traffic | Per request and per screen mount, before/after |
| Listener count | Instrument `onSnapshot` registration/unsubscribe and active-listener set | Peak active listeners, snapshot callback count, zero after unmount |
| Writes | Count `set`, `update`, `add`, and transaction commit attempts; separate retries from logical writes | Logical writes must remain exactly once where idempotency requires it |
| Transaction retries | Instrument transaction attempt and commit count | Check-in and summary writer contention before/after |
| Returned documents | Query wrapper count and page size/cursor logs | No normal bounded path exceeds budget |
| Payload bytes | Serialized request/response byte count, excluding sensitive values | Per route and concurrency |
| Worker duration | p50/p95/p99 with route, status, result source, and fixture size | No regression on compatibility paths; improvement only reported if measured |
| Memory | Node adapter RSS/heap and Worker platform memory telemetry where available | Large response concurrency before/after |
| Cost proxy | Reads/writes/listener minutes multiplied by the currently applicable Firebase pricing sheet outside this report | Absolute cost must be calculated from observed usage, not guessed |

### 7.3 Named budgets and acceptance gates

These are engineering acceptance budgets for the changed paths, not promises about the whole product:

- **FE-001:** one system-config listener and one API fallback request per cold app mount; one shared callback path.
- **FE-002 / FS-02:** first page only until explicit next-page action; no unbounded listener or `get()` in migrated list path.
- **FE-003:** initial plus at most four interval loads in 60 seconds under fake timers.
- **FE-005 / UI-005:** zero active listeners after unmount; no residual callbacks after 20 open/close cycles.
- **WKR-01 / PERF-01:** indexed session path at most 3 reads for WKR-01’s entity-preserving design; target at most 2 where the canonical index contains sufficient entity data for PERF-01. Document which design is shipped rather than mixing targets.
- **WKR-02:** fresh summary path reads a fixed number of summary documents and no vehicle/subscriber collection documents.
- **WKR-03 / FS-04:** deterministic subscriber path one document read; legacy fallback counts reported separately.
- **WKR-04:** no GET/HEAD body consumption; bounded write body; streaming response where supported.
- **FS-03:** page-bounded report reads and memory; exact total parity across pages.
- **FS-05:** live dashboard bucket path reads two documents, not three.

### 7.4 Rollout and decision process

1. Add counters and dashboards with behavior unchanged.
2. Capture at least 10 representative runs per scenario in tests/benchmark fixtures; for staged traffic, observe enough requests to identify cold/warm and legacy-fallback rates.
3. Compare counts and parity, not only latency. A faster request that returns incomplete data fails.
4. Ship candidate behind a bounded fallback or dual-read comparator where the task specifies one.
5. Enable the candidate for a small owner-approved cohort or staging fixture.
6. Remove fallback only after the stated parity/fallback-zero window and an explicit rollback artifact exists.

## 8. Safe incremental plan for large files

### Worker (`server/cloudflareWorker.ts`)

1. Snapshot method/path inventory, aliases, middleware order, response envelopes, and exported fetch identity.
2. Add `RouteDeps` without moving business logic.
3. Extract only read/system routes (`1024-1526`) mechanically; run foundation/read suites.
4. Extract vehicles (`1527-2177`); run vehicle suites and route diff.
5. Extract subscribers (`2178-2563`); run subscriber suites.
6. Extract recharge/financial/delegate and garage groups only after the earlier groups are green.
7. Keep global middleware, auth, error normalization, CORS, rate limits, Firebase binding setup, and final export in the original file until late.
8. Do not combine extraction with session-index, summary-counter, or route-semantic changes.

### `src/services/adminService.ts`

1. Preserve `src/services/index.ts` as the facade and record its key set.
2. Move staff/packages first, then subscriber/coupon, activity, announcements, and system config/financial methods.
3. Keep method bodies and transport behavior unchanged during the move.
4. Add focused system-config call-count/cleanup tests before any source-selection redesign.
5. Migrate callers only after facade parity is proven; do not edit all 40 callers in one PR.

### `src/hooks/useGarageApp.ts` and `src/App.tsx`

1. Add direct hook characterization tests first.
2. Add grouped objects plus temporary flat aliases.
3. Migrate App to grouped fields in a separate PR.
4. Move GarageRoute and AdminRoute ownership one route at a time.
5. Remove aliases only after route/modal/back-navigation/render-count tests pass.

**Never do:** a big-bang rewrite, simultaneous transport/schema changes during a mechanical extraction, deletion of compatibility aliases before consumers migrate, or a line-count-only claim of performance improvement.

## 9. Future coding-agent checklist

### Before coding

- [ ] Confirm checkout is `9d0c705...` or record the exact newer baseline.
- [ ] Treat PR #34’s seven-day RQ garage-access plan as legacy behavior to retire only at the tested prepaid-credit cutover; preserve garages’ own time-based monthly parking memberships.
- [ ] Read the exact task section and all listed source lines.
- [ ] Record route inventory, facade key inventory, current tests, and relevant Firebase counters.
- [ ] Define the compatibility behavior that must remain and the one behavior intentionally changing.
- [ ] Choose one PR-sized task; do not combine area decompositions.

### During coding

- [ ] Preserve public routes, aliases, response envelopes, collection paths, idempotency semantics, and default fetch export unless the task says otherwise.
- [ ] Preserve Cairo-day boundaries, 200-record activity cap, subscriber pagination, resumable garage deletion, and valid monetary rounding.
- [ ] Avoid logging credentials, PINs, session IDs, or full sensitive documents.
- [ ] Add the task’s regression tests before deleting fallback behavior.
- [ ] For reads/listeners, count both initial work and cleanup; for writes, distinguish logical writes from transaction retries.
- [ ] For security changes, test both Worker policy and actual Firestore emulator rules.
- [ ] For page/cursor work, test equal sort values, no duplicates, no skips, filters, and expired cursors.
- [ ] For summary/counter work, compare against the existing full-scan/reconciliation path.

### Before PR approval

- [ ] Run typecheck/build and the targeted area suite.
- [ ] Run relevant full Vitest, rules emulator, Worker artifact smoke, and release smoke gates.
- [ ] Compare route/facade inventories before and after.
- [ ] Report measured reads, writes, listener counts, payload bytes, latency, and memory; label hypotheses as hypotheses.
- [ ] Verify rollback path: old route/module, legacy fallback, or prior artifact is still available as specified.
- [ ] Document any changed error/status contract for owner approval.

### Before production enablement

- [ ] Security: no privileged claim-only route succeeds; rules emulator matrix is green; spike endpoints fail closed.
- [ ] Cost: normal paths meet read/listener/page budgets; no accidental duplicate write was introduced.
- [ ] Correctness: parity fixtures pass for dates, active subscriptions, packages, money, idempotency, pagination, and aliases.
- [ ] Release: verify → deploy → smoke uses one immutable commit identity, and rollback uses the same smoke.
- [ ] Observability: legacy fallback, malformed-event, missing-index, summary mismatch, and rejected-auth metrics are visible.
- [ ] Owner sign-off exists for any public API change, report-window default, direct-write rule change, or intentional legacy-client rejection.

## 10. Owner decisions and approved defaults

The owner approved the recommendations below on 2026-10-14. They are implementation defaults, not permission to silently change existing product behavior. Before changing a user-visible contract, agents must verify current callers, add migration-compatible tests, and report any conflict rather than guessing.

| Decision | Approved default | Guardrail before implementation |
|---|---|---|
| Public `system_config` | Publicly return only an explicit allowlist of fields needed before sign-in. Wallet, payment, commission, and admin settings remain authenticated. | Confirm exact current bootstrap fields and callers; never return the whole Firestore document. |
| Admin list data | Load 50 records per page, with server-side search and accurate totals from a separate count/summary. | Verify current search, filtering, totals, and sort behavior; do not show first-page counts as global totals. |
| Financial report without dates | Require a start and end date for normal reports. Offer an explicit all-history operation, processed in pages. | Preserve inclusive-start/exclusive-end semantics. Treat this as a contract change: inventory callers and release with an explicit response/error contract. |
| Conflicting legacy unlimited-plan fields | Prefer explicit `isUnlimited` when present. For old records without it, apply the existing legacy rules consistently. | Do not silently rewrite conflicting stored records; identify and report them for a separate cleanup decision. |
| `totalRecordedEvents` in daily reconciliation | Count only valid events from the target day; expose total supplied records separately if diagnostics need it. | Confirm no consumer relies on the old broader meaning and preserve a separate diagnostic count if needed. |
| Malformed historical money events | Exclude invalid amounts from financial totals, retain the original records, and count/flag them for investigation. | Never delete or silently rewrite source events; expose diagnostic counts and keep valid historical rounding unchanged. |
| Direct staff/garage Firestore writes | Sensitive role, ownership, PIN, rate, and financial changes go through the Worker. Keep only narrowly necessary low-risk direct writes. | Inventory supported client versions and migrate any legitimate direct-write callers before tightening rules. |
| Removing legacy fallbacks | Keep fallbacks until there are 30 consecutive days with no legitimate use, or all relevant old sessions have expired and the new path is verified, whichever is longer. | Instrument fallback use first; preserve rollback until the observation condition is met. Do not delay fixes that can safely coexist with fallback. |
| First pagination/cost rollout | Start with 50 records per page and a test/staging account. Measure Firebase reads, writes, listener counts, errors, and payload sizes before/after. | Establish actual cost budgets from measurements; name a rollback owner before rollout. |
| RQ garage billing model | Replace time-expiring RQ access plans with manually granted, non-expiring prepaid credits; one regular successful entry costs one credit at the 1 EGP/credit base rate; each successful monthly parking-subscriber renewal costs five credits, with no per-entry charge for that subscriber. | Keep this separate from the garage’s time-limited customer memberships. Resolve zero-credit behavior, current-plan migration, subscriber renewals with insufficient credit, credit correction/refund rules, mistake-limit behavior, and independent capacity limits before implementation/cutover. |
| Shared daily mistake allowance | Three free mistake/correction events per garage per Cairo day, shared across all staff. | Define which operations count and what happens after the third event before coding; do not implement a per-staff reset or paid bypass. |
| Manual credit grants and bundles | After confirming offline payment, Admin directly grants non-expiring credits from an Admin template or entered quantity; garage owners do not purchase packages. The Admin package editor is a template catalog, not customer checkout. | Keep money and credit ledgers distinct; decide how legacy EGP wallet balances are preserved and whether they have another use; confirm discount/bonus policy and audit fields. No automatic payments or owner-side package purchases. |

The implementation order remains one PR-sized task at a time. The first work should close high-priority security gaps and add tests/measurements; large rewrites, fallback removals, or user-visible contract changes must not be bundled into one release. Any unresolved conflict with the guardrails above must be brought back to the owner with concrete evidence.
