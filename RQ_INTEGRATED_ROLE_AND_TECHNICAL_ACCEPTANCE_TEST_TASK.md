# RQ Integrated Role-Based Acceptance Test Task

## Mission

Test RQ exactly as a real user while verifying the technical behavior behind every user action at the same time.

This document combines the human workflow and technical QA requirements into one execution order:

```text
Log in as one role
  → use the visible application as that role
  → verify the visible result
  → verify authorization and scope
  → verify the correct API/backend result
  → verify persistence and audit/history
  → verify duplicate, invalid, offline, and logout behavior
  → record PASS, FAIL, BLOCKED, or NOT APPLICABLE
  → continue to the next role
```

Do not test the UI in isolation and then assume the backend is correct. Do not run backend tests and then assume a human can use the feature. Each important workflow must pass both dimensions together.

## Current execution control — 2026-10-09

[`docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`](docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md) is the controlling procedure for H6 target selection, safety boundaries, timeouts/retries, evidence, cleanup, and readiness status. This document remains the coverage catalog and feature-by-role matrix. Its detailed examples are not permission to perform financial or destructive actions; the runbook's restrictions and the owner's current directions take precedence.

**Current H6 restriction:** recharge submission/approval/rejection, wallet top-up, transfer/settlement, balance changes, package/subscription purchase or renewal, self-subscription, and financial reward claims are coverage references only. Do not create the associated financial fixtures or perform those writes without the isolated sandbox and explicit authorization required by the runbook. Otherwise mark the applicable cells OPEN/BLOCKED. Delete only run-specific synthetic fixtures through supported UI after confirming their scope.

**Owner-approved role retirement override:** Supervisor is no longer an active product role. Do not create, authenticate, inspect, delete, or modify any legacy Supervisor account/session record. The old Supervisor-specific procedures and matrix outcomes below are historical coverage only; current active-role disposition is **N/A — role retired**, with technical denial/preservation regressions required. This replaces the former global-versus-assigned scope decision. No live Firestore Rules deployment is authorized.

This remains test-only for other application behavior. A browser-test harness may be added only as a separate, narrowly scoped test-infrastructure change covered by the runbook. The approved Supervisor retirement is the sole application-policy exception here; no UI/UX redesign, business-rule change outside that retirement, Firebase configuration, billing, database identity, production data, or production traffic changes are authorized.

## Required reading

Before starting:

1. `AGENTS.md`
2. `RQ_PROJECT_KNOWLEDGE_BASE.md`
3. `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`
4. `docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`
5. `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`
6. `docs/OBSERVABILITY_RUNBOOK.md` for safe metadata collection only; use its current Cloudflare instructions.

This document is the **coverage catalog and primary feature-by-role matrix**. The controlled runbook is the execution authority. Do not create duplicate acceptance tasks for the same role workflows.

If the owner says the exact phrase `tokens ending`, stop and follow `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`.

---

## Access and test data required

Use isolated synthetic data only.

### Required identities

| Alias | Role | Required scope |
|---|---|---|
| `QA Admin` | platform administrator | platform-wide synthetic data |
| `QA Delegate` | delegate | assigned/referred Garage Alpha only |
| `QA Garage Owner` | garage account | Garage Alpha only |
| `QA Staff` | staff member | permitted Garage Alpha operations |
| Legacy Supervisor records | retired role | preserve existing records; do not create or test an identity |

### Required synthetic records

Prepare:

- Garage Alpha and Garage Beta;
- active, locked, suspended, and pending garage states where safe;
- staff assigned to Alpha;
- delegate assigned to Alpha but not Beta;
- existing legacy Supervisor records, if present, preserved and excluded from fixtures;
- active, expired, and trial subscriber records;
- valid, exited, duplicate, and recently exited vehicle records;
- active, inactive, custom, duration, capacity, unlimited, and fair-use package records where supported;
- financial/recharge/wallet/ledger fixtures only if the controlled runbook's isolated-sandbox and authorization gates are met; otherwise do not prepare them and keep those cells OPEN/BLOCKED;
- synthetic trial-lead record;
- synthetic announcement;
- synthetic session on a second browser/device.

Mark every record with a safe QA identifier such as `QA-20261001-*`. Never use a real customer, real payment reference, real PIN, or unknown record.

---

## Result language and evidence

Every scenario must be marked:

- **PASS** — human result and technical checks both match expectations.
- **FAIL** — a user-facing or technical expectation is wrong.
- **BLOCKED** — required access, deployment, account, data, or safe test boundary is unavailable.
- **OPEN/UNVERIFIED** — the result is ambiguous or evidence is incomplete; do not infer a pass.
- **NOT RUN** — the scenario has not been attempted.
- **NOT APPLICABLE** — the role is intentionally not allowed to perform the action; record the authorization reason and verify denial.

For every scenario, record these fields:

```text
Role:
Human action:
Visible expected result:
Visible actual result:
Technical expectation:
Technical observation:
Scope/authorization result:
Persistence/audit result:
Failure/retry result:
Status:
Evidence:
Severity:
```

Never record secrets, credentials, PINs, auth tokens, private URLs, or real financial information.

---

# Phase 0 — Baseline before role testing

Run the repository gate and record the exact commit:

```bash
git fetch origin --prune
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
npm ci --ignore-scripts --no-audit --no-fund
npm test -- --run
npm run lint
npm run build
npm run maintainability:check
npm run ci:check
git diff --check
npm run release:smoke
```

Record the frontend URL, configured backend origin, browser/device, test date, commit SHA, test-data manifest, and any pre-existing failure. A technical baseline failure does not automatically mean every user flow fails, but it must be recorded before browser testing.

Confirm the topology is:

```text
Cloudflare Pages frontend → Cloudflare Worker API → Firebase Auth/Firestore
```

Do not call a Cloudflare SPA fallback an API success.

`npm run release:smoke` is environment-driven. For H6, set `SMOKE_BASE_URL` to the verified preview Worker, `SMOKE_FRONTEND_URL` to the verified Cloudflare Pages preview, and `SMOKE_EXPECTED_VERSION` to that preview's expected version. Never point this H6 smoke at production. If the exact Pages-to-Worker pairing is unavailable, mark the gate BLOCKED instead of substituting a local Vite proxy.

---

# Phase 1 — Common tests for active roles

Run this sequence as Admin, Delegate, Garage Owner, and Staff. Supervisor is retired: do not perform a manual login or role test; use only local denial-and-preservation regressions as specified in Phase 6.

| Human action | Technical verification at the same point | Expected result |
|---|---|---|
| Open the application | Confirm the frontend serves the tested commit/build | Login screen loads without a crash |
| Submit empty login fields | Confirm validation occurs before a protected request | Clear validation; no secret leakage |
| Submit invalid synthetic credentials | Confirm safe auth error and rate-limit behavior | Access denied safely |
| Submit valid credentials | Confirm session creation, role, entity, and scope are server-derived | Correct dashboard opens |
| Refresh | Confirm session revalidation/heartbeat works | Same valid role remains |
| Open a protected page | Confirm authorization is checked by the backend | Only permitted page/data appears |
| Open a loading screen | Observe network request and loading feedback | No blank/crashed state |
| Trigger a harmless error | Confirm typed error envelope/correlation behavior | Recoverable user message |
| Log out | Confirm API session release/revocation and local cleanup | Login screen returns |
| Press Back and refresh | Confirm old session cannot read protected data | No protected data returns |

If a role cannot complete this phase, mark the remaining role scenarios `BLOCKED` until the login/session problem is understood.

---

# Phase 2 — Admin: human action plus technical verification

Log in as `QA Admin` in a clean browser context.

## 2.1 Admin navigation and dashboard

For every visible admin tab or settings card, perform this sequence:

1. Click the tab/card as a human.
2. Confirm the correct screen, title, data, loading, empty, and error state.
3. Observe the request made by the frontend without exposing secrets.
4. Confirm the backend accepts the role and requested scope.
5. Confirm the response contains only safe display fields.
6. Refresh and confirm persistence or authoritative reload.
7. Confirm an unauthorized scope cannot be selected through UI state, copied URL, or altered local state.

Explicitly cover:

- Overview.
- Garages.
- Requests and reviews.
- Trial leads.
- Subscription/package pricing.
- People: delegates only.
- Fair-use.
- Partner/dividend calculator.
- Settings/catalog.
- Wallet number.
- Admin PIN.
- Announcements.
- Global settings.
- Active sessions.
- Appearance/language.
- Audit/history.

## 2.2 Create and approve a synthetic garage

