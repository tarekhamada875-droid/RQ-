# RQ- Business-Logic Audit

**Scope:** Read-only synthesis of the supplied area audits for authentication and sessions; garage lifecycle, trials, subscriptions, and capacity; vehicle operations and subscribers; recharge, wallet, packages, and financial accounting; tenant isolation; and reports, projections, dashboards, and reconciliation.

**Review basis:** The findings below preserve the supplied repository evidence and line ranges. They distinguish confirmed implementation defects from questions requiring a product decision. No files were modified and no deployment was performed.

## Executive summary

The repository has several sound transaction and authorization foundations, but the cross-module invariants are not consistently enforced at the server boundary. The most consequential confirmed issue is session authorization: protected middleware verifies a Firebase UID and an active UID-keyed security document, but does not verify the entity lock or the request/session identity. A superseded tab can therefore continue making actionable API calls. The second critical issue is financial: approving a `balance_topup` request follows the subscription-approval path, does not credit the wallet, and can grant a free subscription and commission.

Other high-impact defects affect tenant isolation, package entitlement, subscriber recognition, financial idempotency, reporting completeness, and dashboard projections. Several are UI/server mismatches: lock state is enforced by the dashboard but not vehicle APIs; the UI shows discounted package prices while approval ignores package discounts; client correction ownership uses a different identifier from the server; delegate request metadata required by client/rules is stripped at creation; and an apparent admin “clear wallet/end subscription” action omits the fields that would perform the transition.

The system does correctly use Firestore transactions for important vehicle, package-approval, self-subscription, reward-claim, and refund paths. It also has meaningful server-side role/scope checks on most subscriber, vehicle, report, and recharge-approval routes. Those strengths do not compensate for missing checks on direct Admin SDK routes, because Firestore rules do not protect those paths.

The recommended order is: first close stale-session and cross-tenant authorization paths; then correct wallet/package financial transitions and make all monetary mutations replay-safe; next repair subscriber and vehicle state invariants; then repair report/projection/read-model correctness; finally resolve display, lifecycle, and policy ambiguities with explicit product decisions and regression tests.

## Severity-ranked confirmed findings

### Critical

#### C1. Protected API middleware does not enforce entity session ownership or session ID

**Evidence.** `server/middleware.ts:264-345` verifies the Firebase token, scans security collections by UID, accepts the first `isActive` document, and populates `req.user`. It never compares `req.user.sessionId` to a request-supplied session ID and never reads the entity `currentSessionId`. Login provisioning writes the entity lock and UID-keyed security document at `server/routes/auth.ts:160-197`. The entity-lock check exists only in the optional validate-or-refresh endpoint at `server/routes/auth.ts:533-541`. Frontend lock detection is only a snapshot listener at `src/hooks/useGarageSession.ts:345-357`.

**Impact and connected logic.** After session A is superseded by session B, an old tab or direct caller with A’s Firebase UID can still pass `requireAuth` while its UID security document remains active. Downstream write/report routes trust `req.user`, so stale authorization remains actionable. The normal UI flows through `src/hooks/useAdminAndGarageManagement.ts:150-173` to the auth services and session-claim routes, but direct API callers are not protected by client listeners or validate-or-refresh.

**Proper solution.** Make `requireAuth` validate the security document, session ID, timeout, and the bound entity’s `currentSessionId` on every request. Prefer one authoritative UID session record or a server-verifiable nonce. Reject inconsistent `entityId`/`garageId` bindings. Add tests for supersession from an old tab, direct API calls, and each role.

**Confidence:** High.

#### C2. `balance_topup` approval does not top up the wallet and can grant a free subscription and commission

**Evidence.** The create API accepts `requestType=balance_topup` and persists only `amount` at `server/app.ts:795-815`. The delegate hook labels the request as an immediate wallet addition at `src/hooks/useGarageSubscription.ts:134-149`, and the admin request UI describes it as wallet credit at `src/components/admin/AdminRequestsView.tsx:145-180, 215-220`. The approval route has no `balance_topup` branch: it defaults `durationDays` to 30 and `basePrice` to `revenueAmount/price` at `server/routes/recharges.ts:251-265`, skips package lookup for this type at `:267-295`, updates subscription fields but never `garage.balance` at `:338-371`, and writes a recharge approval event. The same default path can update monthly statistics and commission at `server/routes/recharges.ts:306-328`.

**Impact and connected logic.** Approving a wallet request leaves the wallet unchanged, activates or extends a subscription at zero effective revenue, records the wrong business action, and can create a commission entitlement. The user may retry the top-up or believe funds exist when they do not. Admin direct top-up is a separate path that does update balance at `server/routes/recharges.ts:505-568`, proving the missing transition is not shared intended behavior.

**Proper solution.** Add a dedicated transactional `balance_topup` branch that validates `requestData.amount`, increments `garages/{id}.balance`, records previous and new balances, emits a distinct wallet-topup event, and does not change subscription, package, monthly-stat, or commission fields. Until implemented, disable approval of `balance_topup` requests.

**Confidence:** High.

### High

#### H1. Logout can revoke a newer session and can leave server state active

**Evidence.** `src/hooks/useGarageSession.ts:100-118` calls `releaseEntitySession` and then unconditionally client-deletes all five role security documents for the UID. `src/services/authSessionService.ts:129-149` starts server release calls without awaiting them, then runs a separate client transaction. `src/services/authService.ts:107-130` acquires the Firebase token asynchronously, and the hook calls `signOut` at `src/hooks/useGarageSession.ts:120`. The server release conditionally checks `sessionId` at `server/routes/auth.ts:611-627`, but the direct client deletes do not. The intended owner-checked transaction is `src/domain/auth/sessionTransactions.ts:54-75`.

**Impact and connected logic.** An old tab can delete a newer same-UID session document. Fire-and-forget release can lose the token or race `signOut`, leaving server state active while the UI believes logout completed. This interacts directly with the UID-only middleware defect in C1.

**Proper solution.** Remove client-side security-document deletion. Await one authoritative server release that checks UID, role, entity ID, and session ID transactionally; complete it before `signOut`; and handle or retry failures explicitly.

**Confidence:** High.

#### H2. PIN uniqueness is a check-then-write invariant and lookup errors fail open

