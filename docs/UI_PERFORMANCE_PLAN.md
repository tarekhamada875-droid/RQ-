# RQ Pre-Production and Pilot Readiness Plan

**Status:** Active readiness plan. This is the repository’s only active implementation and launch-readiness plan. It supersedes the former UI performance plan. The app-wide audit is evidence, not a second plan.

The audit found defects in shared session/state handling and role workflows. This document is a plan, not proof that any defect remains unfixed; every agent must verify current `main` and reproduce the selected behavior before changing code.

## Audit progress and update log

**Last reviewed:** 2026-10-25. **Audit status:** In progress; not production-ready by assertion. The full file-by-file and role-workflow audit is not complete.

- Shared garage/role data ownership protections are present in `src/hooks/useGarageSync.ts`: owner changes clear vehicles, transactions, staff, Admin/Delegate lists and cursors; old list requests are invalidated; queued vehicle/transaction callbacks are ignored; the trailing vehicle throttle is cancelled; and stale Admin garage-detail responses are discarded.
- Focused regression coverage exists in `src/hooks/useGarageSync.owner-isolation.test.tsx` and `src/hooks/useGarageSync.test.tsx` for garage switches, logout/session-readiness loss, late snapshots, throttle cancellation, delayed garage-detail responses, and Admin/Delegate list resets.
- Session protections are present in `src/hooks/useGarageSession.ts` and `src/services/authSessionService.ts`: the protected view stays locked while release is pending, a different Firebase identity is not signed out, claims wait for an in-flight release, and failed releases are retried before a claim proceeds. Focused coverage exists in `src/hooks/useGarageSession.test.tsx` and `src/services/authSessionService.test.ts`.
- Additional session safeguards cover initial claim failure, authoritative invalid-versus-transient refresh results, malformed saved identity data, and per-role/account/session logout-PIN attempt scopes. Relevant tests exist in `src/hooks/useGarageSession.test.tsx` and `src/__tests__/logoutAdminPinVerification.test.tsx`.
- Staff login validates the linked garage after claiming and releases the exact attempted Staff session if the garage is missing, rejected/pending, or unreadable; regression tests cover missing-garage and read-failure cleanup. Delegate dashboard loading waits for session readiness and its tests cover stale/polling/pagination responses. Supervisor is treated as retired rather than routed into Admin.
- The Admin retired-tab fallback, successful garage approval/rejection list refresh, successful garage creation and management refreshes, and garage-detail mutation refresh hooks are present with focused tests. Garage Staff Statistics/Reports navigation is reachable, and staff roster loading is scoped to the active garage with stale-response guards.
- **Financial-reporting policy question (confirmed code behavior, intended semantics unresolved):** `server/financialReporting.ts` adds `prepaidCreditPaymentsEgp` separately but computes `cashCollectedTotal` as only `grossRechargeTotal + walletTopupTotal`; `server/financialReporting.test.ts` and `src/__tests__/cloudflareWorkerFinancialRoutes.test.ts` explicitly expect a report with a 50 EGP prepaid-credit payment and no legacy recharge/wallet events to show `cashCollectedTotal: 0`. The current model includes Admin-confirmed prepaid paid-credit grants, so this could understate total cash receipts if `cashCollectedTotal` is intended literally as all collected cash. Do not change this metric until its contract is confirmed; keep prepaid receipts separate from recognized revenue if the accounting model requires it.
- Credit-grant flow writes the balance, ledger entry, paid-grant event, first-grant commission, referral award/marker, activity log, and idempotency record inside one Firestore transaction. Idempotency records are scoped by endpoint and actor and compare request fingerprints; vehicle delete/refund has integration coverage for aliases, payload mismatch, replay, and one-time credit restore. Remaining review: other grant/debit/renewal routes and cross-projection reconciliation.
- Financial report ranges are inclusive-start/exclusive-end; the route builds date boundaries at UTC midnight. Whether report-day defaults must use Cairo-local calendar dates remains unresolved and is not yet classified as a defect.
- Firestore rules permit garage-session updates to `topup_requests` when only `status` changes. Allowed transitions and server authorization must be verified before classifying this as a security defect.
- Passing automated checks do not establish live deployment identity, backup recovery, or production readiness. Live deployment and recovery verification have not been claimed.

### Audit change log

| Date | Task | Result / evidence | Next action |
|---|---|---|---|
| 2026-10-25 | Revalidate shared ownership, session, and role-workflow protections | Current source and focused tests cover owner-state clearing, late async work, release/claim ordering, Staff post-claim cleanup, Delegate readiness/polling, Admin saved-tab recovery, list refreshes, and Staff reports. | Continue the financial integrity audit; preserve unresolved accounting semantics as explicit owner questions rather than silently changing the model. |
| 2026-10-25 | Inspect prepaid-credit grant transaction and financial-report aggregation | Grant balance/ledger/event/commission/referral/idempotency writes share a transaction. Found an unresolved report-contract mismatch: prepaid receipts are separate from `cashCollectedTotal`, and tests lock that behavior in. No production code changed. | Continue route-to-report and subscriber-renewal audit; include the cash-total semantics question in the final decision list. |
| After each task | Keep this plan current | Record durable source/test findings and unresolved questions; keep branch, PR, CI-run, and deployment state in live GitHub checks rather than this document. | Do not mark work complete while required checks are pending or failing. |

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