1. Open the create-garage form.
2. Submit empty and malformed data.
3. Confirm visible validation and no record creation.
4. Enter valid QA Garage data, including a synthetic unique PIN and optional trial settings.
5. Submit.
6. Confirm visible success or pending-review state.
7. Verify the backend request uses the intended protected route.
8. Confirm the garage is created once and the PIN is not exposed in display payloads.
9. Open the requests/reviews view.
10. Approve the synthetic request if the workflow requires approval.
11. Confirm the garage status, package/trial state, event, and audit record update atomically.
12. Repeat the approval action.
13. Confirm the second approval is safely rejected or idempotently replayed.
14. Reject a separate QA request only if safe.
15. Confirm rejection and cleanup behavior match the confirmation warning.

## 2.3 Garage details, maintenance, and deletion

1. Open QA Garage Alpha details.
2. Review dashboard values, staff, subscribers, balances, activity, and reports.
3. Verify each displayed value comes from the correct scope and endpoint/read adapter.
4. Change an allowed synthetic status.
5. Confirm the status after refresh.
6. Start a destructive action.
7. Cancel the confirmation and verify no write occurred.
8. Confirm the action and verify authorization, transaction behavior, audit event, and scope.
9. Attempt the same action on Garage Beta only when the test is designed to verify permitted admin scope.
10. Confirm no unrelated record changed.

## 2.4 Requests, recharge approval, and rejection

1. Open a pending synthetic recharge request.
2. Review garage, delegate, package, amount, currency, and status.
3. Cancel the approval confirmation.
4. Confirm no balance, package, commission, or ledger change.
5. Approve it.
6. Confirm the visible result.
7. Verify the server transaction updates the request, target garage, ledger/activity, commission, event, and idempotency record consistently.
8. Replay the same approval.
9. Confirm no duplicate balance, package extension, commission, or event.
10. Attempt changed-payload reuse of the same idempotency key in an approved test harness.
11. Confirm conflict behavior.
12. Reject another synthetic request and verify the same state/audit consistency.

## 2.5 Trial leads and trial decisions

1. Open trial leads.
2. Select a synthetic expired trial.
3. Review its decision status.
4. Choose continue, decline, dismiss, or resolve as supported.
5. Verify the backend authorizes the admin and writes only the selected garage.
6. Refresh and verify the result.
7. Open the garage-owner view and confirm the trial-expiry modal reflects the stored decision.
8. Confirm a non-trial or already-decided garage does not show the modal incorrectly.

## 2.6 People, delegate details, settlement, and PIN

1. Create or open a synthetic delegate.
2. Review its profile, scoped garages, requests, recharge history, commissions, and period filters.
3. Change an approved synthetic delegate field.
4. Verify the backend scope and audit event.
5. Change a synthetic delegate PIN through the supported flow.
6. Confirm duplicate PIN validation and secret redaction.
7. Open settlement.
8. Cancel once and verify no timestamp or total changes.
9. Confirm settlement and verify historical records remain.
10. Revoke only a synthetic delegate if explicitly approved.
11. Confirm that revoked delegate cannot log in or submit a recharge.
12. Do not create or manage a Supervisor identity; the retired-role N/A disposition and local denial regressions are covered in Phase 6.

## 2.7 Settings, fair use, wallet, PIN, announcements, and sessions

For each of these settings screens, perform a valid synthetic change and an invalid/cancelled change where safe:

- package/catalog settings;
- configurable subscriber fee fallback;
- commission settings;
- fair-use extension;
- wallet number;
- manual wallet top-up;
- admin PIN rotation;
- announcements create/edit/activate/deactivate/delete;
- active-session refresh/revoke;
- appearance/language.

At each action verify:

- visible validation and confirmation;
- correct API/backend authorization;
- no secrets in responses/logs;
- persistence after refresh;
- audit/history event;
- idempotency/duplicate behavior for financial or security actions;
- rollback/cancel leaves state unchanged.

---

# Phase 3 — Delegate: human action plus technical verification

Log in as `QA Delegate` in a new clean browser context.

## 3.1 Dashboard and scope

1. Confirm the delegate dashboard opens.
2. Confirm Alpha appears and Beta does not.
3. Compare visible counts, requests, commissions, and activity with the synthetic manifest.
4. Refresh and repeat.
5. Confirm the dashboard data comes from the scoped server read and contains no PIN fields.
6. Attempt Alpha/Beta URL and local-state manipulation.
7. Confirm the backend still enforces the delegate scope.

## 3.2 Create-garage and trial request