**Evidence.** Creation checks availability and then saves separately at `server/routes/garages.ts:378-390`, `server/routes/delegates.ts:20-38`, and `server/app.ts:378-390, 427-439`. Rotation does the same at `server/app.ts:494-503` and `server/routes/auth.ts:774-792`. `saveEntityPin` writes `private_pins/{entityId}` at `server/utils.ts:141-162`, so the document key is the entity, not a unique PIN hash. Separately, `server/utils.ts:286-309` suppresses private-pin query errors; `:316-320` often returns no matches, and `checkPinAvailabilityAcrossAll` returns `taken:false` on an empty result at `:362-396`. Creation and rotation trust that result at the routes above.

**Impact and connected logic.** Concurrent requests can assign the same PIN. A transient Firestore, index, or permission error can also permit duplicate assignment or incomplete authentication. Login may return a generic invalid-credential result during an outage and later produce `PIN_NOT_UNIQUE`. The canonical login path intentionally aggregates matching private pins and returns `PIN_NOT_UNIQUE` at `server/routes/auth.ts:84-132`, so the global uniqueness behavior is already implied by product behavior.

**Proper solution.** Create a deterministic reservation document keyed by the normalized-PIN lookup hash and create/update it transactionally with the private PIN record. Distinguish `NOT_FOUND` from `QUERY_ERROR`; fail closed for authentication and PIN creation/rotation; return controlled service-unavailable responses; and reconcile legacy reservations.

**Confidence:** High.

#### H3. Any authenticated user can change any garage’s trial decision

**Evidence.** `server/routes/garages.ts:272-293` exposes `POST /trial-decision` behind `requireAuth` but performs no role, ownership, or garage-scope check. It accepts any validated `garageId`, writes `trialDecision` and `trialDecisionAt` at `:287-293`, and logs the action at `:295-306`. The route is mounted under `/api/garages` in `server/app.ts:186-190`. The same defect is independently confirmed by the role/tenant audit, which notes that the route uses Admin SDK and bypasses Firestore rules.

**Impact and connected logic.** A staff member, garage session, delegate, or supervisor can mutate another tenant’s lifecycle decision and create a misleading audit record. Creation sets `isTrial` and `balanceExpiry` at `server/routes/garages.ts:71-113`, so this field feeds the broader trial lifecycle. The intended admin-only pattern is visible at `server/routes/garages.ts:316-329, 336-340, 535-545`.

**Proper solution.** Require the intended role, most likely admin, before reading the target garage. If non-admin access is intentional, verify exact garage ownership or delegate relationship and restrict the allowed decisions. Add cross-role and unrelated-tenant tests.

**Confidence:** High.

#### H4. Garage lock or suspension is enforced only by the dashboard, and deletion can clear it

**Evidence.** The dashboard overlay blocks rendering when locked at `src/components/garage/GarageDashboardOverlays.tsx:52-73`, and the view derives lock state at `src/components/garage/GarageDashboardView.tsx:172-173`. However, `server/routes/vehicles.ts:101-137` validates existence, expiry, and capacity but never checks `garageData.isLocked` or `isSuspended` before check-in. Check-in authorization for garage/staff/admin is at `:33-45`. Vehicle deletion unconditionally sets `isLocked:false` at `server/routes/vehicles.ts:480-528`, especially `:513-518`.

**Impact and connected logic.** A locked or suspended garage can admit vehicles through a direct or replayed API request. An authorized correction or deletion can silently reopen an administrative lock. Admin details writes both fields at `src/components/admin/AdminGarageDetailsView.tsx:358-375` through `src/services/garageService.ts:228-253` and the update allowlist at `server/routes/garages.ts:190-204`, but the separate vehicle write path never consults them.

**Proper solution.** Enforce lock/suspension in every state-changing vehicle endpoint, with an explicit policy for checkout of vehicles already inside. Never clear an administrative lock as a deletion side effect; use an explicit authorized unlock transition.

**Confidence:** High.

#### H5. Garage self-subscription trusts client package data and accepts inactive packages

**Evidence.** `server/routes/recharges.ts:640-650` loads `packages/{packageId}` and, if absent, accepts sanitized `packageData` from the caller. It calculates price, duration, capacity, and unlimited status from that object at `:657-714`. When a package exists, this path does not check `isActive`. By contrast, approval rejects inactive packages at `server/routes/recharges.ts:267-289`. The normal UI call is `src/services/garageService.ts:348-359`, but client catalog values cannot be authoritative.

**Impact and connected logic.** An authenticated garage owner can submit a nonexistent package ID plus crafted package data and buy arbitrary entitlement subject only to its balance. It can also activate an inactive package. This is a pricing and entitlement bypass.

**Proper solution.** Require an existing package document, require `isActive`, and derive every price, duration, capacity, and unlimited field from the server document. Ignore or reject package data except for display metadata. Test missing, inactive, and tampered packages.

**Confidence:** High.

#### H6. Direct financial mutations are replayable because idempotency keys are optional and not retained across retries

**Evidence.** Client methods omit keys: `adminDirectRechargeGarage` at `src/services/adminService.ts:556-570`, `adminTopupGarageBalance` at `src/services/garageService.ts:335-345`, and `garageSelfSubscribe` at `src/services/garageService.ts:348-359`. Routes accept nullable keys at `server/routes/recharges.ts:19-23, 512-516` and the corresponding self-subscribe validation. `server/idempotency.ts:41-50` treats no key as non-duplicate. The affected transactions write financial state at `server/routes/recharges.ts:72-182, 530-568, 672-745`.

**Impact and connected logic.** A timeout, double click, second tab, or replay can extend expiry and referral days repeatedly, credit the wallet repeatedly, or deduct the wallet repeatedly. Firestore transaction atomicity does not prevent a second transaction with a new or missing operation key. Recharge-request creation has a key at `src/services/delegateService.ts:161-169`, but that does not protect the direct mutations.

**Proper solution.** Require a key for every financial mutation. Generate it at the initiating UI operation and retain it across retries. Bind it to a fingerprint containing actor, target, package, amount, and relevant parameters; reject changed payloads.

**Confidence:** High.

#### H7. Financial reporting omits direct recharge, wallet top-up, and self-subscribe money transitions