**First starting slice:** begin with Work Order 1 and investigate one reproducible case where a garage/role/session owner changes while previous data or asynchronous work is still present. Demonstrate the stale-data or late-update behavior with a focused test before editing. Fix only that behavior and its demonstrated shared cause in the first PR. If current `main` already prevents the exact behavior, keep it fixed, record the test/source evidence, and move to the next confirmed Work Order 1 behavior. Do not treat this paragraph as permission to batch every session, role, or race finding together.

### Keep the implementation simple and maintainable

- Before fixing an audit item, reproduce it with a focused test or a clear, repeatable code-path demonstration. Treat findings explicitly labeled as risks as hypotheses until verified; if they cannot be reproduced, document the result and do not add speculative code to the app.
- Trace each reproduced failure to its cause before editing. If several failures come from the same ownership or responsibility boundary, fix that shared cause instead of adding separate symptom-level guards.
- Choose the smallest coherent root-cause fix, not necessarily the fewest changed lines. Local restructuring is appropriate when evidence shows the existing structure causes repeated defects; keep it within the affected boundary and add regression tests for the behavior it clarifies.
- Prefer direct, readable code and existing project patterns. Do not add frameworks, dependencies, generic abstractions, or duplicate state paths unless the demonstrated fix genuinely requires them. If the root cause requires a broader architectural change, stop and present the evidence, options, risks, and expected maintenance benefit to the owner before expanding scope.
- Keep tests focused on the user-visible failure and the relevant neighboring role/session case. Avoid test scaffolding that is harder to understand than the behavior it protects.
- Each change should leave code easier to understand: use clear names, remove obsolete code only when in scope, and explain non-obvious constraints briefly. Do not create a separate roadmap or turn deferred observations into extra work.

### Automated quality gate and owner updates

The owner is not required to test or approve each change. The agent runs focused tests and repository-required checks, opens a focused PR, and relies on the existing required `verify`/Production Gate and protected auto-merge process. Never remove or bypass automated checks to avoid waiting. After checks and merge reach a final state, give the owner a short plain-language summary. A preview link and click-by-click test steps may be offered as optional, but must not block merging or the next bounded task. Follow the feedback and `tokens ending` handoff rules in `AGENTS.md`.

Do not send a completion response while checks or merge are pending. Refresh the actual PR and check state until it reaches a final outcome, then report verified facts only. If a check fails, the agent—not the owner—investigates and fixes it. If the platform remains genuinely blocked, report the exact blocker and avoid claiming the task is complete or merged.

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

### 6. Make Arabic the only application language

- Arabic is the sole supported user-facing application language across Admin, Garage, Delegate, Staff, login, shared loading/error feedback, confirmations, overlays, and navigation. Remove language switching and English-only UI branches rather than preserving a bilingual mode.
- Set the document language to Arabic and the default document direction to RTL. Keep PINs, Egyptian plates, IDs, URLs, and numeric entry readable in their appropriate direction; do not alter stored user-authored data or backend identifiers.
- Replace remaining user-visible English copy with clear Arabic in bounded, role-focused changes and add regression tests for each changed flow. Do not translate code identifiers, API contracts, logs, dependency names, or third-party brand names merely because they contain English.
- Preserve the existing visual design and role permissions; do not redesign screens as part of language removal.

**Pass checks:** active login, dashboard, list, mutation, error, confirmation, and logout flows are Arabic/RTL across all roles on mobile and desktop; no language switch can re-enable English; plate, PIN, ID, and numeric entry remain usable. No backend behavior or stored user data changes.

### 7. Resolve only the two deferred product/service boundaries if they block the above work

- **System settings:** the current appearance UI uses the Worker. Do not loosen Firestore rules or create a second write path. Only change validation/rules if a real active client requires it and tests prove the intended contract.
- **Coupons:** there is no current Admin UI workflow and the data contract is inconsistent. Coupon work is out of scope unless the owner confirms it is an active preproduction feature and approves its canonical behavior.
- **Package validation modal:** the setter wiring is unused, while the active form has its own validation behavior. Do not reconnect or remove the modal until the owner confirms whether that separate modal is still intended.

Do not turn these deferred questions into speculative cleanup or a new roadmap.

## Stage 1: minimum safe limited pilot
Do only this stage before asking a few garages to try RQ in real work. The owner chooses which roles and language(s) the pilot will actually use; do not delay the pilot to polish unused screens.

