# Garage Logic Fix

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

1. GLF-01, GLF-02, GLF-03, and GLF-04: eliminate direct financial and eligibility contradictions.
2. GLF-05, GLF-06, and GLF-07: eliminate stale-state and bypass paths.
3. GLF-08, GLF-09, and GLF-10: make counters, refunds, projections, and ledger history agree.
4. Apply the secondary fixes in separate focused changes where possible.
5. For every item, delete the bad runtime logic rather than archive it, preserve valid stored data, add a regression fixture before editing, and run the complete release workflow.

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

The audit is complete and no source code or stored data has been changed as part of this plan. The plan was merged through the normal reviewed PR and Production Gate workflow; verify the exact current `main`, live health/version, open-PR state, and protected decision branch before beginning implementation. The next bounded task is GLF-01: reject unknown vehicle types at the Worker boundary.
