# RQ Final Pre-Production Workflow Plan

**Status:** Proposed execution plan. This document is the repository’s only active implementation plan. It supersedes the former UI performance plan. The app-wide audit is evidence, not a second plan.

**Starting revision:** `690907b` (`main` matched `origin/main` at audit time). The audit found defects in shared session/state handling and in role workflows. No application-code changes are included in this plan file.

## Purpose

Before the next production release, make the existing Admin, Garage owner, Delegate, and Staff journeys behave consistently: the right person and garage data should be shown; a request from an old screen must not update a new one; actions should complete or show an understandable error; and the app should preserve Arabic/English and RTL/LTR behavior.

This plan does **not** promise that software can have no possible failures. It defines the important role scenarios that must be tested and the order that avoids fixing one screen while breaking another.

## One source of truth and scope boundaries

- Follow this plan for implementation work. If a newly discovered task is not listed here, stop and ask the owner before expanding scope.
- `docs/testing/APP-WORKFLOW-AUDIT-2026-10-22.md` records the audit evidence and file locations. It is a reference, not a task queue.
- Existing baseline and completed test reports are historical evidence. Do not treat their old “next step” or “remaining work” wording as authorization to restart a retired task.
- The owner has skipped the broad Reliability and Scale workstream and legacy-data cleanup. Do not run the staging load test, create a replacement load-test program, or delete/backfill customer data under this plan.
- The Garage Dashboard performance baseline did not show a meaningful, repeatable bottleneck. Do not start general performance optimization or repeat broad profiling unless the owner identifies a concrete symptom.
- Use synthetic emulator data only for development and tests. No production customer records, production data cleanup, or production load test is part of this plan.
- One Admin operator may use multiple devices. Do not add a one-device-only lock or reject the owner’s second device.
- Preserve the Worker/API as the authority for identity, role, garage scope, money, eligibility, counters, and reports. Preserve active monthly vehicle subscribers; they are distinct from retired garage-level packages.

## Work order

Each numbered item is a bounded change or closely related test slice. Work in order; every slice gets focused regression tests and a pull request. Do not start the next slice while a required check is failing.

### 1. Keep data and asynchronous work attached to the correct role/session

**Why first:** this affects every role and must be reliable before list refreshes, polling, or screen-specific behavior are changed.

- Identify transient data by the current role, entity (garage/delegate/staff/admin), and session. Clear or quarantine the previous owner’s vehicles, transactions, staff, lists, and pagination state before showing the next protected screen.
- Cancel or ignore callbacks and requests from the previous owner, including the trailing throttled vehicle snapshot and slow Admin detail reads.
- Reset Admin and Delegate cursors/list-loaded flags when their authenticated owner changes; do not reuse a prior session’s page state.

**Pass checks:** switch Garage A → Garage B while a listener callback is pending; switch role while list/detail/poll requests are pending; logout then login as another role. The new screen never displays the prior role/entity’s data, and late results cannot repopulate it. Existing listener cleanup and valid pagination still work.

### 2. Make login, session readiness, and logout ordering consistent

**Why second:** protected data should load only after the Worker confirms the role session, and the previous session must not race the next login.

- Use a clear sequence: credentials accepted → Worker session claim succeeds → session coordinator marks the role ready → protected data requests begin.
- Keep protected screens blocked while initial session validation is pending or definitely failed. Provide a retry/error path instead of showing an empty or partially protected dashboard.
- Distinguish authoritative invalid/revoked/expired responses from timeouts and temporary network failures. A confirmed invalid session logs out once; a temporary outage during an established session does not unnecessarily evict the user.
- Do not treat a failed Worker claim as permission to perform a competing browser-side session write. Remove that fallback or confine it to explicitly controlled emulator tests.
- Prevent a deliberate logout’s release from overlapping a new claim for the same browser session; make server release conditional on the exact session being released. Preserve remote-kick behavior.
- Validate saved login state and recover malformed/stale browser storage to the login screen instead of leaving an infinite spinner.
- Scope/reset the failed logout-PIN counter to one challenge/session so one role or user cannot inherit another’s attempt count.

**Pass checks:** fast logout/re-login, two-tab/device behavior, a second Admin device, session expired/revoked, Worker timeout/5xx, malformed local storage, repeated logout attempt failure, and successful recovery are covered. A network error never gets mistaken for proof that a valid session was revoked.

### 3. Close post-login gaps and gate each role’s first data request

- **Staff:** after claiming the Staff session, confirm the linked garage exists and is usable. If that check fails, release the exact just-claimed Staff session and return a useful error, so retry does not appear blocked by a leftover session.
- **Delegate:** do not fetch the dashboard until `isSessionReady` is true. A pre-claim 401 must not log out a session that is still being claimed.
- **Supervisor:** the Worker treats Supervisor as retired. Make the client consistently reject that retired path; do not delete or rewrite any Supervisor data. If the owner later wants Supervisor restored, that is a separate authorization decision, not an assumption in this plan.

**Pass checks:** successful Staff and Delegate login reaches the correct screen only after claim; failed Staff linked-garage setup leaves no claimed session; retired Supervisor does not enter an Admin screen; Admin/Garage/Delegate/Staff login behavior remains unchanged otherwise.

### 4. Repair role actions and visible data freshness

Keep existing authorization boundaries. Refresh or reconcile data only after a successful action; a failed action must not make the row disappear or falsely appear successful.

