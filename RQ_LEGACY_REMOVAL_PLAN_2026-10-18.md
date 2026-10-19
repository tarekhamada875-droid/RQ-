# RQ Legacy Removal Plan

**Source baseline:** The initial inventory draft was validated against `main` on 2026-10-18; current task status is recorded in the dated checkpoint below.

**LR-01 completion checkpoint (2026-10-19):** LR-01 merged via PR [#169](https://github.com/tarekhamada875-droid/RQ-/pull/169) at `0d7b63009bd0b2a8a68736afb376f119a835f4c6`. Main Production Gate [39205342165](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39205342165) passed verification, artifact deployment, and smoke. Live `/api/health` and `/api/version` both return HTTP 200 and report that exact Worker SHA. The authenticated route is retained as a 410 compatibility tombstone; its active writer and unused client method are removed. No Firebase data/rules, database routing, or migration changed.

**LR-02 in-progress checkpoint (2026-10-19):** The owner selected option 2: remove all in-app recharge-request history reads. Work is on `feat/lr-02-retire-recharge-request-workflow`, based on clean `main`/`origin/main` `3bdc3cb15f1b0eb7d03b40393d1a3122fbcd15a8`. The local implementation retires request creation/approval/rejection/list routes, removes UI/service/listener/pagination paths and the Admin summary count, and removes request list/pagination fields from the Admin delegate response. Authorized legacy callers receive HTTP 410; route-specific wrong-role denials remain and are covered. Regression tests prove no request collection read/write, keep pending garage applications and delegate settlement, and render non-empty historical `activity_logs` in Admin delegate totals/commission. Stored `recharge_requests` and guard records are retained. The only remaining active collection reference is the unchanged garage-deletion cleanup adapter; no deletion action or migration was run. Focused regressions passed 3 files / 27 tests; `npm run lint`, maintainability, and whitespace checks passed. Final `npm run ci:check` exited 0 with 138 test files / 889 tests, Firestore rules emulator, Pages/Worker build, Worker artifact smoke, maintainability, and production artifact verification. Generated build outputs were removed. The implementation is committed and pushed; PR #171 is open and its required Production Gate is pending. It is not merged or deployed. No Firebase data/rules or database routing changed. The live Worker remains at application SHA `0d7b63009bd0b2a8a68736afb376f119a835f4c6`; current main `3bdc3cb15f1b0eb7d03b40393d1a3122fbcd15a8` is the documentation-only PR #170 merge, whose main Production Gate #39205932375 passed without a Worker deployment.

**Current next step:** Wait for PR #171’s required Production Gate. Merge only after it passes, then verify the post-merge main workflow and live Worker identity. Do not proceed to LR-03 in this task.

## Purpose

Remove the retired garage-owner time-based billing and wallet system without removing the current prepaid-credit model, the garage-owned monthly parking-subscriber system, or historical records and reporting.

The retirement boundary is:

- **Remove:** garage-owner wallet balance, owner-side package purchase, time-expiring garage plans, legacy recharge approval, legacy direct recharge, legacy fair-use extensions, legacy referral-day expiry extensions, and their dead client/runtime contracts.
- **Keep:** Admin-confirmed prepaid credit grants, credit bundles as Admin templates, the credit ledger, one-credit regular vehicle entry, five-credit monthly parking-subscriber renewal, customer subscriber CRUD/renewal, referral credits granted through the current prepaid-credit ledger, and historical read-only data.

## Validation findings

At the LR-00 baseline (`f55e5cea...`), one active legacy write path and several reachable or partially reachable legacy surfaces were confirmed. LR-01 retired the direct recharge writer in PR #169; the other legacy surfaces remain separately scoped.

### Direct Admin recharge — active at LR-00 baseline; retired in LR-01

`POST /api/transactions/recharge-garage` was an active writer at the LR-00 baseline (`f55e5cea24e1b3cc78452df3bcde7b27bdfac45a`). It is now an authenticated HTTP 410 tombstone on main `0d7b63009bd0b2a8a68736afb376f119a835f4c6`, returning before body parsing or Firestore access. PR #169 and post-merge run 39205342165 passed; live health/version report the same deployed SHA.

The tombstone keeps authentication and the route path for compatibility, then returns 410 before body parsing or Firestore access. The route-specific writer and its unused dependencies have been removed after adding the fail-closed regression.

### Disabled or partially active legacy paths

The following routes return HTTP 410 but retain unreachable implementations below the early return:

- recharge-request approval in `server/financialRoutes.ts`
- direct wallet top-up in `server/financialRoutes.ts`
- fair-use extension in `server/garageRoutes.ts`
- garage self-subscribe in `server/garageRoutes.ts`
- use-referral-reward in `server/garageRoutes.ts`

Recharge-request creation aliases, rejection aliases, and Admin/scoped request-list routes remain reachable in `server/financialRoutes.ts`; inventory and callers are recorded in the LR-00 baseline document. These are not 410 tombstones at this baseline.

### Remaining legacy client/UI surfaces

- Admin recharge-request list and approval/rejection UI remain in `AdminRequestsView` and `AdminDashboard`.
- Delegate recharge-request creation, list, and compatibility handlers remain in `delegateService`, `useGarageSubscription`, and `DelegateDashboardView`.
- Admin garage details retain dead top-up state/handlers and compatibility props.
- Wallet-number and subscription-price configuration contracts remain in the client, Worker config routes, and service facade.
- `AdminWalletView`, wallet tab state, and wallet-related navigation props remain as compatibility remnants.

### Important non-legacy behavior to preserve

- `POST /api/garages/:id/credit-grants` is the current payment-to-credit path.
- `GET /api/garages/:id/credit-ledger` is current financial history.
- `debitRegularEntry` and `restoreCredits` are current vehicle-entry/refund behavior.
- `debitSubscriberRenewal` and `/api/subscribers/renew` are current monthly parking-subscriber behavior.
- `awardReferralCredits` for the first confirmed paid prepaid grant is current and must not be confused with the retired referral-day system.
- Subscriber lookup and subscriber date ranges remain valid customer functionality.
- Historical `activity_logs`, recharge records, old package records, legacy garage fields, and migration-rehearsal data remain readable unless a later owner-approved data migration is explicitly created.

## Task register

### LR-00 — Baseline and contract inventory

**Scope:** Freeze the current route manifest, client API callers, legacy field inventory, current prepaid/subscriber contracts, and tests.

**Acceptance criteria:** A source audit identifies every legacy route, caller, writer, reader, type, rule, and test; current prepaid and monthly-subscriber invariants are listed as protected contracts.

**No code behavior change.**

### LR-01 — Retire the active Admin legacy recharge writer
**Status:** Complete; merged in PR #169 at `0d7b63009bd0b2a8a68736afb376f119a835f4c6`; post-merge Production Gate and live Worker identity verified.

**Scope:** Replace `/api/transactions/recharge-garage` with the same fail-closed retirement contract as other retired endpoints, then remove its dead implementation and only its now-unused dependencies.

**Protect:** `/api/garages/:id/credit-grants`, credit ledger writes, current referral-credit awards, and customer subscriber renewal.

**Acceptance criteria:** No authenticated request can create or extend a legacy garage subscription, balance expiry, daily-capacity package, fair-use state, or referral-day reward through the route; current credit-grant tests remain green; route inventory and 410 behavior are explicit.

### LR-02 — Remove the legacy recharge-request workflow

**Status:** In progress on `feat/lr-02-retire-recharge-request-workflow`; user-selected history policy is to remove all in-app reads. Existing stored request records are retained.

**Scope:** Remove recharge-request creation, approval, rejection, all in-app request-history readers, pending-request listeners, Admin request UI, delegate request UI, pagination state/response fields, the Admin summary count, and service facade methods.

**Protect:** pending garage-application requests, delegate garage creation, delegate commission settlement if still used, read-only historical activity logs, and all stored recharge-request documents.

**Acceptance criteria:** No active UI or client service calls a recharge-request write/list workflow; no Admin summary or delegate-detail response exposes request counts/history/pagination; old routes return authenticated 410 responses while preserving role denials where applicable; application request views still work.

### LR-03 — Remove owner-side wallet and self-subscribe wiring

**Scope:** Remove `admin-topup-balance`, `garage-self-subscribe`, `use-referral-reward`, dead top-up modal state, wallet UI compatibility props, wallet service methods, and legacy owner purchase handlers.

**Protect:** Admin manual credit entry, credit templates, credit ledger history, garage login/session behavior, and subscriber management.

**Acceptance criteria:** No owner/admin UI can enter or spend a legacy EGP wallet balance; no client calls retired endpoints; old endpoints are fail-closed and their dead handler bodies are gone.

### LR-04 — Isolate and clean the package/catalog model

**Scope:** Make active package creation and grant paths credit-bundle-only. Remove legacy-time classification from active authorization and grant paths. Preserve read-only historical package records and report display through an explicit historical/read model where necessary.

**Protect:** Admin credit-bundle templates, package list/delete behavior, current credit grants, and historical activity/reporting.

**Acceptance criteria:** A legacy-time package cannot be used to grant or activate garage access; credit bundles require quantity/price invariants; vehicle entry contains no duration/capacity/fair-use decision; historical records remain renderable.

### LR-05 — Remove legacy expiry, fair-use, capacity, and referral-day dependencies

**Scope:** Delete active-path dependencies on `balanceExpiry`, legacy `dailyCapacity`, `unlimitedFairUse`, `extendSubscriptionExpiry`, legacy referral-day reward helpers, and time-plan authorization after LR-01 through LR-04 prove no valid caller remains.

**Protect:** customer subscriber `startDate`/`endDate`, subscriber renewal debit, garage lock/suspension rules, and historical reporting adapters.

**Acceptance criteria:** Prepaid garage access is credit-based only; customer monthly parking subscriptions remain date-based; no legacy time or fair-use state can affect check-in; historical data is read-only and non-authorizing.

### LR-06 — Retire obsolete config, types, rules, and service contracts

**Scope:** Remove wallet number, subscription-price, owner-balance, and obsolete package/recharge fields from active client contracts, config defaults, admin settings, and service facades only after caller inventory proves they are unused.

**Protect:** monthly-subscriber configuration that remains genuinely used, Admin color/maintenance settings, authentication/session settings, credit-grant audit fields, and historical document readability.

**Acceptance criteria:** No active config endpoint accepts or returns retired wallet/payment fields; Firestore rules no longer authorize obsolete settings solely for legacy clients; historical fields remain tolerated on reads.

### LR-07 — Final deletion and verification release

**Scope:** Remove dead files, dead tests, dead translations, obsolete compatibility aliases, and stale comments. Run final source/reference audit.

**Acceptance criteria:**

- No active legacy billing route or writer remains.
- No active client caller references retired endpoints.
- No prepaid entry path depends on duration, capacity, fair-use, or wallet balance.
- Monthly customer subscriber flows pass focused regression tests.
- Historical read-only fixtures still render and report correctly.
- Full CI, rules tests, build, Worker artifact smoke, maintainability, lint, and diff checks pass.
- PR gate, merge, post-merge Production Gate, deployment identity, and live smoke verification pass.

## Explicit exclusions

This plan does not:

- Delete Firestore data or migrate existing garage documents.
- Delete historical activity logs, recharge requests, packages, or billing fields.
- Remove customer monthly parking subscriptions.
- Remove subscriber CRUD or date-based subscriber authorization.
- Remove prepaid credit grants, referral credits, credit debits, credit restores, or the credit ledger.
- Change the one-credit regular entry or five-credit subscriber-renewal rules.
- Reopen the Firebase/database decision gate.
- Combine multiple LR tasks into one application PR.

## Implementation method

Each LR task is a separate bounded branch and PR. Before implementation, record the exact baseline and current callers. For each task: add characterization tests, implement the smallest change, run focused validation, run the full local production gate, review the diff and generated-artifact state, open the protected-branch PR, wait for the required gate, merge, verify the post-merge deployment and live identity, and update this plan plus the knowledge base and maintainability handoff.

## Recommended next task

**LR-02 — Remove the legacy recharge-request workflow (in progress).** The user selected this task on 2026-10-19 and chose removal of all in-app request-history reads. Complete validation and the standard PR/release cycle before considering LR-03.
