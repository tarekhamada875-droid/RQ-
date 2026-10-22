# RQ Pre-Production and Pilot Readiness Plan

**Status:** Active readiness plan. This is the repository’s only active implementation and launch-readiness plan. It supersedes the former UI performance plan. The app-wide audit is evidence, not a second plan.

**Starting revision:** `690907b` (`main` matched `origin/main` at audit time). The audit found defects in shared session/state handling and in role workflows. No application-code changes are included in this plan file.

## Purpose

Before inviting real garages to rely on RQ, fix confirmed defects, verify the deployed service and recovery procedures, and gather enough customer and cost evidence to make an informed pilot decision. A passing test suite alone does not mean RQ is ready to earn revenue or support a living.

This plan does **not** promise that software can have no possible failures. It defines the important role scenarios that must be tested and the order that avoids fixing one screen while breaking another.

## One source of truth and scope boundaries

- Follow this plan for implementation work. If a newly discovered task is not listed here, stop and ask the owner before expanding scope.
- `docs/testing/APP-WORKFLOW-AUDIT-2026-10-22.md` records the audit evidence and file locations. It is a reference, not a task queue.
- Existing baseline and completed test reports are historical evidence. Do not treat their old “next step” or “remaining work” wording as authorization to restart a retired task.
- The owner has skipped the broad Reliability and Scale workstream and legacy-data cleanup. Do not run the staging load test, create a replacement load-test program, or delete/backfill customer data under this plan.
- The Garage Dashboard performance baseline did not show a meaningful, repeatable bottleneck. Do not start general performance optimization or repeat broad profiling unless the owner identifies a concrete symptom.
- Use synthetic emulator data only for development and tests. No production customer records, production data cleanup, or production load test is part of this plan.
- Real customer data may be used only in an explicitly approved, limited pilot after the technical, privacy, access, and recovery gates below pass. Do not use real records for development, test fixtures, profiling, or broad load tests.
- One Admin operator may use multiple devices. Do not add a one-device-only lock or reject the owner’s second device.
- Preserve the Worker/API as the authority for identity, role, garage scope, money, eligibility, counters, and reports. Preserve active monthly vehicle subscribers; they are distinct from retired garage-level packages.

## Work order

Each numbered item is a work area, not a requirement to combine all its bullets into one change. Work in order, but make each pull request small enough to explain and review as one behavior or one tightly related cause. Split independent behaviors into separate changes; add focused regression tests and run the relevant checks for each. Do not start the next change while a required check is failing.

### Keep the implementation simple and maintainable

- Before fixing an audit item, reproduce it with a focused test or a clear, repeatable code-path demonstration. Treat findings explicitly labeled as risks as hypotheses until verified; if they cannot be reproduced, document the result and do not add speculative code to the app.
- Trace each reproduced failure to its cause before editing. If several failures come from the same ownership or responsibility boundary, fix that shared cause instead of adding separate symptom-level guards.
- Choose the smallest coherent root-cause fix, not necessarily the fewest changed lines. Local restructuring is appropriate when evidence shows the existing structure causes repeated defects; keep it within the affected boundary and add regression tests for the behavior it clarifies.
- Prefer direct, readable code and existing project patterns. Do not add frameworks, dependencies, generic abstractions, or duplicate state paths unless the demonstrated fix genuinely requires them. If the root cause requires a broader architectural change, stop and present the evidence, options, risks, and expected maintenance benefit to the owner before expanding scope.
- Keep tests focused on the user-visible failure and the relevant neighboring role/session case. Avoid test scaffolding that is harder to understand than the behavior it protects.
- Each change should leave code easier to understand: use clear names, remove obsolete code only when in scope, and explain non-obvious constraints briefly. Do not create a separate roadmap or turn deferred observations into extra work.

### Source-review status: fix confirmed defects; verify risks before changing code

The audit was compared with the implementation and existing tests. The following are supported code defects and should be addressed in the work areas below: role-owned in-memory data is not consistently cleared on logout/owner change; the trailing vehicle throttle callback is not cancelled; garage-detail responses can update state after selection changes; initial session readiness can become true after an unclassified claim failure; a confirmed invalid session refresh is logged but not acted on; malformed saved identity data can leave the app loading; logout-PIN failures are kept in one global browser key; Staff post-claim garage-check failures do not always release the exact claimed session; garage-owner staff data is not hydrated for reports/statistics; the intended owner Packages and staff-stat actions are not reachable from the current drawer; a saved retired `trial_leads` tab can render a blank Admin area; and English translations are missing from inspected Admin views.

