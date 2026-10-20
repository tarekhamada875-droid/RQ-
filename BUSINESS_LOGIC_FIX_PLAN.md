# Business Logic Fix

_Last updated: 2026-10-20._

## Owner intent

Repair the garage dashboard’s business logic, not its appearance. The goal is to make the dashboard behave like one reliable garage ledger: one authoritative decision for eligibility, one authoritative answer for counters, and no stale or contradictory fallback logic.

The plan covers confirmed business-logic defects found in the 2026-10-20 read-only audit. It does not authorize a visual redesign, production-data deletion, payment changes, or broad unrelated refactoring.

## Non-negotiable rule: delete bad logic, do not preserve it

When a confirmed defect is fixed:

- Delete the incorrect branch, fallback, duplicate counter update, or client-side authority.
- Replace it with the authoritative implementation.
- Do not keep the wrong behavior under names such as `legacy`, `compatibility`, `fallback`, `retired`, `deprecated`, or `old`.
- Do not leave dead wrappers that preserve the same incorrect behavior.
- Do not maintain two competing sources of truth “for safety.” Choose one source and remove the other runtime path.
- Do not delete stored Firestore records as part of source cleanup. Stored-data deletion requires a separate explicit approval, selection predicate, backup/rollback plan, and verification evidence.

Compatibility is allowed only for reading genuinely valid historical records when removing the compatibility path would make existing valid data unreadable. It must not preserve a known-wrong business rule or permit a direct write that bypasses the authoritative path.

## Protected behavior

Preserve the current visual design, bilingual/RTL behavior, mobile/desktop layout, authorized garage scope, server-side financial authority, transactional mutations, audit events, and existing valid historical records. A logic fix may change an incorrect result, but it must not silently change an intended product rule.

## Confirmed findings to fix

### GLF-01 — Reject unknown vehicle types

**Problem:** The Worker accepts arbitrary truthy vehicle types. Unknown types later calculate as zero cost, creating a free checkout.

**Delete:** The implicit “unknown type means zero” path.

**Replace with:** Server validation accepting only `hourly` and `overnight`; the cost function must reject unknown values instead of returning zero.

**Proof:** Check-in route test with a malformed type must fail before the vehicle is created or credit is deducted.

### GLF-02 — Make daily entry count authoritative

**Problem:** Check-in currently writes `garage.todayCount = 1` on every entry while `daily_stats.count` increments separately.

**Delete:** The hard-coded `used: 0`/`isNewDay: false` path and the duplicate legacy-counter calculation that ignores the current daily-stat document.

**Replace with:** One Cairo-day transaction that calculates the next count from the authoritative daily-stat record, or one consistently named current read model if the legacy field is removed from runtime use.

**Proof:** Two and three entries on the same Cairo day, first entry after rollover, and reconciliation parity.

### GLF-03 — Use Cairo date keys for subscriber lifecycle

**Problem:** Date-only subscriber values are treated as UTC timestamps by some Worker paths and as local calendar dates by the UI, causing early expiry and inconsistent counts.

**Delete:** Direct `Date.now()`/UTC-midnight comparisons against date-only subscriber strings.

**Replace with:** A single Cairo business-date comparison used by add, update, renew, delete, check-subscriber, summaries, and maintained deltas.

**Proof:** Tests for Cairo midnight, the exact end date, the following day, and browser timezone independence.

### GLF-04 — Remove client authority from subscriber eligibility

**Problem:** The browser decides active status using only `endDate`, ignores `startDate`, and can block check-in differently from the Worker.

**Delete:** The client-side hard block that independently classifies a plate as subscribed.

**Replace with:** A server-authoritative preflight or check-in response using both `startDate` and `endDate` in the Cairo domain. The client displays the decision but does not override it.

**Proof:** Future-dated, current-day, expired, and non-Cairo-browser cases.

### GLF-05 — Clear stale garage state on session/garage changes

**Problem:** Old vehicles and transactions remain in memory after a garage/session change or listener error and can influence duplicate/recent-exit decisions.