1. Fix confirmed defects that could show one garage’s data to another, make an active session unreliable, corrupt or misstate vehicle/credit records, or prevent safe recovery. Test the shared session boundaries across roles even if the pilot uses only one role.
2. Test the pilot’s actual happy path and one meaningful failure/retry path in an emulator/browser fixture. Use `npm run ci:check` for the full local automated gate when needed; the required GitHub Production Gate remains the final PR gate and runs the automated tests, rules, lint, and build checks for application changes. Do not create another broad test program just for the plan.
3. Before live use, verify the deployed Pages/Worker version, Firebase project/database, rules and indexes, authentication, allowed origins, and secrets. Check current Firebase billing plan, quotas, and over-limit behavior; configure available usage alerts and Cloudflare abuse limits. Do not assume alerts are spending caps or enable paid billing without the owner’s explicit decision.
4. Complete one restore rehearsal using isolated synthetic data. Write down who can perform it and how to tell it worked.
5. Prepare a one-page operator procedure for onboarding/offboarding, support contact, failed vehicle check-in/out, uncertain credit grants, manual payment confirmation, incident response, and rollback. Resolve applicable privacy, customer-data, consent, terms, and tax/payment requirements with qualified local advice before collecting real customer data. This plan is not a legal determination.

Do not require all roles, all languages, every device size, broad load testing, a codebase rewrite, or unrelated role polish for the limited pilot. If a pilot garage needs one of those flows, it becomes part of that pilot’s tested scope.

## Business evidence and limited pilot gate
The project documents a 100-credit trial, prepaid paid credits, and Admin-confirmed credit grants. It does not establish customer demand, final prices, conversion, operating costs, or a sustainable income level. Do not present any of those as proven until measured.

Before the first live pilot, the owner should choose a small, explicit pilot size and duration, identify the type of garage and problem being tested, and agree with each participant on what the pilot includes, how support works, how data is handled, and how the pilot can end. Begin with a few willing garages, not a broad public launch. Do not charge or promise a service level that has not been agreed and tested. A free trial is fine for learning usage, but it does not by itself validate willingness to pay.

During the pilot, record simple evidence: whether each garage completes onboarding; whether the core entry/exit and subscriber workflows are used in real work; failed or corrected operations; support requests and time spent; repeat usage; and whether the operator can reconcile payment and credit-ledger effects. Ask customers directly whether they would continue at a clearly stated price and why. Compliments or sign-ups without continued use or payment are not proof of willingness to pay.

Build a conservative monthly unit-economics estimate before expanding: revenue per paying garage minus actual Firebase/Cloudflare usage, payment costs, the documented 100 EGP delegate commission where applicable, support and onboarding time, and other known operating expenses. Compare break-even garage count with the owner’s chosen monthly income target. The owner still needs to set that target; the repository cannot infer what “decent living” means. Measure actual pilot usage and verify the current Firebase billing plan, quotas, and over-limit behavior in the project console. Do not enable a paid plan or incur a new charge without the owner’s explicit decision.

## Stage 2: wider paid launch
Do these checks only after the limited pilot shows customers use the core workflow and want to continue. Before a broad launch, test all active roles and promised languages on supported mobile/desktop layouts, complete the full role/failure/retry browser matrix, fix all confirmed defects in the active product, and verify accessibility and customer-facing instructions. Use pilot measurements to set honest usage limits and forecast provider costs. Broad load testing remains out of scope unless the owner separately authorizes an isolated test.

Choose **GO for a broader paid launch** only when pilot evidence shows repeated use of the core workflow, at least some customers actually accept and pay the stated price, measured costs and support effort have a credible path to the owner’s chosen income target, and recovery/security/cost controls remain workable at expected usage. Otherwise, fix the specific blocker or run another small validation test; do not start unrelated cleanup.

No checklist can guarantee a profitable business. The owner makes the final go/no-go decision based on recorded evidence; technical readiness and business viability are separate requirements. Each stage should end with a simple written decision: **go**, **pause to fix a named issue**, or **stop because evidence does not support continuing**.

**Stop condition:** before the limited pilot, no unresolved high-priority shared session/data-isolation defect or confirmed defect in the pilot’s chosen workflows; the relevant tests pass; risks affecting those workflows are reproduced or documented without speculative changes. Before a broader launch, all confirmed defects in active promised workflows are fixed or the retired feature is removed. No stage permits unapproved scope expansion; if a new issue appears outside the plan, stop and ask the owner.

## Evidence and known limits

- The app-wide source/test review is in `docs/testing/APP-WORKFLOW-AUDIT-2026-10-22.md`.
- The authenticated Garage Dashboard UI baseline is in `docs/testing/UI-OPT-01-GARAGE-BASELINE-2026-10-21.md`. It did not justify general optimization.
- Focused source/test review confirmed the defects listed above and found passing tests for subscriber pagination mechanics and delegate settlement idempotency. The audit’s remaining observations are risks or policy questions unless reproduced. A complete browser end-to-end run across every role and failure scenario has not yet been performed; passing focused tests is not evidence that all production scenarios have been exercised.