**Evidence.** The report reads only collection-group `events` and settlements at `server/routes/reports.ts:20-39`. `calculateFinancialReport` counts only `recharge_approved`, `commission_earned`, and `vehicle_refunded` at `server/financialReporting.ts:73-105`. Direct recharge updates revenue and activity logs but emits no recharge event at `server/routes/recharges.ts:108-147, 177-182`; admin top-up does the same at `:530-568`; self-subscribe deducts balance and writes activity logs without a recharge or wallet-spend event at `:701-745`. Only request approval writes the expected financial events at `:402-424`.

**Impact and connected logic.** Gross recharge totals, company net revenue, and delegate unsettled totals can be lower than actual money movements. Garage totals and activity logs disagree with the accounting report. The admin financial report presents the server calculation as authoritative at `src/components/admin/AdminFinancialReportsView.tsx:58-80`.

**Proper solution.** Define a canonical financial event for every monetary transition: approved subscription, wallet credit, wallet debit, self-subscribe, commission, and refund. Emit it in the same transaction as the state mutation, include source IDs and amounts, and deduplicate in reporting. Reconcile historical activity logs and garage totals before switching the report.

**Confidence:** High.

#### H8. Monthly-subscriber lookup is fail-open and outside the check-in transaction

**Evidence.** `server/routes/vehicles.ts:62-80` performs subscriber queries before the transaction and catches all lookup errors, leaving `isSubscriberAuthoritative:false`. The transaction only rejects when the earlier flag is true at `:83-105`. The client also performs a preflight lookup at `src/hooks/useVehicleOperations.ts:108-135`. Check-in then writes vehicle and counters at `server/routes/vehicles.ts:144-201`, while checkout trusts persisted `isSubscriber` at `:340-349`.

**Impact and connected logic.** A transient query failure can admit an active monthly subscriber as a paid vehicle and consume capacity. A subscriber add, renew, or delete racing the lookup can produce state inconsistent with the check-in commit. Firestore rules make vehicle writes server-only at `firestore.rules:669-676`, so this must be fixed in the route rather than the client.

**Proper solution.** Fail closed on lookup errors and perform the authoritative subscriber read in the same transaction as the vehicle read/write, or use a transactionally maintained plate index. Add failure, race, and date-boundary tests.

**Confidence:** High.

#### H9. Subscriber update can alter plate identity and other fields without uniqueness checks

**Evidence.** `server/routes/subscribers.ts:123-145` validates only dates from merged data, spreads `subscriberData` into `safeUpdates`, and does not call `validatePlate`, check collisions, or migrate the deterministic document ID. The deterministic ID was created from the original plate at `:19-49`. `SubscribersView.tsx:336-350` allows plate edits, and `adminService.ts:351-360` forwards them. The role/tenant audit also confirms that route-level Admin SDK writes bypass the stricter Firestore schema/rules.

**Impact and connected logic.** Multiple subscriber documents can claim one plate, a document ID can diverge from its plate, and arbitrary mutable business fields can be changed. Check-in searches plate fields at `server/routes/vehicles.ts:64-75`, which can return ambiguous authority. The add path’s deterministic and legacy duplicate check at `server/routes/subscribers.ts:36-49` is bypassed by update.

**Proper solution.** Use an explicit allowlist of editable fields. Prohibit plate changes or atomically move the deterministic document while maintaining a unique index. Reject immutable fields such as `garageId`, `id`, `createdAt`, and `costUnits`. Add collision and concurrent-update tests.

**Confidence:** High.

#### H10. Garage deletion is incomplete, non-atomic, and leaves reportable tenant data

**Evidence.** `server/routes/garages.ts:235-246` deletes only vehicles, subscribers, daily counts, and daily stats, then deletes the garage document. It does not delete `garages/{id}/events`, projection buckets, dashboard summary, or top-level staff references. Each subcollection is read wholesale and deleted in one batch at `:237-243`; Firestore batches have a 500-write limit. Financial reports read every event subcollection at `server/routes/reports.ts:33-39`.

**Impact and connected logic.** The UI describes deletion as permanent, but events and projections survive and remain reportable after the garage document is gone. Large tenants can be partially deleted. A retry is not idempotent and may fail again after partial progress.

**Proper solution.** Decide whether deletion is hard, soft, or audit-retaining. For hard deletion, use paginated batches or a resumable server-side deletion job covering all subcollections and top-level references. For retained events, tombstone the garage and explicitly exclude or label it in reports. Add idempotency and concurrency protection.

**Confidence:** High.

#### H11. Vehicle API accepts non-canonical plates and can bypass UI duplicate protection

**Evidence.** `server/routes/vehicles.ts:29-53` checks only truthiness and uses `plateRaw` directly as the document ID at `:91-99` and `:144-158`; it does not call `validatePlate` or normalize letters/digits. The UI canonicalizes at `src/hooks/useVehicleOperations.ts:79-82` and `RegistrationCard.tsx:224-230`. Duplicate detection is exact ID/status at `server/routes/vehicles.ts:140-142`.

**Impact and connected logic.** Equivalent physical plates with different formatting can be checked in simultaneously. Malformed IDs make subscriber lookup, vehicle lookup, checkout, and reporting inconsistent. The server is the authoritative boundary because vehicle writes are denied to clients by `firestore.rules:669-676`.

**Proper solution.** Apply one server-side canonical validator and normalizer to check-in, and use canonical raw plate as the sole identity. Add API-level normalization and duplicate tests.

**Confidence:** High.

#### H12. Dashboard active-vehicle projection is wrong after inside deletion and after rebuilds

**Evidence.** `server/deltaProjection.ts:60-65` defines `vehicle_deleted` as an empty delta. For inside deletion, `server/routes/vehicles.ts:525-526` decrements garage `carsInside`, but the same transaction records `vehicle_deleted` and writes the empty projection at `:556-580`. `server/dashboardSummary.ts:53-69` aggregates that stale delta, and reconciliation at `:73-81` does not compare `activeVehicleCount`. Separately, `server/routes/garages.ts:456-458` rebuilds the summary from daily buckets; those buckets represent movement during the day, not current occupants. The stored fallback returns the summary unchanged at `:495-509`, while the live path overrides active count from the garage document at `:511-518`.

**Impact and connected logic.** An inside deletion can leave the projection saying the vehicle remains active. A day with one entry and one checkout can rebuild to zero even when vehicles from earlier days remain inside. Live dashboards and stored/rebuilt reports can therefore disagree. Reconciliation can declare consistency while active state is wrong because it omits active count.