Other audit observations are not established defects and must not be treated as automatic implementation tasks: the browser session-write fallback exists, but an authorization bypass was not demonstrated and current rules appear to block those writes; concurrent logout/relogin release ordering needs a race test before changing server session semantics; Admin list staleness/count semantics and Delegate polling overlap need focused reproductions; delegate initial loading/error behavior needs a UI test; subscriber pagination mechanics and delegate-settlement retry idempotency currently have passing tests; package-validation modal wiring needs a product decision; and garage-create idempotency should be added only if a lost-response retry can create duplicate effects. Keep coupons/system-settings changes deferred unless an active product contract is confirmed.

### 1. Keep data and asynchronous work attached to the correct role/session

**Why first:** this affects every role and must be reliable before list refreshes, polling, or screen-specific behavior are changed.

- Clear or quarantine previous-owner vehicles, transactions, staff, Admin/Delegate lists, and cursors before rendering the next protected owner. Use the existing role/entity/session state boundary where practical; do not add a general state-management framework.
- Cancel or ignore callbacks and requests from the previous owner, including the trailing throttled vehicle snapshot and the confirmed slow Admin garage-detail response race.
- Reset Admin and Delegate cursors/list-loaded flags when their authenticated owner changes; do not reuse a prior session’s page state.

**Pass checks:** switch Garage A → Garage B while a listener callback is pending; switch role while list/detail/poll requests are pending; logout then login as another role. The new screen never displays the prior role/entity’s data, and late results cannot repopulate it. Existing listener cleanup and valid pagination still work.

### 2. Make login, session readiness, and logout ordering consistent

**Why second:** protected data should load only after the Worker confirms the role session, and the previous session must not race the next login.

- Use a clear sequence: credentials accepted → Worker session claim succeeds → session coordinator marks the role ready → protected data requests begin.
- Keep protected screens blocked while initial session validation is pending or definitely failed. Provide a retry/error path instead of showing an empty or partially protected dashboard.
- Return and handle session refresh outcomes distinctly: confirmed invalid/revoked, valid, or temporary failure. A confirmed invalid session must not be recorded as a successful heartbeat; a temporary outage during an established session must not unnecessarily evict the user.
- Keep protected readiness false until the initial Worker claim is confirmed; provide a recoverable error/retry state after failure.
- The client-side session-write fallback exists, but a rules bypass has not been shown. Add a focused emulator regression test for the actual fallback behavior before deciding whether to remove or test-gate it; do not claim a security bypass without evidence.
- Test fast logout/re-login ordering before changing server release semantics. If a race is reproduced, make release conditional on the exact session being released while preserving remote-kick behavior.
- Validate saved login state and recover malformed/stale browser storage to the login screen instead of leaving an infinite spinner.
- Scope/reset the failed logout-PIN counter to one challenge/session so one role or user cannot inherit another’s attempt count.

**Pass checks:** fast logout/re-login, two-tab/device behavior, a second Admin device, session expired/revoked, Worker timeout/5xx, malformed local storage, repeated logout attempt failure, and successful recovery are covered. A network error never gets mistaken for proof that a valid session was revoked.

### 3. Close post-login gaps and gate each role’s first data request

- **Staff:** after claiming the Staff session, confirm the linked garage exists and is usable. On a missing garage or failed read, release the exact just-claimed Staff session and return a useful error. Treat the claim-cleanup gap as confirmed; test separately before claiming that a later login will be reported as occupied.
- **Delegate:** do not fetch the dashboard until `isSessionReady` is true. A pre-claim 401 must not log out a session that is still being claimed.
- **Supervisor:** the Worker treats Supervisor as retired. Make the client consistently reject that retired path; do not delete or rewrite any Supervisor data. If the owner later wants Supervisor restored, that is a separate authorization decision, not an assumption in this plan.

**Pass checks:** successful Staff and Delegate login reaches the correct screen only after claim; failed Staff linked-garage setup leaves no claimed session; retired Supervisor does not enter an Admin screen; Admin/Garage/Delegate/Staff login behavior remains unchanged otherwise.

### 4. Repair role actions and visible data freshness