1. Open the create-garage request form.
2. Test empty, invalid, duplicate-PIN, and valid synthetic values.
3. Toggle the trial option and verify the displayed days.
4. Submit.
5. Confirm the request is pending and not falsely active.
6. Verify delegate ownership/referrer fields are server-controlled.
7. Verify daily creation/request limits where supported.
8. Open the request as admin and approve it only if approved.
9. Return as delegate and verify the resulting record appears under the correct scope.

## 3.3 Recharge, commission, history, and settlement

1. Select Alpha.
2. Submit a valid synthetic recharge/top-up request.
3. Confirm pending status and one request only.
4. Verify the request contains the correct synthetic package, amount, and delegate relationship.
5. Review commission and period filter.
6. Compare the displayed result to the approved policy.
7. Verify 15-day referral eligibility/expiry and the fixed policy where applicable.
8. If delegate settlement is visible, review it but do not approve admin-only actions.
9. Attempt Beta, another delegate's request, approval, admin settings, and unrelated reports.
10. Confirm visible denial and backend denial for each.

---

# Phase 4 — Garage owner: human action plus technical verification

Log in as `QA Garage Owner` for Garage Alpha.

## 4.1 Dashboard, menu, and overlays

Open every owner-visible menu item:

- subscribers;
- smart reports;
- packages and balance recharge;
- recharge history;
- staff statistics;
- appearance;
- terms and conditions;
- announcements;
- recharge notification;
- trial-expiry modal;
- plate lookup/recent-exit warning.

For each item, verify the visible screen, loading/empty/error state, current-garage scope, refresh behavior, and safe close/reopen behavior.

## 4.2 Vehicle lifecycle

1. Check in a valid synthetic vehicle.
2. Verify the visible active row, plate normalization, current garage, and staff/owner attribution.
3. Verify the backend transaction creates one active vehicle, activity event, and idempotency record.
4. Repeat the same submission and confirm duplicate handling.
5. Check out the vehicle.
6. Verify cost, completed activity, ledger/event state, and removal from active vehicles.
7. Repeat checkout and confirm safe conflict/idempotent behavior.
8. Use plate lookup for active, exited, unknown, Arabic-digit, and malformed values.
9. Trigger the recent-exit warning with a synthetic record.
10. Cancel and confirm no write.
11. Continue only when allowed and verify one final state.
12. Test correction/deletion/refund confirmation and deletion locks with synthetic records.
13. Verify daily deletion limits, owner/staff ownership rules, transaction atomicity, and audit history.

## 4.3 Subscriber lifecycle

1. Add a valid synthetic subscriber.
2. Test missing fields, invalid dates, duplicate plate, Arabic/English digits, and malformed plate.
3. Verify the visible subscriber record and backend normalized fields.
4. Renew it using a synthetic package.
5. Verify dates, balance/package behavior, audit event, and idempotency.
6. Attempt immutable plate modification.
7. Confirm visible and backend rejection.
8. Delete only the QA subscriber if approved.
9. Verify the result after refresh and in the relevant activity history.

## 4.4 Packages, balances, recharge, history, fair use, and trial

1. Open packages and balance.
2. Review package duration, capacity, price, currency, and expiry.
3. Select a valid synthetic package or top-up.
4. Confirm the request visibly enters the correct state.
5. Verify the backend creates one request and no direct browser financial write.
6. Open recharge history.
7. Confirm pending, approved, rejected, and notification states are distinguishable.
8. After an approved synthetic recharge, confirm balance, expiry, package, commission/referral, ledger, activity, and notification all agree.
9. Test a custom amount only if the UI supports it.
10. Test expired, future-expiry, unlimited, fair-use, and capacity behavior with synthetic packages.
11. Open trial expiry for a synthetic trial garage and save the supported decision.
12. Verify the decision route, authorization, persistence, and repeat-display behavior.

## 4.5 Owner reports and staff statistics

1. Open reports and staff statistics.
2. Compare visible totals with the synthetic activity records.
3. Verify date/timezone labels and empty states.
4. Confirm these views do not include another garage.
5. Confirm the owner can see only the permitted owner data.
6. Confirm a staff session cannot use owner-only reports or statistics unless explicitly allowed.

---

# Phase 5 — Staff: human action plus technical verification

Log in as `QA Staff` assigned to Alpha.