**Proper solution.** Emit `activeVehicleCount:-1` only when the deleted vehicle’s previous status was `inside`. Derive current active count from the authoritative inside-vehicle query or garage counter, separate from daily movement. Add active-count comparison to reconciliation and tests for inside deletion, outside deletion, prior-day occupants, and repeated deletion.

**Confidence:** High.

#### H13. Cairo day boundaries use fixed offsets that are wrong across DST regimes

**Evidence.** `server/routes/garages.ts:14-18` constructs every Cairo day as `T00:00:00+03:00` plus 24 hours; rebuild and reconciliation use those bounds at `:348-357` and `:547-550`. Event projection uses the actual `Africa/Cairo` timezone at `server/projections.ts:8-16`. The client activity-log query uses fixed `+02:00` at `src/services/vehicleService.ts:11-20, 126-143, 167-189`.

**Impact and connected logic.** Historical/winter dates can omit the first Cairo hour or include the next day’s first hour. During the opposite regime, client transaction-log fallback counts can disagree with server projections, dashboard summaries, staff performance, and daily-stat reconciliation.

**Proper solution.** Use a timezone-aware Cairo boundary implementation consistently on server and client. Add tests for both DST regimes and events exactly at local midnight.

**Confidence:** High.

#### H14. Delegate-scoped financial reports include other delegates’ settlements

**Evidence.** `server/financialReporting.ts:62-71` adds every in-range settlement to `historicalSettledTotal` and `currentUnsettledByDelegate` without checking `options.delegateId`, while event filtering applies the delegate filter at `:73-76`. The report route passes `delegateId` at `server/routes/reports.ts:20-39`, and the UI displays the settlement fields at `src/components/admin/AdminFinancialReportsView.tsx:74-80`. The same defect is independently identified by the role/tenant and projections audits.

**Impact and connected logic.** Selecting one delegate can show another delegate’s settled amount and current unsettled balance while event totals are scoped. This is materially incorrect privileged reporting and can expose unrelated financial figures within an otherwise scoped report.

**Proper solution.** Filter settlements by delegate before all settlement aggregation when `options.delegateId` is present. Add a two-delegate boundary test.

**Confidence:** High.

### Medium

#### M1. Missing or malformed `lastActive` can bypass the session timeout

**Evidence.** `server/middleware.ts:289-299` expires only when `lastActive > 0`. `src/domain/auth/sessionTransactions.ts:24-30` treats a lock as alive only when `safeDate(lastActive)` is positive. `server/routes/auth.ts:164-172, 255-263, 524-530` use the same positive-timestamp condition.

**Impact and connected logic.** Missing, malformed, or unexpectedly serialized timestamps can remain accepted indefinitely or be taken over as dead, contradicting the 15-minute policy. Timestamps are written and refreshed at `server/routes/auth.ts:175-195, 266-279, 446-459, 546-551` and `src/services/authSessionService.ts:160-168`; legacy or corrupted records enter the fail-open branches.

**Proper solution.** Treat missing or invalid `lastActive` as invalid or expired except under an explicitly bounded migration. Normalize through one shared helper and atomically deactivate invalid sessions.

**Confidence:** High.

#### M2. A Firebase UID can retain multiple role sessions while middleware chooses the first by fixed priority

**Evidence.** `server/routes/auth.ts:137-196` provisions only the matched role and does not deactivate other role documents for the UID. `server/middleware.ts:274-322` scans admin, supervisor, delegate, garage, and staff and breaks on the first active document. Logout is the only path that cleans all role documents at `src/hooks/useGarageSession.ts:110-118`.

**Impact and connected logic.** If a Firebase user logs into multiple role accounts or a prior session survives a crash, `requireAuth` may resolve the UID as admin or supervisor even when the UI is garage, staff, or delegate. Downstream scope trusts the resolved role and `garageId`, including `server/routes/helpers.ts:56-59`.

**Proper solution.** Permit one active role/session per UID and invalidate others transactionally, or use one authoritative UID session record. Do not resolve authorization by collection order.

**Confidence:** Medium.

#### M3. `verify-pin` can claim success without requiring `sessionId`

**Evidence.** `server/routes/auth.ts:68-69` treats `sessionId` as optional. Session provisioning is conditional on `effectiveUid && sessionId && adminDb` at `:135-156` and in the legacy delegate path at `:248-289`, but success still returns `sessionClaimed:true` at `:211-220` and `:291-299`.

**Impact and connected logic.** A caller that omits `sessionId` can receive successful authentication without a security-session write; subsequent protected calls fail, while the route may reset the rate limit. The normal UI supplies the value at `src/hooks/useAdminAndGarageManagement.ts:288-300`, so the defect is primarily an API contract and state-reporting defect.

**Proper solution.** Require a validated non-empty session ID for session-bearing login, or return `sessionClaimed:false` and prevent authenticated UI state. Reset rate limits only after claim succeeds.

**Confidence:** High.

#### M4. Admin clear-wallet/end-subscription action reports success but cannot write the requested fields

**Evidence.** `src/components/admin/AdminGarageDetailsView.tsx:526-537` sends `{balance:0,isLocked:true,balanceExpiry:Timestamp.fromDate(new Date())}`. `firestoreService.updateGarage` forwards to `/api/garages/update` at `src/services/garageService.ts:228-253`. The server allowlist at `server/routes/garages.ts:190-197` omits `balance` and `balanceExpiry`, so the persistence loop at `:198-204` does not write them.

**Impact and connected logic.** The UI tells an administrator the wallet was cleared and subscription ended, but Firestore balance and expiry remain unchanged. Subscription expiry is authoritative in `src/domain/garage/subscription.ts:13-26` and vehicle check-in directly requires valid `balanceExpiry` at `server/routes/vehicles.ts:110-115`.

**Proper solution.** Add narrowly authorized balance and expiry lifecycle operations, preferably a dedicated transactional endpoint with an audit log. Make the UI fail visibly if the server did not apply the transition.

**Confidence:** High.

#### M5. Zero-wallet balance contradicts an active admin-approved subscription