Keep existing authorization boundaries. Refresh or reconcile data only after a successful action; a failed action must not make the row disappear or falsely appear successful.

- **Admin:** make the retired `trial_leads` saved-tab fallback land on Overview (confirmed blank-workspace case). Add focused tests for list reconciliation after successful mutations and for what counts/search promise before changing pagination or adding Worker endpoints; current list/count concerns are not established defects.
- **Garage owner:** first confirm the Packages entry serves only retired garage-level packages; if so, remove only its dead wiring, not package documents or history. If it represents another active capability, stop and ask the owner. Preserve active monthly vehicle subscribers. Restore an intentional, reachable Staff Statistics/Reports action and load current-garage staff for it; refresh on garage change, clear on logout, and never expose staff PINs.
- **Delegate:** test and distinguish initial loading, true empty results, refresh failure, and retry. Add overlap/stale-response guards only where a focused delayed-response test demonstrates stale results. Keep garage cards non-interactive unless a read-only detail flow is explicitly approved; do not invent Admin-like powers.
- **Staff:** preserve existing server-side garage scope and owner/Admin-only staff/PIN controls. Do not broaden permissions to solve a display or loading issue.

**Pass checks:** each successful Admin mutation is reflected without a reload; failed mutations preserve the prior row and show an error; pages/search/counts have truthful boundaries; garage reports show current staff; Delegate loading/error/empty states are distinct; no role sees another role’s controls or records.

### 5. Protect retries, cursors, and details from timing changes

- Keep the confirmed Admin garage-detail late-response fix with the shared async ownership work above. Test Delegate detail/poll races before adding guards; the current visible impact is not established.
- Preserve passing subscriber pagination and delegate-settlement idempotency behavior. Add a targeted page-boundary or ambiguous-create retry test before changing those paths; implement a new client idempotency key only if that test demonstrates duplicate effects are possible.

**Pass checks:** any reproduced create-retry or page-boundary defect has a focused regression test and a minimal fix; otherwise existing create, pagination, and settlement behavior remains unchanged. Confirmed old garage-detail responses cannot overwrite the current selection; only add Delegate race guards if a delayed-response test reproduces the issue.

### 6. Make language and direction consistent across active screens

- Preserve the existing Arabic/English product behavior and Egyptian plate identity. Add English translations and correct direction for the inspected Admin views with missing strings; carry selected language/direction through shared loading/error feedback, logout confirmation, and overlays. Apply the existing bilingual requirement to role screens without changing stored user-authored Arabic text.
- Remove hard-coded RTL from English UI chrome; keep PINs, plates, IDs, and numeric entry explicitly LTR when that is the correct reading direction.
- Do not redesign the visual system or add performance-driven UI changes.

**Pass checks:** key login, dashboard, list, mutation, error, confirmation, and logout flows are usable in Arabic/RTL and English/LTR on mobile and desktop. Language changes do not leak incorrectly between roles or change user data.

### 7. Resolve only the two deferred product/service boundaries if they block the above work

- **System settings:** the current appearance UI uses the Worker. Do not loosen Firestore rules or create a second write path. Only change validation/rules if a real active client requires it and tests prove the intended contract.
- **Coupons:** there is no current Admin UI workflow and the data contract is inconsistent. Coupon work is out of scope unless the owner confirms it is an active preproduction feature and approves its canonical behavior.
- **Package validation modal:** the setter wiring is unused, while the active form has its own validation behavior. Do not reconnect or remove the modal until the owner confirms whether that separate modal is still intended.

Do not turn these deferred questions into speculative cleanup or a new roadmap.

## Engineering and operations go/no-go gate
Do not invite a garage to depend on RQ for live operations until each item has evidence recorded in the normal release/operations records:

1. Run focused tests for every changed slice and cross-role session/authorization regressions.
2. Run the repository checks required by `AGENTS.md` and `docs/RELEASES.md`: `npm test`, `npm run test:rules`, `npm run lint`, `npm run build`, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`.
3. Run emulator-backed browser smoke journeys for Admin, Garage owner, Delegate, and Staff. Include Arabic/RTL and English/LTR where the role has language selection, mobile and desktop viewports, reload/session restore, logout/re-login, network failure, and switching roles while requests/listeners are pending.
4. Confirm each role’s happy path and one meaningful failure/retry path. Verify the Worker remains authoritative and existing cross-role authorization tests still reject out-of-scope requests.
5. Verify the actual production Pages/Worker commit and version, Firebase project/database, deployed rules and indexes, required secrets, allowed origins, and authentication configuration. `main` advancing is not proof that production has the matching release.
6. Complete a real restore rehearsal with synthetic or otherwise safely isolated data. Confirm who can perform it, what records are restored, how long it takes, and how to validate correctness. A written backup intention is not a tested recovery process.
7. Confirm monitoring and alerts are configured in the provider accounts: request/error signals, Firestore reads/writes and storage, Worker usage, abuse/rate limits, and retention. Understand what alerts do and do not prevent; do not assume a budget alert is a spending cap.
8. Document a simple operator runbook for onboarding a garage, handling a failed check-in/out or uncertain credit grant, reconciling a manually confirmed payment, support contact, incident escalation, rollback, and safe service interruption. Preserve the existing rule that an Admin confirms payment and grants credits.
9. Resolve applicable privacy, customer-data, terms, and tax/payment obligations for the places where RQ will operate. The owner must obtain qualified local advice for legal/tax questions; this plan is not a legal determination.

## Business evidence and limited pilot gate
The project documents a 100-credit trial, prepaid paid credits, and Admin-confirmed credit grants. It does not establish customer demand, final prices, conversion, operating costs, or a sustainable income level. Do not present any of those as proven until measured.

Before the first live pilot, the owner should choose a small, explicit pilot size and duration, identify the type of garage and problem being tested, and agree with each participant on what the pilot includes, how support works, how data is handled, and how the pilot can end. Begin with a few willing garages, not a broad public launch. Do not charge or promise a service level that has not been agreed and tested.

During the pilot, record simple evidence: whether each garage completes onboarding; whether the core entry/exit and subscriber workflows are used in real work; failed or corrected operations; support requests and time spent; repeat usage; and whether the operator can reconcile payment and credit-ledger effects. Ask customers directly whether they would continue at a clearly stated price and why. Compliments or sign-ups without continued use or payment are not proof of willingness to pay.

Build a conservative monthly unit-economics estimate before expanding: revenue per paying garage minus actual Firebase/Cloudflare usage, payment costs, the documented 100 EGP delegate commission where applicable, support and onboarding time, and other known operating expenses. Compare break-even garage count with the owner’s chosen monthly income target. The owner still needs to set that target; the repository cannot infer what “decent living” means. Measure actual pilot usage and verify the current Firebase billing plan, quotas, and over-limit behavior in the project console. Do not enable a paid plan or incur a new charge without the owner’s explicit decision.

## Launch decision
Choose **GO for a limited pilot** only when the engineering/operations gate passes, participants understand the pilot and data handling, there is a workable support and recovery procedure, and costs are monitored. Keep access and scope small, review results at the agreed end date, and stop or pause if data integrity, security, reliability, customer value, or cost control is uncertain.

Choose **GO for a broader paid launch** only after pilot evidence shows repeated use of the core workflow, at least some customers actually accept and pay the stated price, the measured economics have a credible path to the owner’s income target, and support/recovery/cost controls remain workable at the expected scale. Otherwise, do not call the business production-ready: fix the blocking issue or run another narrowly defined validation test.

No checklist can guarantee a profitable business. The owner makes the final go/no-go decision based on recorded evidence; technical readiness and business viability are separate requirements.

**Stop condition:** no unresolved confirmed high-priority session/data-isolation defect; source-confirmed role-specific defects in the active product are fixed or explicitly removed because the feature is retired; relevant tests pass; risk-only findings have been tested and either reproduced or documented without speculative code changes; no unapproved scope expansion. If a new issue appears outside this plan, stop and ask the owner rather than opening another workstream.

## Evidence and known limits

- The app-wide source/test review is in `docs/testing/APP-WORKFLOW-AUDIT-2026-10-22.md`.
- The authenticated Garage Dashboard UI baseline is in `docs/testing/UI-OPT-01-GARAGE-BASELINE-2026-10-21.md`. It did not justify general optimization.
- Focused source/test review confirmed the defects listed above and found passing tests for subscriber pagination mechanics and delegate settlement idempotency. The audit’s remaining observations are risks or policy questions unless reproduced. A complete browser end-to-end run across every role and failure scenario has not yet been performed; passing focused tests is not evidence that all production scenarios have been exercised.