1. Confirm only staff-permitted navigation appears.
2. Confirm owner/admin/delegate/supervisor controls are hidden or denied.
3. Check in and check out a synthetic vehicle.
4. Verify staff attribution in the visible activity and backend event.
5. Test duplicate, malformed, recently exited, wrong-garage, locked-garage, and offline actions.
6. Confirm staff-specific correction/deletion ownership rules.
7. Open subscribers and confirm only permitted fields/actions.
8. Open announcements, notifications, appearance, and terms if available.
9. Confirm reports and staff statistics are restricted as intended.
10. Attempt admin PIN, wallet, package configuration, manual approval, delegate management, supervisor management, and Beta access.
11. Confirm both UI and backend deny every unauthorized action.
12. Refresh, log out, press Back, and verify stale session denial.

---

# Phase 6 — Supervisor retired (technical denial only; no field login)

Supervisor is not an active role. Do not provision or use a Supervisor identity. Verify local regressions reject legacy PIN authentication, session refresh/release, protected APIs, and Firestore client access without changing preserved records. Record active-role Supervisor coverage as **N/A — role retired**; historical browser results are not ongoing authorization.

---

# Phase 7 — Cross-role workflow chain

Run one complete chain through the application using synthetic records:

1. Admin creates or approves a synthetic garage/package/configuration.
2. Delegate creates a synthetic garage or recharge request.
3. Admin reviews and approves/rejects the request.
4. Garage owner sees the authoritative result.
5. Owner creates a subscriber and performs a vehicle operation.
6. Staff performs a permitted operational action.
7. Owner views the activity/report/history.
8. Admin views the platform-level audit/report.
9. Delegate views only its permitted commission/request history.
10. No Supervisor action occurs; role retired (**N/A**).
11. Each active role logs out.
12. Verify every final state, event, amount, date, role, and scope is consistent.

This chain is passed only when the same synthetic event is represented consistently in the appropriate user screens, backend response, persisted record, activity/history, audit event, and report.

---

# Phase 8 — Same account, multi-device, offline, and PWA tests

## 8.1 Same account on two devices

1. Log in as a synthetic owner in Browser A.
2. Log in as the same owner in Browser B.
3. Confirm both sessions show Alpha.
4. Perform a harmless synthetic update in A.
5. Refresh B and confirm authoritative synchronization.
6. Log out or revoke one session according to the approved policy.
7. Attempt a protected action from the affected browser.
8. Verify visible session behavior and backend denial/release behavior.

## 8.2 Offline and failure behavior

For one main workflow per role:

1. Open the screen online.
2. Disconnect or simulate a timeout.
3. Submit a protected action.
4. Confirm the UI does not claim success.
5. Confirm no partial backend record was created.
6. Reconnect and retry.
7. Confirm exactly one successful final state.
8. Verify safe error/correlation information without sensitive payloads.

## 8.3 Mobile and PWA

On mobile-sized viewports, repeat login, dashboard, one main operation, one modal, and logout for every role. Verify touch targets, keyboard visibility, RTL/LTR layout, drawer behavior, table overflow, loading state, error state, and no data leakage after logout.

If installable:

1. Install using a synthetic account.
2. Close and reopen.
3. Confirm session behavior.
4. Log out.
5. Reopen and confirm protected data is not available to the next account.
6. Verify service-worker/cache behavior does not bypass server authorization.

---

# Phase 9 — Technical checks attached to every user action

For every protected mutation encountered in Phases 2–8, confirm as much as the approved tools allow:

| Technical check | Required observation |
|---|---|
| Authority | Mutation is performed by the Cloudflare Worker/server authority, not an unsafe browser Firestore write |
| Authentication | Request carries the supported authenticated context |
| Authorization | Role, entity, garage, and requested target are checked server-side |
| Validation | Invalid fields, amounts, dates, IDs, and statuses are rejected safely |
| Scope | Alpha/Beta and role boundaries cannot be changed by client input |
| Atomicity | Related balance, package, vehicle, request, event, and ledger state changes together |
| Idempotency | Replay does not duplicate money, vehicle transitions, commissions, or events |
| Persistence | Refresh/relogin shows the authoritative stored result |
| Audit | The action has a safe actor, target, action, time, and correlation/operation reference |
| Secrecy | No PIN hash, token, password, card data, or private payload appears in UI/logs/errors |
| Failure | Timeout, offline, 401, 403, 409, 429, and 500 behavior is safe and recoverable |
| UI integrity | Loading, disabled, confirmation, cancel, empty, and error states are correct |