**Delete:** The behavior that preserves old garage records as active business input after scope or listener failure.

**Replace with:** Synchronous clearing on scope change, callback scope checks by garage ID, and an explicit stale/blocked state until a fresh snapshot arrives.

**Proof:** Switch garages while data is loaded; revoke session; force listener error; verify old vehicles cannot block a new check-in.

### GLF-06 — Do not mark failed sessions ready

**Problem:** A generic session-claim failure sets `isSessionReady(true)` after showing an error.

**Delete:** The catch-path readiness transition.

**Replace with:** Not-ready state, bounded retry, cleared scoped data, and read-only/error behavior until claim or refresh succeeds.

**Proof:** Failed claim, retry success, failed claim followed by attempted mutation, and listener suppression while not ready.

### GLF-07 — Make subscriber writes server-only

**Problem:** Firestore rules still allow direct subscriber create/update/delete, bypassing Worker accounting, maintained summaries, and events.

**Delete:** Direct client write permissions and any client path that bypasses the Worker.

**Replace with:** One Worker-authoritative transactional write path, preserving garage scope and audit events.

**Proof:** Firestore rule denial for direct writes; successful route writes still update subscriber state, summaries, and events.

### GLF-08 — Maintain exits and current-count semantics consistently

**Problem:** Checkout does not update `daily_stats.exitsCount`, and `activeVehicleCount` can mean current cars inside or a daily aggregate depending on the source.

**Delete:** Ambiguous field reuse and the path that serves aggregate deltas under a current-count name.

**Replace with:** Explicitly named current inside count and daily aggregate fields; transactionally update exits and serve the same semantics after live reads, rebuilds, and fallback.

**Proof:** Check-in/out sequence, rebuild/fallback parity, and reconciliation tests.

### GLF-09 — Make refunds follow one day/accounting policy

**Problem:** Refund-on-refund-date behavior differs between current garage counters, daily stats, and projections, especially on a new Cairo day.

**Delete:** The route path that subtracts from stale `todayRevenue` without initializing the current day or updating its day marker.

**Replace with:** One documented policy—negative revenue or a separate refund total—implemented consistently in current counters, daily stats, events, and rebuilds.

**Proof:** Prior-day checkout refunded today; same-day refund; refund with no daily-stat document; reconciliation parity.

### GLF-10 — Prevent ledger audit collisions

**Problem:** Ledger IDs use only garage ID plus idempotency key, so a key reused across endpoints can overwrite a debit with a restore.

**Delete:** Endpoint-agnostic ledger ID generation.

**Replace with:** IDs containing operation scope/kind or a globally unique operation ID, while keeping endpoint idempotency behavior intact.

**Proof:** Same key used for check-in and delete/refund must create two auditable ledger entries.

## Admin and cross-role findings

The Admin audit is now part of this plan. These are not a separate UI project: Admin creates, authorizes, settles, and reports the same garage state that Garage consumes. The implementation must use the same Worker authority, Cairo business dates, credit ledger, projections, and reconciliation rules on both sides.

### ALF-01 — Block direct client credit-balance writes

**Severity:** Critical.

**Problem:** Firestore rules allow an active Admin client to update `creditBalance` directly. That bypasses the Worker grant transaction, ledger entry, referral handling, domain event, activity log, and idempotency.

**Delete:** The direct client-write permission for `creditBalance` and every client path that uses it.

**Replace with:** Worker-only credit mutations through the existing authoritative grant/debit/refund paths.

**Proof:** Firestore emulator denial test for direct `creditBalance` writes and a route test proving a valid Admin grant records balance, ledger, event, activity log, referral behavior, and idempotency together.

