# LR-00 — Legacy Billing Baseline and Contract Inventory

**Status:** LR-00 baseline inventory accepted in PR #167. The route/data/caller rows below record source state at baseline `f55e5cea24e1b3cc78452df3bcde7b27bdfac45a`; see the follow-on LR-01 and LR-02 checkpoints below for current status.
**Repository baseline:** `f55e5cea24e1b3cc78452df3bcde7b27bdfac45a` (`main` matched `origin/main`; clean before branch creation).
**Production gate:** Main Production Gate run `39195590669` passed for this exact repository SHA.
**Live application identity (separate from repository SHA):** Cloudflare Worker health and version both returned HTTP 200 and reported application SHA `ed07806770c8f3aa76d2520e84d5778058978ab5`.
**Scope boundary:** This inventory itself changed no behavior/data/rules. LR-01 is complete in PR #169 at main SHA `0d7b63009bd0b2a8a68736afb376f119a835f4c6`; post-merge verification is documented below.

**Follow-on LR-01 status (2026-10-19):** PR [#169](https://github.com/tarekhamada875-droid/RQ-/pull/169) replaced the active Admin route with authenticated HTTP 410 `{success:false,error:'LEGACY_BILLING_MODEL_RETIRED'}`, removed its dead transactional implementation, route-only dependencies, and unused client method/test, and merged at `0d7b63009bd0b2a8a68736afb376f119a835f4c6`. The regression proves unauthenticated requests remain 401, authenticated Admin/garage callers receive 410, and no Firestore records are changed. Focused tests passed (4 files / 71 tests); full local `npm run ci:check` passed (139 test files, rules, builds, artifact smoke, maintainability); PR and main Production Gate 39205342165 passed and deployed the verified Worker artifact. Live health/version both report the merge SHA. This preserves baseline findings as historical evidence. At the time of this LR-01 note, LR-02 had not yet been selected; the user selected LR-02 on 2026-10-19.

**Follow-on LR-02 status (2026-10-19):** The owner selected option 2: remove all in-app recharge-request history reads. Implementation is in progress locally on `feat/lr-02-retire-recharge-request-workflow`, based on `3bdc3cb15f1b0eb7d03b40393d1a3122fbcd15a8`. In-app request creation/approval/rejection/list routes are retired, Admin/Delegate request-history screens and service/read state are removed, and Admin summary no longer queries the request collection. Existing request documents and guards are retained; pending garage applications, delegate commission/settlement behavior, and financial activity history remain. Focused tests passed (5 files / 87 tests). The full local Production Gate reported all checks green (138 test files / 888 tests, rules emulator, builds, artifact smoke, maintainability, artifact verification); TypeScript and whitespace checks passed. The background wrapper closed before its extra exit marker after the gate printed `[RELEASE PASSED]`. Commit, push, PR, merge, and deployment are pending. No Firebase data/rules or database routing changed.

## 1. Purpose and classification rules

This inventory records the source-level contracts that a later removal task must understand. It distinguishes five separate domains:

1. Retired or intended-to-be-retired garage-owner wallet, time-based billing, recharge, fair-use, and referral-day behavior.
2. Current monthly parking subscriptions sold by a garage to its customers. These are date-based customer entitlements, not the garage owner's subscription.
3. Current prepaid entry credits (`paid`, `referral`, `trial`) and their ledger.
4. Current referral credits awarded through the first confirmed prepaid grant.
5. Historical events, activity logs, recharge records, settlements, legacy fields, reports, and migration-rehearsal contracts.

Labels such as `balance`, `wallet`, `subscription`, `recharge`, `package`, and `transaction` are not enough to decide whether a value is obsolete. “Safe to remove” below refers only to source-level candidate safety under the current observed callers; it does not authorize deleting production records, changing rules, migrating data, or changing product policy.

## 2. Method and limits

The audit inspected the Worker route modules and registration, API/service call sites, frontend hooks and views, TypeScript contracts, Firestore collection/field references, rules and indexes, domain helpers, tests/fixtures, CI and maintainability scripts, and active documentation. Focused review included `server/garageRoutes.ts`, `server/financialRoutes.ts`, `server/subscriberRoutes.ts`, `server/vehicleRoutes.ts`, `server/readRoutes.ts`, `server/financialReporting.ts`, `server/domain/prepaidCreditLedger.ts`, `server/domain/subscriberLifecycle.ts`, `server/domain/billingMigrationRehearsal.ts`, `src/services/`, `src/hooks/`, relevant views and components, `src/types.ts`, `firestore.rules`, `firestore.indexes.json`, and tests in `src/__tests__/` and `server/`.

This is a source-and-test audit, not a production-data inventory. No Firebase was accessed. The repository cannot show actual document populations, retention obligations, traffic, external clients, or whether an old deployed client still calls a reachable route. “No caller found” is therefore a search result, not proof that external dependencies or stored records do not exist.

The route listings below cover the relevant legacy and protected API families found in source; the Worker has a wider route graph. Authentication is applied at the registered handlers. The shared Worker auth/session boundary and route registration are not removal candidates as part of LR-00.

## 3. Route and API inventory

### 3.1 Legacy garage-owner billing and recharge surfaces

| Method and route | Observed contract and status | Readers / callers | Writers / effects | Classification and removal assessment |
|---|---|---|---|---|
| `POST /api/transactions/recharge-garage` | **Reachable active writer.** Requires authenticated Admin; validates `garageId`, `packageId`, idempotency key and optional `adminDetails`. Reads an active package and garage; success returns `{success:true,data:{newExpiry,totalAdminRevenue}}`; errors include admin, package and garage failures. | `src/services/adminBillingService.ts` direct-recharge method and Admin garage-details workflow; `src/__tests__/adminDirectRecharge.test.ts`. | Transaction sets `billingModel:'subscription'`, `balanceExpiry`, `isTrial`, lock state, capacity/package/recharge/revenue fields; writes `activity_logs` recharge row, `recharge_approved` domain event and idempotency record; may extend a referrer's expiry and write a referral-day log. | **Legacy/active overlap; not safe to remove as a documentation-only inference.** It directly conflicts with the intended prepaid-only retirement boundary. LR-01 is specifically responsible for its tested fail-closed cutover. Do not remove or modify it during LR-00. |
| `POST /api/recharge-requests/create` and `POST /api/recharge-requests` | **Reachable creation aliases.** Authenticated, financial-rate-limited; body includes garage/package/request type and idempotency details. Successful response `{success:true,id,data}`. Checks a pending-request guard and existing pending requests. | `src/hooks/useGarageSubscription.ts`, `src/services/delegateService.ts`, delegate recharge UI; tests including `src/__tests__/duplicationContracts.test.ts` and financial route tests. | Creates `recharge_requests/{id}`, updates `recharge_request_guards/{garageId}`, writes idempotency record. Fields include garage/package/request type, requester identity/role, pending status, created time, optional amount/delegate data. | **Legacy/active overlap.** LR-02 must coordinate both aliases, callers, pending state and historical list/report readers. Not safe to remove from the baseline. |
| `POST /api/recharge-requests/process` and `POST /api/transactions/approve-recharge-request` | **Fail-closed approval aliases.** After authentication return HTTP 410 `{success:false,error:'LEGACY_BILLING_MODEL_RETIRED'}` before the retained implementation. | `src/services/delegateService.ts` and Admin approval UI still contain callers; these currently encounter the 410 response. | No writes execute. The unreachable body contains legacy approval/wallet/recharge/delegate/referral writes and must not be mistaken for live behavior. | **Legacy/retired tombstone with dead tail.** Preserve the explicit response until callers are removed or compatibility is explicitly changed; remove the dead body only after inventory and review. |
| `POST /api/recharge-requests/reject` and `POST /api/transactions/reject-recharge-request` | **Reachable rejection aliases.** Authenticated Admin; requires request ID and idempotency key; updates pending request to rejected, returns `{success:true}`; missing key is 400 and non-Admin is 403. | Admin request UI through `delegateService`; route and authorization tests. | Updates `recharge_requests/{id}.status/resolvedAt`, clears matching pending guard, writes `recharge_rejected` event and idempotency record. | **Legacy/active overlap.** Not a 410 tombstone. LR-02 must explicitly handle this surviving write and its pending-request/history semantics; do not report all recharge-request mutations as retired. |
| `GET /api/recharge-requests` | **Reachable Admin list.** Authenticated Admin; optional status and cursor pagination; returns `{success:true,requests,items,hasMore,nextCursor}`. | Admin pending-request/dashboard and request views; financial route tests. | None; reads `recharge_requests`. | **Legacy read surface, active.** Keep until callers and retained history are addressed. |
| `GET /api/recharge-requests/my` | **Reachable scoped list.** Authenticated delegate/garage scope; same paged response; empty page when no entity scope. | Delegate and garage request-list service/UI; route tests. | None; reads `recharge_requests` by delegate or garage scope. | **Legacy read surface, active.** Keep until callers and retained history are addressed. |
| `POST /api/transactions/admin-topup-balance` | Authenticated request returns HTTP 410 `{success:false,error:'LEGACY_BILLING_MODEL_RETIRED'}` before body parsing/Firestore work. | `src/services/garageService.ts` and Admin garage-details top-up state still call it. | No active writes. Dead tail references `garages.balance`, `manual_credit_ledger`, wallet events and idempotency. | **Retired tombstone with dead tail; current Admin caller remains.** Do not treat the legacy EGP balance as prepaid credits. Retire caller and tail only in an authorized later task. |
| `POST /api/transactions/garage-self-subscribe` | Authenticated request returns HTTP 410 before body/Firestore work. | `src/services/garageService.ts` compatibility method; no current UI execution established. | No active writes; dead tail contains owner-side balance/package logic. | **Retired tombstone with dead tail.** Retain 410 compatibility until caller audit; not a customer-subscription route. |
| `POST /api/transactions/use-referral-reward` | Authenticated request returns HTTP 410 before body/Firestore work. | `garageService.useReferralRewardDays` remains in source; no active UI call was found. | No active writes; dead tail references referral days and expiry. | **Retired tombstone with dead tail.** Do not remove current prepaid referral-credit awarding with this route. |
| `POST /api/admin/garages/:id/extend-fair-use` and `POST /api/garages/:id/extend-fair-use` | Authenticated aliases return HTTP 410 before retained handler logic. | Legacy client compatibility/test references; audit did not establish a live UI user. | No active writes; dead tail references fair-use state and activity logs. | **Retired tombstones.** Keep response contract until callers are inventoried; dead body is a later cleanup candidate. |

### 3.2 Current routes that share words or data areas but are protected

| Method and route | Role and contract | Data readers/writers | Classification / preservation |
|---|---|---|---|
| `POST /api/garages/:id/credit-grants` | Admin-confirmed prepaid grant; payment confirmation, reference, reason and idempotency required; integer amount/package invariants; payment in EGP remains separate from credit quantity. | Reads garage, credit-referral marker and optional credit-bundle package; atomically writes `creditBalance`, `credit_ledger`, grant event/activity, idempotency, and eligible referral award. | **Current prepaid. Protected.** This is not wallet top-up or owner checkout. |
| `GET /api/garages/:id/credit-ledger` | Admin or correctly scoped garage/staff read; paged result; payment/audit fields are redacted for non-Admin readers. | Reads `credit_ledger` by garage and time/cursor. | **Current prepaid audit contract. Protected.** |
| `POST /api/vehicles/check-in`, `/check-out`, `/delete`, `/refund` | Server-authoritative vehicle operations and correction/refund paths. | Check-in resolves monthly-subscriber status, then may atomically debit one eligible prepaid credit; correction may restore the original bucket and write ledger/event/log state. | **Current entry/refund. Protected.** Egyptian plate normalization, idempotency, Firestore transaction atomicity, and no vehicle mutation after a rejected debit are invariants. |
| `POST /api/subscribers/add`, `/renew`, `/update`, `/delete` | Customer-owned monthly parking subscriber lifecycle, authenticated and scoped. | Reads/writes `garages/{garageId}/subscribers/{subscriberId}`, maintained counts/events and idempotency; prepaid renewal consumes five paid credits atomically where applicable. | **Current customer subscription. Protected.** It is distinct from garage-owner time-based billing. |
| `POST /api/check-subscriber`, `GET /api/admin/monthly-subscribers-summary`, `GET /api/admin/subscribers` | Subscriber lookup and Admin reporting/read surfaces. | Reads subscriber records and maintained summaries; summary fallback can rebuild summary data. | **Current customer-subscription readers. Protected.** |
| `GET /api/financial-summary`, `GET /api/reports/financial` | Authenticated, permission-scoped report aliases; bounded paged historical report with inclusive start/exclusive end. | Reads events, settlements, and credit ledger; presents legacy wallet/recharge and current prepaid activity as separate measures. | **Historical/current shared report. Protected.** Do not remove historical sources because legacy writers are retired. |
| Delegate dashboard and settlement routes (`GET /api/delegate/commission-earnings`, `GET /api/delegates/dashboard`, `POST /api/delegate/withdraw-commission`, `POST /api/delegates/settle-account`) | Scoped delegate/admin operations; settlement is Admin/idempotency gated. | Reads recharge requests/delegate totals; writes settlement record, delegate totals and settlement event. | **Shared active delegate operations and historical accounting.** Not garage-owner wallet balance; inventory separately before any removal. |

## 4. Persisted collections and field inventory

| Collection / field group | Observed readers | Observed writers | Classification and preservation |
|---|---|---|---|
| `garages/{id}.balance` | Legacy Admin/UI compatibility and billing rehearsal; not the current prepaid balance. | Garage creation initializes a legacy zero; dead 410 handler bodies contain additional writers. | **Legacy/historical.** Never reinterpret or auto-convert as credits. Stored population and external consumers unknown. |
| `balanceExpiry`, `billingModel`, `isTrial`, `dailyCapacity`, `activePackageName`, `packageName`, `unlimitedFairUse`, `lastRechargeDate`, `lastRechargeAmount`, `lastRechargePackageName`, `totalAdminRevenue` | Garage summaries, legacy UI/expiry checks, migration rehearsal, legacy reports and current Admin recharge path. | Active `recharge-garage` writer; garage creation; dead tail handlers. | **Legacy/active overlap and shared read compatibility.** Not removable while active route or readers remain. `billingModel:'prepaid_credits'` and `creditBalance` are current and must stay distinct. |
| `garages/{id}.creditBalance.{paid,referral,trial}` and `firstPaidCreditGrantAt` | Vehicle entry, subscriber renewal, dashboard/cards and Admin grant/reporting. | Admin grant, vehicle debit/restore, subscriber renewal and eligible referral grant. | **Current prepaid. Protected.** Preserve bucket-specific rules and atomic updates. |
| `credit_ledger/{entryId}` | Credit history endpoint, financial reports, dashboards. | Credit grants, vehicle debit/restore, subscriber renewal, referral grant. | **Current financial/audit ledger. Protected.** Preserve deterministic/idempotent identity, bucket/kind, amount and before/after balances, time, and payment metadata access control. |
| `credit_referral_awards/{referredGarageId}` | First-grant idempotency check. | Current prepaid grant flow records award or ineligible status. | **Current referral control. Protected.** Do not conflate with referral-day fields. |
| `recharge_requests/{id}` and `recharge_request_guards/{garageId}` | Admin/delegate/garage lists, dashboard pending counts and summary; guards and records also used by creation/rejection. | Reachable create and reject endpoints; approval writer is fail-closed. | **Legacy/active overlap plus historical records.** Preserve request/pending semantics until callers and history are explicitly handled. |
| `manual_credit_ledger/{id}` | No live application reader found in this source audit; external audit use unknown. | Only retained dead bodies after 410 were found. | **Historical/uncertain.** Do not delete without retention/export and external-consumer decision. |
| `activity_logs/{id}` | Garage recharge/history view, Admin/delegate activity services and CSV export, vehicle activity readers. | Current vehicle/credit operations and the active legacy recharge route; dead tails also describe older writes. | **Shared current and historical.** Preserve readable older formats, `actionType`, `timestamp`, `garageId`, `packageId`, `amount`, `plateNumber`, and details consumed by reports/UI. |
| `garages/{id}/events/{id}`, `delegates/{id}/events/{id}`, collection-group `events` | Financial reports, projection/reconciliation rebuilds and audit readers. | Current and legacy route transactions, subscriber/vehicle operations and delegate settlement. | **Shared current and historical.** Preserve event types, aggregate pairing, idempotency and timestamp contracts. |
| `settlements/{id}` and delegate total/cutoff fields | Financial reports and delegate/Admin dashboards. | Admin settlement route, plus existing legacy recharge operations that update commission totals. | **Historical/active delegate accounting.** Preserve cutoff and settlement distinction; not garage balance. |
| `packages/{id}` fields `catalogType`, `creditQuantity`, `price`, `durationDays`, `dailyCapacity`, `isActive`, discounts | Current credit-grant template validation, Admin catalog, and legacy time-package/recharge compatibility. | Admin package catalog operations. | **Shared.** `credit_bundle` and `legacy_time` are distinct. Do not bulk-delete packages or remove shared fields based on names. |
| `garages/{id}/subscribers/{id}` fields `plateNumber`, `plateNumberRaw`, `startDate`, `endDate`, owner/contact metadata | Public operational lookup, vehicle check-in, Garage UI, Admin list/summary and maintained summaries. | Subscriber add/renew/update/delete routes. | **Current customer monthly subscription. Protected.** Preserve normalized Egyptian plate identity, original plate data as applicable, date validity, plate immutability and renewal semantics. |
| `system_config/global` fields `walletNumber`, `subscriptionPrices`, `monthlySubscribersFlatFee`, surcharge/related fee aliases | System-config endpoints/hooks and legacy pricing/UI flows. | Admin system-config endpoint and compatibility clients. | **Shared/uncertain.** Wallet payment instructions and monthly-subscriber fees are not garage credit balances. Trace each caller/config consumer before removal. |
| `topup_requests`, `referral_rewards`, `referralBonusBalance`, `totalReferralRewardDays`, `referralRewardClaimed`, `lastReferralRewardAt`, `totalGaragesReferredCount` | Migration rehearsal, legacy UI/report compatibility, or no substantive source reader found for some fields. | No active writer found for some; direct recharge route writes selected referral-day fields; dead tails preserve older writers. | **Historical/uncertain.** No source-level absence proves no stored data or external consumer. Never automatically convert day/cash values to current referral credits. |

## 5. Reader/writer and helper matrix

| Area / exact symbols | Readers and callers | Writers | Classification / constraints |
|---|---|---|---|
| Direct Admin recharge: `server/garageRoutes.ts` route `POST /api/transactions/recharge-garage`; `adminBillingService` direct-recharge method | Admin garage details; `adminDirectRecharge.test.ts`; activity and financial report readers. | Active transactional writer of legacy subscription/expiry/package/revenue, events, logs, referral-day rewards and idempotency. | **Legacy/active.** LR-01 target. Test/caller presence means not dead code today. |
| Recharge request workflow: `handleCreateRechargeRequest`, `handleApproveRechargeRequest`, `handleRejectRechargeRequest`; `delegateService`, `useGarageSubscription`, `useGarageSync`, Admin request components | Admin, delegate and garage request lists; pending summary; tests. | Create and reject are active. Approval aliases return 410 before dead writer body. | **Legacy/active overlap.** Create and reject must not be mistakenly documented as all disabled. LR-02 needs caller, status, list, pending guard, commission and history audit. |
| Current prepaid ledger: `grantPaidCredits`, `awardReferralCredits`, `debitRegularEntry`, `debitSubscriberRenewal`, `restoreCredits`, `materializeCreditLedgerEntry` in `server/domain/prepaidCreditLedger.ts` | Vehicle, subscriber, grant, ledger and report paths. | Current routes call domain helpers and persist results transactionally. | **Current/shared.** Do not remove shared helpers until every call is inventoried. |
| Customer subscriber domain: `server/domain/subscriberLifecycle.ts`, subscriber routes and `lookupSubscriber` helpers | Check-in, subscriber lookup, Garage UI, Admin summaries. | Add/renew/update/delete; renew may write credit ledger and balance. | **Current/shared.** Keep date-based customer subscription separate from garage billing expiry. |
| Legacy time helper family: `server/domain/subscriptionBilling.ts`, expiry/fair-use helpers and `extendSubscriptionExpiry`/referral-day logic | Active Admin recharge route, retained dead tails, legacy package/UI compatibility and migration tests. | The active direct-recharge path consumes expiry/referral logic. | **Shared with active legacy path.** Not removable before LR-01 and full caller inventory. |
| Shared Firestore transaction/idempotency/event/summary utilities: `server/firebaseWorkerAdmin.ts`, `server/idempotency.ts`, event recorder and maintained summary helpers | All active protected mutations, reports and fallback readers. | Active route transaction callbacks. | **Shared/current.** Preserve atomic source reads, balance/ledger/event/idempotency coupling and summary invalidation/rebuild. LR-00 does not assess or alter database routing/retry policy. |
| Frontend API boundary `src/api/apiClient.ts` | All listed API services. | Sends auth/session/correlation/idempotency headers and sanitized bodies. | **Shared/current.** Do not bypass while retiring individual service callers. |
| Admin balance UI: `AdminGarageDetailsView`, `garageService.adminTopupGarageBalance`, `AdminWalletView` and wallet navigation props | Top-up form state still calls a route that returns 410; other wallet component/props appear orphaned or compatibility-only. | Clear-balance UI can still write legacy balance/lock/expiry through garage update path; wallet settings use system config. | **Legacy/shared/uncertain.** Inventory separately; do not infer all UI is dead because one component appears unmounted. |
| Recharge history: `RechargeHistoryView`, `adminActivityService`, live data hooks, CSV export | Reads recharge activity, legacy package fields and referral reward markers; may synthesize display for old records. | Primarily readers; route writers create history. | **Historical/shared.** Preserve old row parsing and export fields until replaced with explicit historical read model. |

## 6. Protected contracts for any later removal work

### 6.1 Prepaid credits and atomic entry/refund behavior

- The active balance is `creditBalance` with `paid`, `referral`, and `trial` buckets; it is not `garages.balance` in EGP.
- Current grant is Admin-confirmed and auditable. Payment EGP, credit quantity, payment reference, reason, actor and idempotency metadata remain separately represented.
- A regular eligible vehicle entry consumes one prepaid credit according to the domain allocation policy. A failed/insufficient debit must not create the vehicle entry.
- Customer monthly subscriber entry is checked as an authoritative subscriber entitlement and is not charged as a regular prepaid entry.
- Authorized correction/refund restores the original debited bucket at most once; ledger and source state remain atomic.
- Preserve transaction reads-before-writes, idempotency fingerprints and coupled garage/vehicle/subscriber, ledger, event and summary changes. Do not replace these with non-atomic writes.

### 6.2 Customer-owned monthly parking subscriptions

- Keep subscriber CRUD, plate lookup, plate normalization/identity, immutable plate behavior, and valid date-range rules.
- Keep `startDate`/`endDate` and subscriber summary/report readers distinct from garage-owner `balanceExpiry`.
- Where prepaid renewal applies, renewals consume five **paid** credits, not referral/trial credits, with idempotency and ledger/audit coupling.
- Keep 30-day/customer package eligibility and the subscriber check-in exception where these remain active.

### 6.3 Current referral credits

- Preserve the first confirmed paid-grant eligibility and one-time marker, the exact 20-credit award, prepaid referrer requirement, distinct referrer/referred garage IDs, ledger entry, and report visibility.
- A current referral credit in `creditBalance.referral` is not a legacy free day, EGP referral balance, `referral_reward` activity row, or referral-day marker.
- Do not silently convert legacy referral cash/days into credit buckets.

### 6.4 Historical reporting and retained data

- Preserve `activity_logs`, recharge/request/package documents, legacy garage fields, events and settlements as readable historical inputs until an explicit owner-approved retention/migration decision.
- Preserve financial report separation among legacy recharge, wallet EGP, prepaid EGP payments, credit activity, commission/settlement and current totals; do not add EGP and credits together.
- Preserve report date-boundary and cursor semantics, delegate scoping, historical settlement cutoffs, old activity-log fallback parsing, and event schema/type pairing.
- Do not modify Firestore rules, indexes, database routing, Firebase documents, or migration behavior as part of LR-00 or by implication from this inventory.

### 6.5 Shared helpers and identity

- Preserve Egyptian license-plate normalization and authoritative subscriber/vehicle identity checks.
- Shared helpers stay until every caller (including indirect route wiring, tests and UI/service compatibility paths) has been traced.
- Preserve the Worker auth/session boundary and `src/api/apiClient.ts` behavior while changing individual legacy routes in a later task.

## 7. Tests, fixtures, scripts, and documentation evidence

Relevant coverage found includes (test names are paraphrased only where suite descriptions are lengthy):

- `src/__tests__/adminDirectRecharge.test.ts` — frontend direct-recharge caller contract.
- `src/__tests__/cloudflareWorkerCreditGrant.test.ts` — prepaid grant, ledger visibility/redaction, referral awards and non-migration of legacy garages.
- `src/__tests__/cloudflareWorkerVehicleRoutes.test.ts` and prepaid-credit route tests — entry debit, no-write on insufficient credit, subscriber exemption and restore behavior.
- `src/__tests__/cloudflareWorkerSubscriberRoutes.test.ts`, `server/subscriberRoutes.characterization.test.ts`, `server/domain/subscriberLifecycle.test.ts` — subscriber lifecycle, plate/date contract, five-credit renewal, idempotency and summaries.
- `src/__tests__/cloudflareWorkerFinancialRoutes.test.ts`, `server/financialReporting.test.ts` — recharge request pagination/scoping, report filtering, wallet-versus-credit separation, delegate settlements and historical totals.
- `src/__tests__/workerAuthorizationMatrix.test.ts` — role/scope protection for selected routes.
- `src/__tests__/workerRouteExtraction.test.ts` — route family ordering and total route count. This structural check is not a full per-route behavior matrix.
- `src/__tests__/duplicationContracts.test.ts` and `docs/duplication-contract-tests.md` — request payload/duplication contracts.
- `server/domain/prepaidCreditLedger.test.ts`, `server/domain/subscriptionBilling.test.ts`, `server/domain/billingMigrationRehearsal.test.ts` — pure credit/referral/time-policy and synthetic migration-rehearsal invariants.
- `firestore.rules` tests and `firestore.indexes.json` document allowed client access/query-index contracts; source rules do not by themselves establish actual production deployment or Admin SDK behavior.
- `.github/workflows/production-gate.yml`, `tools/ci-check.ts`, and `tools/maintainability-check.ts` — CI/release validation. Markdown-only PRs use the repository's text-only gate; production deployment is not implied by this documentation change.

Audit gaps: test fixtures are commonly inline mock objects rather than a centralized canonical legacy-data fixture set; the route-count test does not cover all route behavior permutations; no coverage threshold or automated comprehensive legacy caller/field inventory was found. These are gaps in evidence, not evidence that runtime consumers do not exist.

## 8. Classification and removal disposition

| Item group | Classification | Safe assessment at this baseline |
|---|---|---|
| Direct `recharge-garage` route and Admin caller | Legacy/active | **Not removable yet.** It writes time-based state; LR-01 must first add an explicit fail-closed contract and tests. |
| Recharge request creation, rejection, lists and pending UI | Legacy/active overlap | **Not removable yet.** Creation and rejection remain reachable and lists/callers remain. LR-02 needs a coordinated route/UI/history decision. |
| Approval, wallet top-up, self-subscribe, referral-day claim and fair-use tombstones | Legacy/retired | Preserve current 410 response while callers are inventoried; dead tails are cleanup candidates only after explicit review. |
| Legacy `balance`, expiry/package/fair-use/referral-day fields and old package records | Legacy/shared/historical | **Not safe to delete/migrate.** Active readers/writer and historical/report/migration contracts remain. No Firebase population audit occurred. |
| Prepaid balance, credit ledger and credit-grant/audit path | Current/protected | **Not removable.** Current entry, grants, renewals, corrections, reporting and UI depend on these. |
| Customer monthly parking subscriptions, dates, lookup and lifecycle | Current/protected | **Not removable.** Active entitlement, check-in, UI and report behavior depend on these. |
| Current referral-credit award and marker | Current/protected | **Not removable.** Exactly-once, ledger, debit, correction and reporting paths depend on them. |
| Events, activity logs, settlements and financial reports | Historical/current shared | **Not removable or erasable on source-only evidence.** Retain data and report compatibility pending explicit retention decision. |
| Wallet-number/config/package compatibility and orphaned-looking UI | Shared/uncertain | Trace stored config, external use, persisted tab state and all callers before removal. |
| Firestore rules/indexes and Firebase data | Protected boundary | No edits or operations authorized by LR-00. Actual deployment/population not verified. |

## 9. Unknowns and evidence gaps

1. No Firebase read was performed; actual prevalence and recency of legacy wallet, expiry, package, request, referral-day, event or activity records is unknown.
2. No production traffic or API logs were inspected; source/test callers prove reachability, not usage volume or version compatibility.
3. External clients, dashboards, exports, scheduled jobs or audit consumers may exist outside this repository; a missing repository reference cannot disprove them.
4. At the baseline, `recharge-garage` was active and the older checkpoint incorrectly said it was retired. PR #169 resolved that source-level conflict; the current route is a tested 410 tombstone. Baseline observations remain historical evidence and do not establish production data/traffic status.
5. At the LR-00 baseline, recharge-request creation and rejection remained reachable even though older plan wording grouped them among disabled paths. LR-02 has since retired the in-app workflow; this baseline item is historical evidence, and no stored request data was deleted or migrated.
6. Some Firestore rules do not explicitly model current server-only collections and some legacy rule validations appear stale. This inventory does not authorize rules changes; actual deployed rules/indexes were not queried.
7. The custom Firestore REST transaction adapter's retry/concurrency behavior beyond the inspected implementation was not assessed here. LR-00 preserves transaction use; it does not make a new concurrency guarantee.
8. Whether `walletNumber`, historical conversion rehearsal code, manual-credit ledger, and fields with no source reader have external, regulatory, or owner-retention requirements is unresolved.

## 10. Recommended next safe implementation step

LR-00 was reviewed and merged in PR #167; LR-01 was completed in PR #169. LR-02 is complete: PR #171 merged as `935e93c336e61bcc4cfc4cf259c4cd8be028bb0d`, post-merge Production Gate #39214331450 passed deployment/smoke, and live health/version report that SHA. The selected scope removed all in-app recharge-request history readers while preserving garage applications, delegate settlement, historical `activity_logs`, and stored request/guard records. The garage-deletion cleanup adapter remains unchanged; no destructive cleanup, migration, Firebase data/rules, or routing change occurred. Local full CI passed 138 test files / 889 tests; focused regressions passed 3 files / 27 tests. LR-03 remains unselected; stop pending owner direction.