If a technical observation cannot be made safely from the browser, mark it `BLOCKED — technical evidence unavailable`; do not infer a pass from the visible UI alone.

---

# Phase 10 — Final feature-by-role matrix

The final report must include every cell. Use `PASS`, `FAIL`, `BLOCKED`, or `N/A — reason`.

| Capability | Admin | Delegate | Garage owner | Staff | Supervisor (retired; N/A) | Technical evidence |
|---|---|---|---|---|---|---|
| Login/session |  |  |  |  |  |  |
| Refresh/heartbeat |  |  |  |  |  |  |
| Logout/revocation |  |  |  |  |  |  |
| Dashboard/navigation |  |  |  |  |  |  |
| Garage creation |  |  |  |  |  |  |
| Garage approval/rejection |  |  |  |  |  |  |
| Garage details/status |  |  |  |  |  |  |
| Garage deletion/maintenance |  |  |  |  |  |  |
| Staff management |  |  |  |  |  |  |
| Delegate management |  |  |  |  |  |  |
| Supervisor management (retired) | N/A | N/A | N/A | N/A | N/A — role retired | Worker/Express tombstone and PIN-update denial tests; records preserved |
| Recharge requests |  |  |  |  |  |  |
| Recharge approval/rejection |  |  |  |  |  |  |
| Manual wallet top-up |  |  |  |  |  |  |
| Wallet number |  |  |  |  |  |  |
| Packages/catalog |  |  |  |  |  |  |
| Subscriber lifecycle |  |  |  |  |  |  |
| Vehicle check-in |  |  |  |  |  |  |
| Vehicle checkout |  |  |  |  |  |  |
| Vehicle correction/deletion |  |  |  |  |  |  |
| Plate lookup/recent exit |  |  |  |  |  |  |
| Fair use |  |  |  |  |  |  |
| Trial leads/decisions |  |  |  |  |  |  |
| Reports/calculator |  |  |  |  |  |  |
| Staff statistics |  |  |  |  |  |  |
| Delegate commissions/settlement |  |  |  |  |  |  |
| Announcements |  |  |  |  |  |  |
| Appearance/language |  |  |  |  |  |  |
| Admin PIN/security |  |  |  |  |  |  |
| Active sessions |  |  |  |  |  |  |
| Audit/history |  |  |  |  |  |  |
| Offline/retry |  |  |  |  |  |  |
| Mobile/PWA |  |  |  |  |  |  |
| Cross-garage isolation |  |  |  |  |  |  |

---

# Phase 11 — Required final report

Create:

```text
RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_<YYYY-MM-DD>.md
```

The report must contain:

- exact commit SHA;
- frontend URL and backend origin without secrets;
- browser/device and language;
- synthetic account aliases and dataset manifest;
- baseline command results;
- role-by-role user results;
- technical observation attached to each workflow;
- complete feature-by-role matrix with no blank cells;
- failures, blocked tests, and not-applicable reasons;
- safe screenshots/evidence;
- severity and reproducibility;
- synthetic cleanup status;
- rollback commit or release;
- final decision.

## Final decision rules

- **PASS** — every applicable role/workflow passed visibly and technically; no Blocker/Critical/High defect remains; no required test is unverified.
- **PASS WITH FIXES** — core workflows pass, but Medium/Low defects remain documented.
- **FAIL** — any role cannot complete its primary workflow, any wrong-scope action succeeds, any financial/vehicle transition is wrong, or technical authority cannot be proven for a protected mutation.
- **BLOCKED** — required accounts, browser access, deployment, backend, synthetic data, or safe technical evidence are unavailable.

A visible success message alone is not enough. A passing unit test alone is not enough. The integrated scenario passes only when the human result and the related technical checks both pass.

## Exact instruction to the executing agent

> Start with `docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`, then use this document as the scenario catalog and matrix. Verify the exact Cloudflare Pages preview → `rq-hono-preview` Worker pairing before browser acceptance; a local proxy is diagnostic only. Use synthetic pre-production data and one role/context at a time. Do not access production or `main`, perform financial writes, or blindly retry ambiguous mutations. Mark every cell with evidence-backed status; do not infer backend success from UI alone. Update the existing H6 reports and handoff. H6/H7 cannot certify “100% bug-free”; while a required gate is open, H7 must be HOLD/NO-GO.
