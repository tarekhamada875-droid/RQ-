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

**Implementation status (2026-10-20, live):** ALF-12 (PR #216) had already blocked direct browser mutations, and the application sends subscriber add/renew/update/delete requests through Worker routes. GLF-07 follow-up PR [#218](https://github.com/tarekhamada875-droid/RQ-/pull/218) fixed a summary error: deleting an expired subscriber previously left it counted as expired. The Worker now treats a deleted record as absent when calculating summary deltas. A new garage-owner route test verifies stored state, summary deltas, and create/update/delete audit events; existing tests cover direct-write denial, renewal/ledger idempotency, and cross-garage rejection. The focused subscriber suite passes 11/11, and lint, Firestore rules emulator, maintainability, full CI, and diff checks passed. PR #218 merged as `df6dd9182580d25574089ab184441dc5aa0d3980`; main Production Gate run `39387778329` passed and deployed/smoke-tested the Worker. Live `/api/health` and `/api/version` both report that commit. No UI, Firestore rules, role policy, or stored data changed. Staff subscriber access remains an unresolved policy item. GLF-10 is next.

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

**Implementation status (2026-10-20):** ALF-01 was merged in PR [#212](https://github.com/tarekhamada875-droid/RQ-/pull/212), commit `44d19571e48d5c196f4f751c54230dc98213f3fa`; its original production rules release was ruleset `74404046-99eb-4c3a-993c-616ddc0c576f` (SHA-256 `fe576244d299fcf86d7173ef25afc7759db51c9a4c8040e4e75d170f276f37f8`). The credit-bundle-only catalog follow-up was merged in PR [#214](https://github.com/tarekhamada875-droid/RQ-/pull/214) as `9d6a787f17fae7b09b3dfbd1b08ffe515bf041ad`; post-merge Production Gate run `39377196821` passed, and the live Worker reports that commit. Its separate Firestore rules deployment is active as ruleset `619f1ca8-3d09-44b0-b361-a17601f645bc`, read back as the exact repository payload (SHA-256 `1eb5698024002f10e19df415ae4c5c0bfb2d57db7bf0755fb68ff59f3d299bb9`). The newer catalog ruleset supersedes the initial ALF-01 ruleset while preserving its direct-credit-balance protection and existing live Admin settings behavior.

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

**Owner decision and implementation (2026-10-20):** The Admin package catalog supports the credit-bundle format only. Time/capacity package formats are not a second catalog option. PR [#214](https://github.com/tarekhamada875-droid/RQ-/pull/214) now enforces this in the Worker validator, Firestore write/read rules, the Admin catalog query, UI, and cache filtering; invalid/mixed records are rejected or hidden. The separate garage-owned monthly-subscriber product remains unchanged. Existing legacy package documents were not deleted or migrated, and no data-deletion or conversion/discount policy was authorized. Existing one-to-one EGP/credit checks remain in place.

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

**Owner decision (2026-10-20):** Garage owners and staff may correct/delete only entries created under the same stable entity ID and role. The same entity retains authority after re-login with a new Firebase UID; peer accounts cannot correct one another’s entries. Legacy records without stable entrant metadata are Admin-only. No vehicle-record migration is authorized.

**Implementation and release status (2026-10-20):** Merged as PR [#216](https://github.com/tarekhamada875-droid/RQ-/pull/216), merge commit `3832f0b2902b8748d53e3bd18b95e5d1de5d10f5`. Post-merge Production Gate run `39383241961` passed, including typecheck, full tests, Firestore rules emulator tests, build, maintainability checks, and the verified Worker deploy/smoke test. Live `/api/health` and `/api/version` report the merge commit. After separate owner approval, the production Firestore rules for project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`, were deployed and read back exactly as ruleset `a835ccf0-df94-4908-b9bc-8f1f95aaf35a`, SHA-256 `b70a5b05c33e7a08e596f90c938baab6026cf5d3e9a7eda4cde6a5cbeca84a74`. The deployment changes access rules only; no stored records were changed or deleted.

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
5. The owner has decided the Admin catalog format (credit bundles only); resolve the remaining trial/accounting decisions, then continue ALF-04 and the remaining ALF-08 uniqueness/authority work.
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

ALF-01 and the credit-bundle-only Admin catalog remain live. ALF-12 is complete: PR [#216](https://github.com/tarekhamada875-droid/RQ-/pull/216) merged as `3832f0b2902b8748d53e3bd18b95e5d1de5d10f5`; its separately approved Firestore rules deployment was verified as ruleset `a835ccf0-df94-4908-b9bc-8f1f95aaf35a`, SHA-256 `b70a5b05c33e7a08e596f90c938baab6026cf5d3e9a7eda4cde6a5cbeca84a74`. GLF-07 is complete in PR [#218](https://github.com/tarekhamada875-droid/RQ-/pull/218), merged as `df6dd9182580d25574089ab184441dc5aa0d3980`. Main Production Gate run `39387778329` passed and deployed/smoke-tested the Worker; live `/api/health` and `/api/version` report that commit. GLF-07 did not change Firestore rules or stored records. At code-release verification, `main` and `origin/main` were synchronized at that commit, the working tree was clean, and the only open PR was stale documentation PR #211; do not merge it without refreshing and reconciling its content. The protected decision branch was `readiness/firestore-decision-gate` at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`. No stored records were changed or deleted. The next item is GLF-10 (prevent ledger audit collisions).