**Evidence.** The dashboard replaces the check-in UI when `Number(t.balance)<=0` for non-trials at `src/components/garage/GarageDashboardView.tsx:817-838`. Admin package approval activates a subscription and clears lock at `server/routes/recharges.ts:348-360` but does not change balance. Vehicle check-in authorizes using `balanceExpiry` and capacity at `server/routes/vehicles.ts:110-137`, not balance.

**Impact and connected logic.** A package paid through an admin/delegate request can be active and accepted by the API while the dashboard shows a top-up prompt. Direct API clients still admit vehicles, producing inconsistent operational behavior.

**Proper solution.** Decide whether balance is an access entitlement or a prepaid wallet. If expiry is authoritative, remove the non-trial balance gate or make it a clearly separate wallet policy. If balance is required, enforce the same rule server-side and align approval and self-subscribe transitions.

**Confidence:** High.

#### M6. Garage creation validates idempotency and PIN uniqueness but does not implement either atomically

**Evidence.** `/api/garages/create` validates an idempotency key at `server/routes/garages.ts:31-36` but never reads or stores it. It performs a separate PIN availability read at `:62-69`, allocates a new document at `:94-96`, writes the PIN at `:97`, and writes the garage at `:147`. Delegate daily-limit counting is a non-transactional query at `:42-60`.

**Impact and connected logic.** A retry after timeout can create duplicate garages; concurrent requests can pass the PIN and quota checks. A failure between PIN and garage writes can leave an orphan reservation. The client invokes this path at `src/services/garageService.ts:190-203`.

**Proper solution.** Use a transaction or durable idempotency record keyed by caller and operation key; atomically reserve/check the PIN and quota. Add compensating cleanup if separate storage remains necessary.

**Confidence:** High.

#### M7. Delegate-request package discounts shown by the UI are not applied at approval

**Evidence.** The UI price helper applies package discounts at `src/utils/index.ts:393-456`, and the package view displays discounted prices at `src/components/admin/AdminPackagesView.tsx:296-300, 347-356`. The request endpoint intentionally strips client price fields at `server/app.ts:801-815`. Approval loads package price and duration at `server/routes/recharges.ts:267-289` but calculates `discountAmount` only from `requestData.discountAmount`, which the create endpoint did not persist, at `:331-336`. Self-subscribe applies package discounts at `:658-670`.

**Impact and connected logic.** Approval can charge and report the undiscounted price while the UI showed a discount. The discrepancy propagates into revenue, activity logs, recharge requests, and events at `server/routes/recharges.ts:348-410`.

**Proper solution.** Centralize authoritative package pricing and coupon policy in a server function used by both approval and self-subscribe. Calculate the amount once and return it to the UI.

**Confidence:** High.

#### M8. Delegate-created recharge requests omit metadata required by the delegate read path

**Evidence.** The hook sends delegate and display metadata at `src/hooks/useGarageSubscription.ts:79-96, 134-152`, but the server `cleanData` contains only a subset at `server/app.ts:804-815`; `delegateId`, `delegateName`, `garageName`, and `packageName` are not persisted. Delegate listeners and duplicate checks query by `delegateId` at `src/services/delegateService.ts:177-200, 222-232`. Rules also require that field for delegate reads at `firestore.rules:539-545`.

**Impact and connected logic.** A delegate-created request may be invisible in its own pending/history view, so the UI can permit duplicate pending submissions. Admin cards can lose display metadata. Approval still locates the garage by persisted `garageId`, so this is an operational/read-model defect rather than an approval bypass.

**Proper solution.** Persist server-verified delegate ID and display snapshots, while continuing to ignore client financial values; or replace client queries with a server endpoint based on authorized garage relationships. Align rules and add create-to-read-to-approve tests.

**Confidence:** High.

#### M9. Inactive packages remain usable through direct recharge and package APIs lack schema validation

**Evidence.** Package deletion sets `isActive:false` at `server/app.ts:641-650`. Direct recharge loads package data without checking `isActive` at `server/routes/recharges.ts:42-61`. Package creation blindly spreads request data and forces active state at `server/app.ts:620-638`. Approval accepts `dailyCapacity` directly, including negative values, at `server/routes/recharges.ts:275-289`.

**Impact and connected logic.** A deleted package can still be activated through direct recharge. Malformed price, duration, capacity, or discount values can produce inconsistent behavior between package paths and invalid entitlements.

**Proper solution.** Validate and normalize package schema server-side and enforce `isActive` on every purchase/recharge route. Reject negative, non-finite, or invalid discount values.

**Confidence:** High.

#### M10. Client correction ownership uses a different identity from the server

**Evidence.** Check-in stores authenticated UID in `staffId` and `enteredByUid` at `server/routes/vehicles.ts:47, 144-157`. The service ignores supplied staff IDs at `src/services/vehicleService.ts:50-77`. The hook compares `selectedVehicle.staffId` to `currentStaff.id` at `src/hooks/useVehicleOperations.ts:365-371`; garage-owner fallback requires `staffId` to be null, although the server stores the owner UID. Server authorization compares entrant UID/entity ID at `server/routes/vehicles.ts:480-487`.

**Impact and connected logic.** Legitimate staff or garage owners can be blocked by the UI from deleting/correcting a vehicle that the server would authorize. Firestore rules encode another staff entity-ID model at `firestore.rules:174-185`.

**Proper solution.** Use one canonical UID/entity identity in client and server. Treat client ownership checks as UX hints only, and add garage-owner and staff tests.

**Confidence:** High.

#### M11. Idempotency is not end-to-end and keys are not fingerprint-checked

**Evidence.** Services generate a fresh key per call at `src/services/vehicleService.ts:30-42, 50-59, 67-77` and `src/services/adminService.ts:325-367`, so a lost-response retry becomes a new operation. `server/idempotency.ts:41-69` supports request fingerprints, but audited routes call the check without one at `server/routes/vehicles.ts:83-88, 309-315, 455-458` and `server/routes/subscribers.ts:28-35, 90-94, 132-136, 179-183`.

**Impact and connected logic.** Retried operations can duplicate attempted work, and a reused key with changed data can silently return the first result. Vehicle state guards reduce some effects but do not guarantee correct checkout cost or subscriber mutation semantics.

**Proper solution.** Retain operation identity across retries at the UI operation boundary, compute a fingerprint of relevant request fields, and reject changed payloads.

**Confidence:** High.

#### M12. Refunds on a later day can leave `daily_stats` missing or mutate the wrong legacy day