**Implementation status (2026-10-20):** Merged in PR [#212](https://github.com/tarekhamada875-droid/RQ-/pull/212), merge commit `44d19571e48d5c196f4f751c54230dc98213f3fa`. The Admin garage-update rule now rejects direct `creditBalance` changes; emulator regressions deny both active Admin and garage-owner clients. The unchanged Worker grant route remains authoritative, with a focused regression covering paid balance, referral award, both ledger records, the grant event, activity logs, and an idempotent retry. The focused rules suite and all 13 credit-grant tests passed locally; post-merge Production Gate run `39371738158` passed and deployed the verified Worker artifact. Fresh `/api/health` and `/api/version` checks reported the Worker operational at the merge commit. Firestore rules are not deployed by the Cloudflare release workflow, and production Firebase rules were not changed; the direct-write block is not live until a separately authorized Firebase-rules deployment is performed and verified.

### ALF-02 — Make Admin credit retries idempotent per user intent

**Severity:** High.

**Problem:** `AdminCreditGrantPanel` creates a new payment reference and idempotency key on every submit. Retrying after a timeout can create a second grant for the same payment.

**Delete:** Per-click key generation for one still-pending grant intent.

**Replace with:** Create one reference/key when the grant intent starts, reuse it for retries, and clear it only after confirmed success or an explicit new intent.

**Proof:** Ambiguous response followed by retry produces one balance change, one ledger entry, and one payment event.

### ALF-03 — Use one financial summary source for Admin and Garage

**Severity:** High.

**Problem:** Admin details display mutable legacy garage fields while Garage reports use derived dashboard summaries and projection/event data. The same garage can show different counts and revenue after refunds, rebuilds, stale writes, or a Cairo-day rollover.

**Delete:** Admin’s independent display calculation from mutable legacy totals.

**Replace with:** The same fresh summary endpoint/source of truth used by Garage, with an explicit stale/error state instead of silently showing a different number.

**Proof:** Admin and Garage render identical values for check-in, checkout, refund, Cairo rollover, and projection rebuild scenarios.

### ALF-04 — Do not silently discard Admin trial creation

**Severity:** High.

**Problem:** Admin/delegate creation screens submit `isTrial` and `trialDays`, but the Worker always persists a non-trial prepaid garage with no trial expiry.

**Delete:** Client-visible trial controls that have no server effect, or the Worker’s unconditional non-trial overwrite—depending on the recorded product decision.

**Replace with:** One server-authoritative policy: either a validated trial-credit lifecycle with expiry, ledger/report behavior, and tests, or remove the trial option and all unreachable trial metrics together. Do not silently accept and discard the flag.

**Proof:** Creation request, persisted garage, dashboard behavior, expiry, and reporting agree. This item requires the trial-policy decision before implementation.

### ALF-05 — Make delegate settlement and history complete

**Severity:** High.

**Problem:** Admin delegate details calculate all-time totals, monthly totals, commissions, and unsettled cycles from only the newest 50 recharge logs. The settlement route uses the delegate document’s total, so the confirmation display can disagree with the amount actually settled.

**Delete:** Client-side settlement calculations from an incomplete, fixed-limit activity list.

**Replace with:** A server-authoritative aggregate/snapshot for the selected period and settlement cycle, with cursor pagination only for display history.

**Proof:** More than 50 logs, post-settlement cycles, monthly filtering, and settlement confirmation all agree.

### ALF-06 — Align prepaid money with Admin report policy

**Severity:** High / product-policy dependent.

**Problem:** Verified prepaid-credit payments are recorded separately but omitted from `cashCollectedTotal` and `companyNetRevenue`; the partner dividend card presents those fields as actual revenue. This may understate partner payout input.

**Delete:** Ambiguous use of legacy-only totals as if they were all-cash totals.

**Replace with:** A recorded accounting policy and explicitly named canonical metrics. If prepaid payments are company cash receipts, include them in the appropriate cash/net/payout metric while keeping credit units separate. If intentionally excluded, rename and clearly label the legacy-only metrics and use the correct metric for partner calculations.

**Proof:** A paid prepaid grant appears exactly once in the chosen cash/net/payout metrics and never as credit units converted into money.

### ALF-07 — Fix Admin partner-report date contract

**Severity:** High.

**Problem:** The Admin partner dividend “actual” mode sends ISO datetimes while the Worker accepts only `YYYY-MM-DD`, so the actual report request is rejected.

**Delete:** The mismatched client/server date-format path.

**Replace with:** One shared date-only range type/helper and an integration test covering the actual report request.

**Proof:** Actual mode reaches the financial report route with valid start/end dates and displays the returned data.

### ALF-08 — Remove duplicate package-management authority

**Severity:** Medium.

**Problem:** Two active Admin package UIs have different duplicate checks, and the Worker does not enforce package uniqueness. Direct package Firestore writes can also bypass catalog validation.

**Delete:** The duplicate package-management surface and direct package client writes.

**Replace with:** One Admin package workflow, Worker-side validation/uniqueness, and server-only package mutations.

**Proof:** The same package cannot be created twice through any Admin surface or direct client request; invalid packages are rejected before appearing in the catalog.

### ALF-09 — Make Admin detail state immutable and authoritative

**Severity:** Medium.

**Problem:** Admin details mutate selected garage/delegate objects in place. Rate/PIN/credit changes can update one reference while lists and other consumers retain stale snapshots; some failures are only logged to the console.

**Delete:** In-place mutation and console-only failure handling for business mutations.

**Replace with:** Immutable state updates or authoritative invalidation/refetch, visible failure state, and a fresh server response after rate, PIN, lock, referral, staff, and credit changes.

**Proof:** Successful and failed mutations update or preserve every Admin/Garage consumer consistently.

### ALF-10 — Separate lock and suspension semantics

**Severity:** Medium.

**Problem:** The Admin lock toggle writes both `isLocked` and `isSuspended`, so unlocking for one reason can erase an independent suspension. The update route accepts lifecycle fields without cross-field validation.

**Delete:** The coupled toggle that silently overwrites independent lifecycle state.

**Replace with:** Separate transitions with explicit reasons, or one documented server invariant enforced by the Worker.

**Proof:** Lock-only, suspension-only, both, and unlock scenarios preserve the intended state and the Garage check-in authorization agrees.

### ALF-11 — Clear Admin data on logout/session changes

**Severity:** Medium.

**Problem:** Admin garage/delegate/staff lists and the loaded marker survive logout and can be shown after re-login without a fresh successful load.

**Delete:** Reuse of prior-session Admin collections as current authoritative data.

**Replace with:** Clear scoped Admin state on logout, UID/role/session changes, and require a fresh successful response before rendering it as current.

**Proof:** Logout/re-login with a different Admin/session cannot display or mutate the previous session’s data.

### ALF-12 — Close the remaining Admin authorization leaks

**Severity:** High.

**Problem:** Firestore rules allow direct subscriber mutations and broad system-config reads that expose fields intentionally removed from the Worker response. Vehicle correction authorization also relies on an ephemeral Firebase UID, so legitimate garage/staff corrections can fail after re-login.

**Delete:** Direct client subscriber writes, unrestricted system-config reads, and UID-only entrant ownership as the correction authority.

**Replace with:** Worker-only subscriber mutations, an allowlisted config projection, and stable entrant entity identity plus garage scope; retain UID only as audit metadata.

**Proof:** Rules denial tests, config-field exposure tests, and logout/re-login correction tests for garage and staff.

### ALF-13 — Complete Admin credit-history pagination

**Severity:** Medium.

**Problem:** The credit-ledger API returns pagination metadata, but the Admin/Garage history service fixes the limit at 50 and drops the cursor. Older grants disappear without a partial-history warning.

**Delete:** The fixed-limit, metadata-dropping history path.

**Replace with:** Cursor-aware loading or an explicit complete aggregate plus paginated display history.

**Proof:** More than 50 grants remain discoverable and the UI never labels an incomplete list as complete.

### ALF-14 — Keep Admin PIN/session contracts honest

**Severity:** Low/conditional.

**Problem:** The PIN availability consumer expects owner name/role fields that the endpoint does not reliably return; a latent direct session helper also conflicts with server-owned session rules.

**Delete:** The unused direct session writer and any UI expectation for fields absent from the API contract.

**Replace with:** Worker-owned session operations and a deliberately defined, sanitized PIN-availability response.

**Proof:** No dead direct session write remains; duplicate-PIN feedback matches the actual response contract.

## Admin policy decisions required before implementation

These choices affect both Admin and Garage and must be recorded before changing behavior:

1. Are free trials an active product feature or should the exposed trial controls and unreachable trial metrics be removed together?
2. Should prepaid payments count toward company cash collected, net revenue, and partner dividends?
3. Must one EGP always equal one credit, or can packages use an approved conversion/discount policy?
4. Should Admin package templates be selectable during a manual grant, or is amount-only grant intentional?
5. Are multi-device sessions allowed for one Admin/garage account?
6. Should delegate-created and delegate-referred garages be one combined list everywhere?

## Secondary fixes

After GLF-01 through GLF-10 are stable:

- Use one idempotency key for one UI intent across retries; do not generate a new key for every retry.
- Replace whole-state optimistic rollback with mutation/version-aware reconciliation so one failed operation cannot erase another successful operation.
- Derive expiring-subscriber counts server-side or from all relevant records, not the first 50 display records.
- Preserve actionable renewal errors such as insufficient paid credits.
- Disable subscriber deletion while a delete is in flight.
- Make Cairo activity ranges DST-aware and remove fixed-offset day boundaries.
- Apply timestamp bounds/order before limiting vehicle history results.
- Replace “30 days”/`setMonth(+1)` ambiguity with one explicit duration rule and end-of-month tests.

## Decisions required before related implementation

These business choices must be recorded before changing their behavior:

1. Whether staff may manage subscribers.
2. Whether garage owners may override entrant-only vehicle deletion.
3. How legacy vehicles without entrant metadata are handled.
4. Whether over-refunds reject or clamp, and whether a daily refund limit exists.
5. Whether “one month” means 30 elapsed days or same-day-next-month.
6. Which activation/recharge events trigger garage notifications.

Until decided, do not silently change these policies. The confirmed defects above may be fixed without waiting for those unrelated choices.

## Implementation order

1. ALF-01, ALF-12, GLF-07, and GLF-10: close direct financial/authorization bypasses and protect the ledger.
2. GLF-01, GLF-02, GLF-03, GLF-04, ALF-03, and ALF-06: align Worker, Admin, and Garage financial/eligibility truth.
3. GLF-05, GLF-06, ALF-09, ALF-11, and ALF-14: eliminate stale state, failed-session readiness, and cross-role contract drift.
4. GLF-08, GLF-09, ALF-05, ALF-07, and ALF-13: make counters, refunds, settlements, reports, and history complete.
5. Resolve the policy-dependent trial, package, and accounting decisions, then implement ALF-04 and ALF-08.
6. Apply the remaining secondary fixes in separate focused changes where possible.
7. For every item, delete the bad runtime logic rather than archive it, preserve valid stored data, add a regression fixture before editing, and run the complete release workflow.

## Required verification for each PR

- Focused regression tests for the selected business rule.
- `npm run lint`.
- `npm run maintainability:check`.
- `npm run ci:check`.
- `git diff --check`.
- Firestore rules tests where permissions change.
- Reconciliation/parity tests where counters or projections change.
- No visual redesign or unrelated UI cleanup.
- Short-lived branch, reviewed PR, Production Gate, merge, post-merge deployment verification, live health/version check, and clean synchronized `main`.

## Current status

The Garage and Admin audits are complete. ALF-01 was merged through PR #212 at `44d19571e48d5c196f4f751c54230dc98213f3fa`; post-merge Production Gate run `39371738158` passed and the live Worker reports that commit. The focused Firestore emulator suite, all 13 Worker credit-grant tests, lint, maintainability, and `ci:check` passed. No stored records, payments, or production Firebase rules were changed. The Cloudflare release flow does not deploy Firestore rules, so ALF-01’s direct-write denial is verified in source/emulator only, not in production. Stop and obtain the owner’s direction about a separate authorized rules deployment before starting ALF-12.