- **Admin:** reconcile paged Garage/Delegate lists after approve, reject/delete, create, and detail edits. Reset only the affected list/cursor and avoid duplicates. Make the `trial_leads` saved-tab fallback land on Overview. Ensure search and pending counts cannot silently imply full coverage when only one page is loaded; prefer a bounded Worker search/count if the UI promises all records, otherwise make the limited scope clear.
- **Garage owner:** the product model says garage-level duration/capacity/weekly/monthly packages are retired. Remove the dead Packages menu/view wiring rather than resurrecting retired package sales. Do not delete package documents or alter historical records. Do not remove the separate active monthly vehicle-subscriber workflow. Load the current garage’s staff for Staff Statistics/Reports, refresh on garage change, clear on logout, and never expose staff PINs.
- **Delegate:** distinguish loading, true empty results, refresh failure, and retry. Keep last-known rows visible during a transient refresh failure. Prevent overlapping/out-of-order polls from overwriting newer data; reconcile page metadata and removals to the actual Worker response contract. Garage cards must match their behavior: keep them as non-interactive cards if there is no approved detail workflow; do not invent Admin-like powers or a new feature without product approval.
- **Staff:** preserve existing server-side garage scope and owner/Admin-only staff/PIN controls. Do not broaden permissions to solve a display or loading issue.

**Pass checks:** each successful Admin mutation is reflected without a reload; failed mutations preserve the prior row and show an error; pages/search/counts have truthful boundaries; garage reports show current staff; Delegate loading/error/empty states are distinct; no role sees another role’s controls or records.

### 5. Protect retries, cursors, and details from timing changes

- Add a stable idempotency key to one garage-create intent and reuse it when the same request is retried after an ambiguous timeout. Confirm the Worker returns the same created record for a replay and does not duplicate ledgers or activity records. Preserve uniqueness checks, authorization, and daily limits.
- Test Garage subscriber pagination when a new/changed record moves the first-page boundary between page loads. Change cursor behavior only if the test reproduces missing/duplicate records; keep merge-by-ID and a single-flight load-more guard.
- Use request cancellation or identity/generation checks for Admin garage/delegate detail reads and Delegate refreshes so an older response cannot replace a newer selection.

**Pass checks:** replayed create intent creates one record and one set of side effects; a deliberate new intent remains independent; changing page data between fetches neither silently skips nor duplicates rows; old details/polls cannot overwrite current selection.

### 6. Make language and direction consistent across active screens

- Preserve the existing Arabic/English product behavior and Egyptian plate identity. Carry the selected language and direction through Admin child views, shared loading/error feedback, logout confirmation, and shared overlays. Apply the existing bilingual requirement to role screens without changing stored user-authored Arabic text.
- Remove hard-coded RTL from English UI chrome; keep PINs, plates, IDs, and numeric entry explicitly LTR when that is the correct reading direction.
- Do not redesign the visual system or add performance-driven UI changes.

**Pass checks:** key login, dashboard, list, mutation, error, confirmation, and logout flows are usable in Arabic/RTL and English/LTR on mobile and desktop. Language changes do not leak incorrectly between roles or change user data.

### 7. Resolve only the two deferred product/service boundaries if they block the above work

- **System settings:** the current appearance UI uses the Worker. Do not loosen Firestore rules or create a second write path. Only change validation/rules if a real active client requires it and tests prove the intended contract.
- **Coupons:** there is no current Admin UI workflow and the data contract is inconsistent. Coupon work is out of scope unless the owner confirms it is an active preproduction feature and approves its canonical behavior.

Do not turn these deferred questions into speculative cleanup or a new roadmap.

## Final preproduction acceptance gate

Before the release candidate is considered ready:

1. Run focused tests for every changed slice and cross-role session/authorization regressions.
2. Run the repository checks required by `AGENTS.md` and `docs/RELEASES.md`: `npm test`, `npm run test:rules`, `npm run lint`, `npm run build`, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`.
3. Run emulator-backed browser smoke journeys for Admin, Garage owner, Delegate, and Staff. Include Arabic/RTL and English/LTR where the role has language selection, mobile and desktop viewports, reload/session restore, logout/re-login, network failure, and switching roles while requests/listeners are pending.
4. Confirm each role’s happy path and one meaningful failure/retry path. Verify the Worker remains authoritative and existing cross-role authorization tests still reject out-of-scope requests.
5. Merge only through the protected `main` branch after required checks pass. The existing Production Gate governs deployment; do not manually deploy or use production customer records for validation. When code/configuration is deployed, verify the deployed commit/version and health endpoints separately from the fact that `main` advanced.

**Stop condition:** no unresolved confirmed high-priority session/data-isolation defect; all listed role-specific functional defects are fixed or explicitly removed from the UI because the feature is retired; relevant tests pass; no unapproved scope expansion. If a new issue appears outside this plan, stop and ask the owner rather than opening another workstream.

## Evidence and known limits

- The app-wide source/test review is in `docs/testing/APP-WORKFLOW-AUDIT-2026-10-22.md`.
- The authenticated Garage Dashboard UI baseline is in `docs/testing/UI-OPT-01-GARAGE-BASELINE-2026-10-21.md`. It did not justify general optimization.
- Focused test batches passed during the audit, but a complete browser end-to-end run across every role and failure scenario has not yet been performed. Passing focused tests is not evidence that all production scenarios have been exercised.