**Evidence.** The delete/refund route updates `daily_stats` only if the current-day document exists at `server/routes/vehicles.ts:530-542`; it never creates a refund-only day. It subtracts from garage revenue at `:521-524` without updating `lastTransactionDate`. Checkout updates revenue and date together at `:351-360`. The event and current projection are nevertheless written at `:556-580`. Event policy requires `refund_on_refund_date` at `server/events.ts:91-94`, and projection classifies by event day at `server/projections.ts:18-48`.

**Impact and connected logic.** A refund after a day boundary can be present in the immutable ledger and projection but absent from daily stats. Legacy counters, reports, and reconciliation can disagree until rebuild; clamping can hide a negative net.

**Proper solution.** Define one refund invariant across legacy counters, daily stats, buckets, and events. Create or update the refund-date daily stat, avoid mutating a prior day when dates differ, and add cross-day tests.

**Confidence:** High.

#### M13. Settlement filtering can misclassify current unsettled balances when the latest settlement is outside the report range

**Evidence.** `calculateFinancialReport` includes settlements only when `settledAt` falls inside the selected range at `server/financialReporting.ts:62-71`, then compares in-range recharges only to those settlements at `:73-95`. The report route passes UI dates directly at `server/routes/reports.ts:26-39`, while the UI calls the result current unsettled balances at `src/components/admin/AdminFinancialReportsView.tsx:66-80`.

**Impact and connected logic.** A settlement before the report start can be ignored, causing older or current events in the window to appear unsettled. This may be intentional for a period-only report, but the current-balance naming indicates a semantic defect.

**Proper solution.** For current balances, find each delegate’s latest settlement across all history and apply the date range only to displayed accruals. Otherwise rename the field/UI and document period semantics. Add a pre-window settlement test.

**Confidence:** Medium.

#### M14. Dashboard-summary reconciliation can declare consistency while active state is wrong

**Evidence.** `reconcileDashboardSummary` compares entries, exits, gross revenue, refund total, and net revenue at `server/dashboardSummary.ts:73-81`, but not active count. Rebuild computes `legacyDifferences.activeVehicleCount` at `server/routes/garages.ts:461-465` and still returns `consistentWithEvents` from `reconciliation.consistent` at `:466-468`. The separate reconciliation endpoint checks physical inside vehicles only for today at `:350-416`.

**Impact and connected logic.** Operators can receive a green consistency result despite stale active state, including the defects in H12. Rebuild is admin-only at `:441-447`, while dashboard reads are scoped at `:476-509`; the two callers therefore receive different correctness guarantees.

**Proper solution.** Compare active state against an authoritative count, or expose separate state and movement consistency statuses.

**Confidence:** High.

#### M15. Reconciliation cannot audit historical dates

**Evidence.** `POST /api/garages/reconciliation` accepts only `garageId` and derives today at `server/routes/garages.ts:336-350`. All reads and event comparisons are bounded to that day at `:350-416`. The rebuild endpoint accepts a date at `:541-550`, but reconciliation does not.

**Impact and connected logic.** Operators cannot verify a historical refund, deletion, or boundary incident through the read-only diagnostic endpoint. Malformed rebuild dates are not cleanly validated at `server/routes/garages.ts:445-451`.

**Proper solution.** Add an optional validated date parameter using the canonical Cairo boundary helper. Return explicit invalid-date errors and test historical dates, refund-only days, and boundaries.

**Confidence:** High.

### Low

#### L1. Legacy PIN migration is asynchronous and non-atomic

**Evidence.** `server/routes/auth.ts:240-242` and `:357-361` call `migratePinToHash` without awaiting it. The helper saves private pins, cleanses public data separately, and catches errors internally at `server/utils.ts:165-195`.

**Impact and connected logic.** Verification can succeed while migration is pending or failed, leaving legacy credential fields exposed longer and making retries inconsistent.

**Proper solution.** Await an idempotent migration, use a transaction or durable migration job/status, and monitor cleanup completion.

**Confidence:** High.

#### L2. Zero-refund deletions are counted and logged as refunds

**Evidence.** `server/routes/vehicles.ts:495-500` clamps non-billed deletions to zero, but `:513-518` always increments refund counters and `:545-555` logs `delete_refund` amount zero. The normal UI passes zero at `src/hooks/useVehicleOperations.ts:405-412`.

**Impact and connected logic.** Metrics and audit logs imply a refund when a normal correction occurred. Financial totals are not reduced at zero, so this is a reporting and audit-semantics defect.

**Proper solution.** Increment refund counters and use `delete_refund` only when `refundAmt > 0`; use a distinct correction/deletion action otherwise.

**Confidence:** High.

#### L3. Trial duration display is capped at 15 days despite a 365-day API range

**Evidence.** Creation accepts `trialDays` 1–365 and writes expiry at `server/routes/garages.ts:74-87`. `getRemainingDays` caps any trial at 15 days at `src/domain/garage/subscription.ts:41-45`; admin detail uses it at `src/components/admin/AdminGarageDetailsView.tsx:219-220, 504-510`. Delegate UI defaults to two days at `src/components/delegate/DelegateDashboardView.tsx:67-76`, while the API defaults to 15 at `server/routes/garages.ts:74-77`.

**Impact and connected logic.** A 30- or 365-day trial can be displayed as having at most 15 days remaining. Missing configuration produces different defaults by caller. Server expiry remains authoritative, so this is primarily stale display and configuration behavior.

**Proper solution.** Remove the hard-coded cap or cap at actual configured duration, and centralize one server-provided default.

**Confidence:** High.

#### L4. Subscriber UI is capped at 50 without pagination

**Evidence.** `src/services/adminService.ts:307-317` limits subscriber queries to 50. `SubscribersView.tsx:150-177` renders the returned array without continuation, total, or search. Server mutations are not similarly capped.

**Impact and connected logic.** Older subscribers cannot be found through the UI even though hidden records affect duplicate checks and check-in. This is a read-model usability defect.

**Proper solution.** Implement pagination or bounded server-side search and show an explicit incomplete-list indicator.

**Confidence:** High.

#### L5. Client subscription logic can display malformed expiry as active

**Evidence.** `isSubscriptionExpired` calls `safeDate` on any present expiry at `src/domain/garage/subscription.ts:13-26`; `safeDate` converts invalid dates to the current time at `src/utils/index.ts:12-31`. The server correctly rejects missing or invalid expiry at `server/routes/vehicles.ts:110-115`.

**Impact and connected logic.** The dashboard can expose normal UI before check-in rejects the data, confusing operators without granting server access.

**Proper solution.** Treat invalid dates as expired/invalid, surface data-integrity errors, and share a canonical date parser or tests.

**Confidence:** Medium.

#### L6. Direct recharge contains a dead delegate authorization branch

**Evidence.** The route declares `ALLOWED_ROLES=['admin']` and rejects non-admins at `server/routes/recharges.ts:13-16`, but contains an unreachable delegate ownership branch at `:31-40`. Delegate UI uses request workflow at `src/hooks/useGarageSubscription.ts:79-96`.

**Impact and connected logic.** There is no current bypass, but stale role semantics can mislead maintainers and become dangerous if the top gate is later relaxed.

**Proper solution.** Remove the branch or explicitly support delegates with complete authorization and tests.

**Confidence:** High.

#### L7. Garage report log fallback is capped at 200 records

**Evidence.** `src/services/vehicleService.ts:126-143` and `:173-189` limit activity-log queries to 200. `GarageReportsView` computes local staff counts and revenue from that list at `src/components/garage/GarageReportsView.tsx:108-124`; summary headlines may come from a separate endpoint at `:130-140`.

**Impact and connected logic.** High-volume days undercount staff performance and fallback totals while immutable events remain complete.

**Proper solution.** Use server summary/report APIs or paginate logs. If a partial view is intentional, show that it is partial.

**Confidence:** High.

## Verified-correct areas

The following areas were explicitly supported by the supplied audits and should be preserved while fixing the defects:

- Firebase ID tokens are required and verified for pre-session routes at `server/middleware.ts:194-231`; `verify-pin` rejects a body UID that differs from the verified UID at `server/routes/auth.ts:46-65`.
- PIN role routing is server-owned and uses salted PIN hashes plus lookup hashes before fetching public entities at `server/routes/auth.ts:70-90` and `server/utils.ts:141-158, 286-313`. Credential fields are removed from responses at `server/routes/auth.ts:109-117, 243-246`.
- The intended session-lock transaction rejects a different live `currentSessionId` and owner-checks release at `src/domain/auth/sessionTransactions.ts:15-75`; the defect is that other paths bypass or duplicate it.
- Vehicle check-in uses a Firestore transaction that reads garage, vehicle, and daily stats together, checks duplicate state, and supports idempotency when a key is supplied at `server/routes/vehicles.ts:83-99, 140-170, 254-256`.
- Package approval is admin-only, transactionally checks request status, rejects inactive catalog packages, updates related accounting together, and stores idempotency state at `server/routes/recharges.ts:193-226, 267-371, 434-435`.
- Subscription expiry is enforced authoritatively for check-in, including missing and invalid expiry rejection, at `server/routes/vehicles.ts:110-115`.
- Garage summary reads are scoped to admin or matching garage/staff garage ID at `server/routes/garages.ts:476-487`; dashboard rebuild and reconciliation are admin-only at `:337-347` and `:441-455`.
- Trial creation validates and defaults server-side and stores expiry, trial flag, capacity, package label, and audit log together at `server/routes/garages.ts:71-113, 147-167`.
- Unlimited packages use canonical `dailyCapacity=0` and the normal check-in path applies the fair-use evaluator at `src/constants/packages.ts:5-20` and `server/routes/vehicles.ts:117-137`, `server/unlimitedFairUse.ts:93-168`.
- Vehicle scope is session-derived for garage/staff, mismatched body garage IDs are rejected, and admin is the intentional cross-garage exception at `server/routes/vehicles.ts:33-45, 282-294, 431-443`; focused scope tests passed, including supervisor/delegate rejection.
- Check-in, checkout, and positive refunds update vehicle, garage counters, daily stats, activity logs, immutable events, and projection buckets in one transaction at `server/routes/vehicles.ts:144-255, 343-413, 511-584`.
- Server checkout ignores client cost and calculates from persisted vehicle and garage data at `server/routes/vehicles.ts:340-341`.
- Subscriber add validates date and plate and checks deterministic plus legacy matches transactionally at `server/routes/subscribers.ts:19-49`; normal date inclusion is inclusive on client and server.
- Recharge creation verifies garage/delegate scope and forces pending status at `server/app.ts:765-815, 838-843`; approval and rejection are admin-only and transactionally reject already-processed requests at `server/routes/recharges.ts:193-227, 460-480`.
- Self-subscribe checks and deducts balance in the same transaction as subscription and activity-log writes at `server/routes/recharges.ts:672-745`.
- Referral reward claim atomically consumes reward days, extends expiry, logs the claim, and supports idempotency at `server/routes/recharges.ts:778-835`.
- Client activity-log creation is blocked and restricted to server-generated logs at `server/app.ts:863-866`.
- Package deletion is a soft delete that preserves historical documents at `server/app.ts:641-650`.
- Projection bucket paths are deterministic and bounded by date and shard at `server/deltaProjection.ts:15-57`; daily projection uses half-open day semantics and deterministic rounding at `server/projections.ts:18-48`.
- Financial API authorization is admin-only, validates date ordering and delegate IDs, and uses exclusive end boundaries at `server/routes/reports.ts:20-39` and `server/financialReporting.ts:37-43`.
- Focused tests passed: 26 tests across vehicle scope, monthly-subscriber package rules, idempotency, reporting, and dashboard projections; TypeScript compilation passed. A separate projections/reporting audit recorded 18 focused tests passing for dashboard aggregation, date-key validation, projection determinism, delta primitives, and core financial totals. These tests do not cover the cross-module gaps listed above.

## Product clarifications required

These are decisions, not findings that should be silently implemented:

1. **Session ownership:** Is one Firebase UID allowed to hold multiple role sessions, or must a new login invalidate all other role sessions? Should logout block until release is confirmed, or is local sign-out acceptable with durable server revocation?
2. **Session data migration:** Should missing or invalid `lastActive` be expired immediately, or treated as a legacy indefinitely-live session during a bounded migration?
3. **PIN policy:** Is global PIN uniqueness across every role and admin a hard invariant? Are legacy PIN fields in supervisors, staff, garages, and admin settings intentionally unsupported outside `private_pins`?
4. **Administrative authority:** Is `trialDecision` admin-only, or may supervisors, garage owners, or delegates change it? If non-admin access is intended, what exact relationship and decision subset applies? Should supervisors have global authority over delegates or an assigned organization scope?
5. **Garage suspension:** Should a lock or suspension block only new check-ins, or also checkout, correction, and deletion? Should deleting an inside vehicle ever unlock a garage?
6. **Subscription and wallet semantics:** Is balance an access entitlement or a prepaid wallet? Should admin-approved subscriptions alter balance? Is a `balance_topup` request wallet credit only, subscription purchase, or another operation? What event, commission, and referral policy applies?
7. **Package policy:** Must every direct and self-service purchase reject inactive packages? Should historical admin renewals use inactive packages? Should discounts and coupons apply to delegate requests exactly as shown in the package UI, and are referral/commission fees charged to the customer or accounted separately?
8. **Trials:** What is the authoritative default trial duration when configuration is absent: two days or 15 days? Should durations above 15 days be allowed and displayed? The API currently permits up to 365 days.
9. **Subscriber lifecycle:** May expired garages edit, renew, or delete subscribers? Are weekly and two-week subscriber renewals intentional for a monthly feature? Is an end date equal to start date legal? Is plate identity editable, and is uniqueness per garage or global? Should a 50-record cap be replaced by search/pagination?
10. **Correction and refunds:** Should any authorized garage staff correct a vehicle, or only the original entrant? Should `dailyRefundCount` count zero-amount deletion attempts or only positive refunds? Is refund accounting intentionally on the refund date, and may a refund-only day have negative net revenue?
11. **Financial reporting:** Should reports include direct recharge, wallet credits/debits, and self-service subscriptions, or only delegate-approved subscription revenue? Is “current unsettled” intended to use settlements outside the selected date window? Should delegate filtering include only that delegate’s settlement totals and rows?
12. **Deletion and retention:** Is garage deletion hard deletion, soft deletion, or audit-retaining deletion? Should events and projections remain reportable after deletion? Should delegate deletion be blocked while garages, pending requests, active sessions, or unsettled balances refer to the delegate, or should records be reassigned/deactivated?
13. **Dates and diagnostics:** Are report date inputs UTC instants or Cairo calendar dates? Should reconciliation support historical dates and expose separate state, daily-stat, bucket, and event-ledger statuses? Should current active count mean current occupants or daily net movement?
14. **Retries:** Are direct recharge, top-up, self-subscribe, and destructive mutations expected to survive network retries safely? If so, what operation identity must persist from the initiating UI action across retries and devices?

## Recommended implementation order

### 1. Close authorization and tenant-isolation gaps

Implement C1, M1, M2, H1, H3, H4, and H10 first. Establish one authoritative server session record and enforce it in middleware. Remove client document deletion during logout. Add explicit role and relationship checks to trial decision. Enforce lock/suspension in every vehicle mutation. Replace destructive garage deletion with a resumable, idempotent lifecycle. These changes protect all roles because direct Admin SDK routes bypass Firestore rules.

### 2. Correct financial state transitions and replay protection

Implement C2, H5, H6, H7, M4, M5, M7, and M9. Separate wallet top-up from subscription approval. Centralize package pricing and active-package validation. Require fingerprinted idempotency keys for every monetary mutation. Emit canonical events in the same transaction as every balance, revenue, commission, and refund transition. Reconcile historical records before changing reports.

### 3. Restore PIN and subscriber/vehicle invariants

Implement H2, H8, H9, H11, M10, and M11. Add atomic PIN reservation and fail-closed query errors. Move subscriber authority into the check-in transaction or a maintained unique index. Validate canonical plates server-side. Align ownership identity across UI, API, and rules. Preserve operation keys across retries and reject changed request fingerprints.

### 4. Repair projections, reports, and date semantics

Implement H12, H13, H14, M12, M13, M14, M15, and L7. Separate current state from daily movement. Correct deletion and refund deltas. Use timezone-aware Cairo boundaries. Apply delegate filters to settlements. Add historical reconciliation and active-state checks. Replace capped log reads with server summaries or pagination.

### 5. Resolve lifecycle and presentation inconsistencies

Implement M3, L1, L2, L3, L4, and L5 after the product clarifications. Make login response fields truthful, await or queue PIN migrations, distinguish corrections from positive refunds, centralize trial defaults, remove misleading trial caps, paginate subscribers, and treat malformed client dates as invalid.

### 6. Add regression coverage before release

At minimum, add tests for superseded sessions, stale logout, malformed timestamps, every role attempting trial decision, locked/suspended check-in, top-up approval, inactive/tampered packages, replayed financial operations, delegate request visibility, concurrent subscriber updates, non-canonical plates, inside deletion, prior-day occupants, cross-day refunds, Cairo boundary transitions, pre-window settlements, and historical reconciliation. Re-run the existing focused suites and TypeScript compilation after each implementation group.

## References

All substantive evidence is cited inline as exact repository paths and line ranges from the supplied read-only audits. No external sources were used.

[1]: file:///home/ubuntu/RQ-/server/middleware.ts "RQ- repository authentication middleware"
[2]: file:///home/ubuntu/RQ-/server/routes/auth.ts "RQ- repository authentication routes"
[3]: file:///home/ubuntu/RQ-/server/routes/vehicles.ts "RQ- repository vehicle routes"
[4]: file:///home/ubuntu/RQ-/server/routes/recharges.ts "RQ- repository recharge routes"
[5]: file:///home/ubuntu/RQ-/server/routes/garages.ts "RQ- repository garage routes"
[6]: file:///home/ubuntu/RQ-/server/financialReporting.ts "RQ- repository financial reporting"
[7]: file:///home/ubuntu/RQ-/server/dashboardSummary.ts "RQ- repository dashboard summary"
[8]: file:///home/ubuntu/RQ-/server/projections.ts "RQ- repository projection logic"
[9]: file:///home/ubuntu/RQ-/server/routes/subscribers.ts "RQ- repository subscriber routes"
[10]: file:///home/ubuntu/RQ-/firestore.rules "RQ- repository Firestore rules"
[11]: file:///home/ubuntu/RQ-/src "RQ- repository client modules"
