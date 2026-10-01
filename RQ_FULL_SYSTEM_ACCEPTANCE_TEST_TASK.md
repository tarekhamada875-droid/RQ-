# RQ Full-System Acceptance Test Task

> **Document status:** Supplemental technical-only reference. The primary execution task is `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md`, which combines technical checks with the human role workflows. Do not run this file as a separate acceptance gate when the integrated task is being executed.

## Mission

Perform a complete, evidence-based acceptance test of the RQ garage-management PWA across **every supported role, every major user flow, every protected API capability, the Cloudflare-to-Railway-to-Firebase topology, tenant/scope isolation, session behavior, financial correctness, PWA behavior, and failure recovery**.

This is a **test-only mission**. Do not redesign the UI, change business rules, delete data, alter Firebase billing, change the Firestore database identity, or weaken authorization to make a test pass.

The current environment is controlled synthetic pre-production. Use only approved synthetic accounts and synthetic records. Never use unknown records, real customer data, real payment details, or production-destructive operations.

## Required starting documents

Read these before testing:

1. `RQ_PROJECT_KNOWLEDGE_BASE.md`
2. `AGENTS.md`
3. `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`
4. `REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md`
5. `docs/OBSERVABILITY_RUNBOOK.md`
6. `BRANCHING_AND_RELEASES.md`

The repository's current source of truth is `main`. Preserve the existing UI/UX contract. If the exact phrase `tokens ending` appears, stop this mission and follow `docs/SUCCESSION_PROTOCOL.md`.

---

## Safety rules

- Use synthetic pre-production data only.
- Do not paste secrets, tokens, PINs, private keys, or payment information into chat, logs, screenshots, issues, or commits.
- Do not print Firebase service-account contents or environment variables.
- Do not reset, delete, migrate, or bulk-clean unknown data.
- Do not enable Firebase billing or change database identity.
- Do not make real purchases, send real money, or submit external financial records.
- Use test-only identifiers such as `qa-20260930-*`.
- Every created test record must be identifiable and removable through an approved synthetic-data cleanup procedure.
- If a test could mutate an irreversible record, stop and request an explicit test-boundary decision.

---

## Required outputs

Create a complete test report named:

```text
RQ_FULL_SYSTEM_ACCEPTANCE_TEST_REPORT_<YYYY-MM-DD>.md
```

The report must include:

- exact commit SHA tested;
- frontend URL and backend origin, without secrets;
- test environment and browser/device details;
- synthetic accounts used, identified by safe aliases only;
- synthetic dataset IDs or aliases;
- automated command results;
- browser test results for every role;
- API/security test results;
- financial and idempotency results;
- responsive/PWA results;
- deployment and observability results;
- defects with severity, reproducibility, evidence, and suggested owner;
- screenshots or safe evidence links where allowed;
- final decision: `PASS`, `PASS WITH BLOCKERS`, or `FAIL`;
- exact next bounded task.

Do not report `PASS` merely because the application loads or the unit tests pass.

---

## Phase 0 — Establish the test baseline

### 0.1 Repository and commit baseline

Run and record:

```bash
git fetch origin --prune
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git log --oneline -10
```

The working tree must be clean before testing unless the report explicitly identifies local test-only changes.

### 0.2 Automated production gate

Run the full local gate from the repository root:

```bash
npm test -- --run
npm run lint
npm run build
npm run maintainability:check
npm run ci:check
git diff --check
```

Also run the retained deterministic tools where appropriate:

```bash
npm run benchmark
npm run release:smoke
```

Record:

- test file count;
- test count;
- failures and warnings;
- build output status;
- generated artifact status;
- maintainability status;
- smoke-tool status.

A known test warning is not automatically a failure, but every warning must be classified as harmless, test-only, or a release blocker.

### 0.3 Static authority scan

Review the current diff and source for protected browser writes:

```bash
rg -n "setDoc|updateDoc|writeBatch|runTransaction|addDoc|deleteDoc" src server
rg -n "apiClient|fetch\(|/api/" src/services src/hooks src/api
rg -n "pinHash|pinLookupHash|adminPin|ownerPin|password|token" src server
```

For every protected mutation, record whether it is:

- backend-authoritative;
- an allowed display/read listener;
- a test fixture;
- a documented compatibility path;
- an unexplained authority violation.

Any unexplained browser-side write to protected session, financial, vehicle, subscriber, garage, staff, delegate, supervisor, or authorization state is a release blocker.

---

## Phase 1 — Test environment and synthetic dataset

Create or obtain an isolated synthetic test boundary. Do not assume the shared deployment is safe for destructive testing.

### 1.1 Required synthetic accounts

Prepare safe aliases for these roles:

| Alias | Role | Scope |
|---|---|---|
| `qa-platform-admin` | platform administrator | all platform records |
| `qa-supervisor` | supervisor | approved supervisor scope |
| `qa-garage-alpha` | garage account | Garage Alpha only |
| `qa-garage-beta` | garage account | Garage Beta only |
| `qa-staff-alpha-1` | garage staff | Garage Alpha only |
| `qa-staff-alpha-2` | garage staff | Garage Alpha only |
| `qa-staff-beta-1` | garage staff | Garage Beta only |
| `qa-delegate-a` | delegate | explicitly referred/owned garages only |
| `qa-delegate-b` | delegate | different referral/ownership set |
| `qa-unauthorized` | authenticated but unauthorized principal | no privileged scope |
| `qa-revoked` | session-revocation test principal | controlled test scope |

If the product uses a different login mechanism, map these aliases to the actual supported mechanisms without exposing credentials.

### 1.2 Required synthetic records

Create or identify:

- two garages with distinct owners/scopes;
- at least one locked or suspended garage;
- at least one active garage;
- staff in both garages;
- supervisors with permitted and denied scopes;
- delegates with distinct referred/owned garage sets;
- monthly subscribers with active, expired, pending, and eligible/ineligible states;
- packages covering all supported duration and capacity variants, including custom and 15-day behavior where supported;
- vehicles with valid, duplicate, exited, active, and deletion-lock states;
- pending recharge requests;
- synthetic manual-credit approval records;
- synthetic financial ledger and report fixtures;
- audit/operation-trace events;
- session records for two-device and stale-session testing.

Every record must carry a safe QA marker in a permitted field or a documented external test manifest.

### 1.3 Dataset integrity snapshot

Before destructive or mutating tests, capture a safe count/hash summary, not sensitive contents:

- number of garages;
- number of vehicles by state;
- number of subscribers by state;
- number of staff/delegates/supervisors;
- number of pending requests;
- number of ledger entries;
- number of audit events;
- session marker counts.

After testing, compare the summary and run the approved synthetic cleanup procedure.

---

## Phase 2 — Authentication and session acceptance tests

Run these tests in at least two independent browser contexts and, where possible, two devices.

### 2.1 Login matrix

For every supported role:

1. Open the correct login route.
2. Verify the page renders without console errors.
3. Submit missing, malformed, and incorrect credentials/PINs.
4. Confirm errors are safe, localized as designed, and do not reveal whether a sensitive account exists.
5. Submit valid synthetic credentials.
6. Confirm the user lands on the correct role-specific view.
7. Confirm the session header/token is established through the supported client boundary.
8. Confirm the backend derives role and scope from the authenticated principal.

Expected results:

- no protected dashboard appears before authentication;
- no sensitive credentials are read from public Firestore documents;
- repeated failures are rate-limited;
- successful authentication resets the correct rate-limit state;
- malformed or expired tokens fail safely.

### 2.2 Logout matrix

For each role:

1. Log in.
2. Open a protected view.
3. Trigger the normal logout flow.
4. Confirm local user/session state is cleared.
5. Confirm server-side release/revocation is requested through the API.
6. Attempt to reuse the old session in the same browser.
7. Attempt to call a protected endpoint with the old token/session header.
8. Confirm access is denied and the UI returns to login without a crash.

Test browser close/navigation immediately after logout where supported. Record whether the documented background cleanup behavior is acceptable.

### 2.3 Same account on multiple devices

Test the documented multi-device policy for garage, staff, delegate, supervisor, and admin accounts:

- device A logs in;
- device B logs in with the same account;
- device A refreshes/heartbeats;
- device B refreshes/heartbeats;
- one device logs out;
- the other device continues or is revoked according to the documented policy;
- stale sessions time out according to the approved 24-hour policy;
- a revoked session cannot continue through a browser-side fallback.

Record exact observed behavior and compare it with the checkpoint plan.

### 2.4 Session failure tests

Simulate or safely induce:

- expired token;
- revoked server session;
- missing session header;
- invalid session header;
- backend outage during refresh;
- slow backend response;
- browser offline mode;
- duplicate heartbeat;
- refresh while logged out.

Expected results:

- no direct browser Firestore fallback writes for protected session state;
- fail-closed behavior where required;
- clear user-facing session-expired state;
- no infinite refresh loop;
- no unhandled rejection or React crash.

---

## Phase 3 — Platform administrator acceptance tests

### 3.1 Admin navigation and shell

Verify:

- admin login route;
- dashboard load;
- navigation entries;
- responsive sidebar/drawer;
- Arabic/English behavior if enabled;
- theme/color settings where supported;
- loading, empty, and error states;
- no unrelated garage/staff/delegate data is exposed outside the permitted UI.

Check that buttons, cards, tables, modals, confirmation dialogs, touch targets, focus states, disabled states, and loading spinners match the existing UI/UX contract.

### 3.2 Garage lifecycle

Test with synthetic Garage Alpha and Garage Beta:

- create garage with valid data;
- reject missing and malformed fields;
- reject duplicate PIN or unique identifiers;
- update allowed fields;
- preserve immutable fields;
- set active/locked/suspended states;
- view garage details;
- view staff and financial summaries;
- archive/delete only where the documented policy permits;
- verify deletion locks, recovery behavior, and audit trail;
- verify all operations are server-authoritative and idempotent where applicable.

### 3.3 Staff, delegate, and supervisor administration

Test:

- create staff;
- assign staff to a garage;
- update staff status/permissions;
- rotate or update credentials through the approved flow;
- create delegate;
- assign/refer garage relationships;
- create/update supervisor;
- verify scope changes take effect on the next authorized request;
- deny cross-garage assignment and access;
- ensure sensitive PIN metadata never appears in display payloads or logs.

### 3.4 Package and system settings

Test:

- create/update supported packages;
- daily, weekly, biweekly, monthly, 15-day, custom duration, vehicle-count, capacity, unlimited, and fallback behavior where supported;
- update configurable monthly subscriber fee/defaults;
- verify persisted settings override fallbacks;
- verify missing/malformed settings use safe documented fallbacks;
- verify settings are not permanently hardcoded in frontend or backend;
- verify settings changes are audited and scope-protected.

### 3.5 Reports and admin dashboard

Verify:

- report date boundaries;
- current month versus cumulative totals;
- timezone labels;
- currency labels;
- platform/garage/delegate scope;
- empty and unavailable report states;
- no estimated number is presented as an authoritative accounting total;
- report reads do not permit cross-scope access;
- report errors preserve the dashboard layout.

---

## Phase 4 — Garage operator and staff acceptance tests

Run the same core workflow as a garage account and as staff. Verify differences in permissions.

### 4.1 Garage dashboard

Verify:

- correct garage identity;
- correct balance/subscription status;
- active vehicle list;
- today's transactions;
- monthly subscribers;
- package/fee information;
- staff visibility;
- announcements and operational notices;
- refresh behavior;
- no other garage data.

### 4.2 Vehicle check-in

Test:

- valid plate check-in;
- Arabic/English digit normalization;
- Egyptian plate formatting;
- duplicate active vehicle;
- missing plate;
- malformed plate;
- locked/suspended garage;
- full capacity garage;
- unlimited-capacity package;
- monthly subscriber priority/handling;
- concurrent duplicate check-ins;
- retry after network error;
- double-click submission;
- idempotent replay;
- audit event and staff attribution.

Expected results:

- one valid vehicle transition only;
- no duplicate charge or vehicle record;
- safe localized error;
- no optimistic state remains after a failed server command.

### 4.3 Vehicle check-out

Test:

- valid checkout;
- wrong garage vehicle ID;
- already exited vehicle;
- missing vehicle;
- cost calculation;
- staff attribution;
- locked/suspended garage checkout policy;
- concurrent checkout from two devices;
- idempotent replay;
- transaction/audit event persistence.

### 4.4 Vehicle correction/deletion/refund

Test:

- permitted deletion/refund;
- deletion lock for protected or completed states;
- daily deletion limit;
- wrong staff/garage scope;
- missing vehicle;
- refund calculation;
- confirmation modal;
- cancelled confirmation leaves state unchanged;
- audit trail and ledger consistency.

### 4.5 Staff-specific access

For staff assigned to Garage Alpha:

- allow permitted Alpha operations;
- deny Garage Beta operations;
- deny admin-only deletion/settings/report operations;
- deny delegate/supervisor-only operations;
- confirm session and logout behavior;
- confirm staff display data contains no secrets.

---

## Phase 5 — Delegate acceptance tests

### 5.1 Delegate dashboard

Verify:

- only referred/owned garages appear;
- dashboard fields are populated from the scoped server read;
- no browser list query is used where rules deny it;
- garage count, request count, commission, balance, and activity values match synthetic fixtures;
- empty state is correct when no scoped records exist;
- delegate cannot change the displayed scope by editing URL/local storage.

### 5.2 Delegate subscription/recharge flow

Test:

- submit garage subscription/recharge request;
- duplicate submission;
- changed-payload reuse of an idempotency key;
- request visible only to permitted parties;
- request approval/rejection behavior;
- commission calculation for all approved package types;
- 15-day referral eligibility/expiry behavior;
- fixed 100 EGP delegate commission policy where applicable;
- audit and financial ledger entries;
- cross-delegate denial.

### 5.3 Delegate denial matrix

Explicitly attempt:

- access to an unrelated garage;
- admin dashboard route;
- supervisor route;
- staff management;
- financial report outside scope;
- direct approval of a recharge request;
- mutation of another delegate's records.

Every attempt must fail safely without leaking record existence.

---

## Phase 6 — Supervisor acceptance tests

Test supervisor permissions exactly as documented:

- login and session lifecycle;
- permitted garage list and details;
- permitted maintenance operations;
- permitted reports;
- denial of admin-only configuration;
- denial of delegate-only and staff-only operations;
- cross-garage denial;
- audit actor and scope correctness;
- session revocation and timeout.

Run the complete role/state matrix from `server/operationalPolicy.matrix.test.ts` against browser-visible behavior, not only unit fixtures.

---

## Phase 7 — Subscriber, package, and subscription acceptance tests

### 7.1 Monthly subscriber lifecycle

Test:

- add subscriber;
- valid start/end dates;
- invalid date range;
- invalid calendar date;
- renew;
- update permitted fields;
- delete where allowed;
- immutable plate behavior;
- duplicate subscriber/plate rules;
- expired subscriber behavior;
- garage scope;
- idempotent replay;
- changed-payload idempotency conflict;
- audit event.

### 7.2 Package and balance behavior

Test all supported package types without assuming only weekly/monthly values:

- daily;
- weekly;
- biweekly;
- 15-day;
- monthly;
- custom duration;
- capacity/vehicle-count;
- unlimited/fair-use behavior;
- expired balance;
- extension from future expiry;
- extension from current time after expiry;
- malformed package fallback;
- system-configured values.

Verify date calculations through safe date normalization and boundary tests around midnight/Cairo business-day behavior.

### 7.3 Financial report and calculator behavior

Verify:

- platform revenue and garage revenue are not mixed;
- current-month values use the correct UTC/date scope;
- cumulative values are not mislabeled as current-month values;
- partner/delegate calculator uses the authoritative report read;
- calculator is labeled as an estimate where required;
- missing or malformed reports fail safely rather than displaying a false zero.

---

## Phase 8 — Recharge, manual credit, and financial acceptance tests

All financial tests must use synthetic amounts and records.

### 8.1 Direct recharge

Test:

- valid admin recharge;
- valid scoped recharge;
- invalid amount;
- zero/negative amount;
- malformed currency;
- wrong garage scope;
- duplicate idempotency key replay;
- changed-payload idempotency reuse;
- concurrent recharges;
- atomic ledger/balance/event persistence;
- injected transaction failure and rollback;
- safe error response.

### 8.2 Manual credit approval

Test:

- create pending request;
- approve once;
- replay same approval key and payload;
- reuse key with changed payload;
- reject unauthorized approver;
- approve missing request;
- approve already processed request;
- concurrent approvals with different keys;
- injected commit failure;
- verify balance, ledger, event, request, and idempotency record remain all-or-nothing.

### 8.3 Payments and sensitive information

Verify:

- no card data is requested or stored;
- references/notes are safe;
- sensitive values are not logged;
- financial events are auditable;
- reports reconcile to synthetic ledger entries;
- unauthorized roles cannot mutate money or read unrelated financial records.

---

## Phase 9 — API contract, security, and tenant-isolation tests

### 9.1 API envelope behavior

For every major endpoint, test:

- valid success response;
- malformed JSON;
- missing required field;
- invalid type;
- invalid date;
- invalid amount;
- missing auth;
- expired auth;
- revoked session;
- wrong role;
- wrong garage/entity scope;
- unknown ID;
- duplicate command;
- internal failure.

Verify consistent safe error envelopes with correlation IDs and no stack traces or secrets.

### 9.2 Tenant isolation matrix

Use Garage Alpha and Garage Beta. For every role and every resource, attempt:

- direct GET of the other garage's ID;
- list query filtered to the other garage;
- mutation using the other garage's ID;
- mixed payload containing one allowed and one forbidden ID;
- report query for the other garage;
- recharge/subscriber/vehicle request for the other garage;
- websocket/listener or display synchronization path if applicable;
- stale cached object after switching accounts.

Expected result: denial or an intentionally empty safe result according to contract, never leaked data.

### 9.3 Browser-authority boundary

Verify that a malicious browser caller cannot:

- write a session document directly to gain access;
- alter garage balance or expiry;
- create a vehicle transition without backend authorization;
- approve a recharge by writing Firestore;
- change role or tenant IDs in local storage;
- bypass an expired subscription;
- alter a report total;
- access PIN metadata.

Use read-only inspection and synthetic test rules. Do not weaken production rules to perform this test.

### 9.4 Rate limiting and abuse resistance

Test:

- repeated failed login/PIN attempts;
- rate-limit response code and envelope;
- successful authentication reset;
- multiple backend instances/shared-store behavior if available;
- memory fallback behavior only when Admin SDK is intentionally unavailable;
- no unbounded memory growth in fallback map;
- no credential or IP disclosure in responses/logs.

---

## Phase 10 — Frontend UI/UX and accessibility acceptance tests

The goal is to verify the existing UI/UX, not redesign it.

### 10.1 Visual parity

For login, garage dashboard, admin dashboard, delegate dashboard, supervisor views, package/subscriber screens, vehicle modals, recharge flows, and reports, verify:

- colors;
- typography;
- card sizes;
- button dimensions;
- spacing;
- border radius;
- shadows;
- icons;
- modal/drawer dimensions;
- table/list density;
- navigation order;
- Arabic RTL and English LTR behavior;
- existing labels and approved product changes;
- no unauthorized redesign or feature removal.

### 10.2 Responsive matrix

Test at minimum:

- 360×800 mobile;
- 390×844 mobile;
- 768×1024 tablet;
- 1024×768 tablet/desktop boundary;
- 1280×800 desktop;
- 1440×900 desktop.

Check for:

- horizontal overflow;
- clipped modals;
- inaccessible drawers;
- buttons below 44×44 touch target where applicable;
- broken RTL alignment;
- table overflow behavior;
- keyboard visibility and numeric input behavior;
- layout shift during loading.

### 10.3 Accessibility and interaction states

For every interactive view:

- keyboard tab order;
- visible focus ring;
- Enter/escape behavior;
- disabled state during async mutation;
- loading spinner or equivalent feedback;
- duplicate-click prevention;
- error message association with fields;
- screen-reader labels for icon-only controls;
- no state update after unmount;
- no console errors.

### 10.4 Loading, empty, offline, and failure states

Force or simulate:

- slow API;
- timeout;
- empty collection;
- malformed response;
- HTML response;
- 401;
- 403;
- 404;
- 409 business conflict;
- 429 rate limit;
- 500 server error;
- browser offline.

Every affected screen must remain usable and recoverable without a full-page crash.

---

## Phase 11 — PWA acceptance tests

Verify:

- valid manifest;
- correct icon and theme color;
- install prompt/installation where browser supports it;
- standalone launch;
- correct startup route;
- service worker registration;
- cache does not expose authenticated data to the wrong account;
- logout clears sensitive in-memory and browser state;
- stale cached shell does not bypass server authorization;
- offline shell behavior is documented;
- reconnect behavior refreshes authoritative data;
- update/reload behavior does not strand users on an obsolete API contract.

Test install, close, reopen, logout, login as another synthetic account, and uninstall/reinstall where possible.

---

## Phase 12 — Deployment and observability acceptance tests

### 12.1 Cloudflare frontend to Railway backend

Verify in the deployed environment:

- frontend loads from Cloudflare;
- `/api/*` requests are sent to the configured Railway origin;
- API origin is not accidentally the Cloudflare Pages origin;
- CORS allows the intended frontend origin only;
- preflight responses are correct;
- health/readiness endpoints report safe metadata;
- frontend and backend commit/version identifiers are recorded;
- no secrets appear in browser bundles, headers, logs, or errors.

### 12.2 Backend operational behavior

Verify:

- cold start;
- readiness failure;
- Firebase Admin initialization failure;
- Firestore unavailable;
- request timeout;
- transaction retry/failure;
- safe 500 response;
- correlation ID propagation;
- operation ID propagation;
- safe operation trace contents;
- no request bodies, credentials, PINs, or payment details in logs.

### 12.3 Observability evidence

For one synthetic successful request and one synthetic failed request, record:

- frontend correlation ID;
- backend correlation ID;
- operation ID;
- safe actor/scope hash if applicable;
- endpoint and method;
- status code;
- error code for failure;
- duration;
- absence of sensitive payloads.

Follow `docs/OBSERVABILITY_RUNBOOK.md` and do not expose private log URLs or secrets in the report.

---

## Phase 13 — Regression and concurrency suite

Run concurrency tests against synthetic records:

- two check-ins for the same plate;
- two check-outs for the same vehicle;
- two deletion/refund requests;
- two subscriber renewals;
- two manual-credit approvals;
- two recharge requests;
- two session claims;
- simultaneous heartbeats;
- concurrent delegate dashboard refresh;
- concurrent report reads during a transaction.

For each scenario, verify:

- one valid final state;
- no duplicated money;
- no duplicated vehicle transition;
- no partial multi-document persistence;
- deterministic conflict response;
- correct audit history;
- safe retry behavior.

---

## Phase 14 — Cleanup and rollback verification

After testing:

1. Export or record the synthetic dataset manifest.
2. Remove only records created by this test task, using the approved cleanup route/process.
3. Confirm no real or unknown records were changed.
4. Re-run safe counts/hashes.
5. Confirm test accounts are disabled or marked synthetic.
6. Confirm no test tokens or credentials remain in local storage, browser profiles, logs, or files.
7. Verify the known-good commit can be restored.
8. Document the rollback command or commit; do not execute destructive rollback automatically.

If cleanup cannot be proven safe, stop and report the blocker rather than deleting broadly.

---

## Severity rules

### Blocker

Any of the following is a blocker:

- cross-tenant data read or mutation;
- browser-authoritative protected write;
- unauthorized financial mutation;
- duplicated money or vehicle transition;
- authentication bypass;
- session revocation bypass;
- leaked secret, PIN, token, or sensitive financial/identity data;
- deployed frontend cannot reach the configured backend;
- real-data boundary is unclear;
- destructive cleanup cannot be scoped safely.

### Critical

- a core role cannot log in or complete its primary flow;
- transaction rollback leaves partial financial or operational state;
- production build or backend build fails;
- major API contract is broken;
- PWA exposes another user's cached protected data;
- rate limiting does not protect authentication across the deployed topology.

### High

- a major workflow fails with a recoverable error;
- report totals are materially misleading;
- incorrect scope appears in a dashboard;
- logout leaves a usable stale session;
- repeated requests can cause inconsistent non-financial state.

### Medium/Low

- visual mismatch;
- minor responsive defect;
- non-blocking copy/translation issue;
- test-only warning with no user impact.

No `PASS` is allowed while any Blocker or Critical defect remains open.

---

## Final acceptance matrix

The report must include one row for each area:

| Area | Automated | Browser/API | Evidence | Result |
|---|---:|---:|---|---|
| Build, typecheck, maintainability |  |  |  |  |
| Platform admin |  |  |  |  |
| Supervisor |  |  |  |  |
| Garage account |  |  |  |  |
| Garage staff |  |  |  |  |
| Delegate |  |  |  |  |
| Authentication |  |  |  |  |
| Logout/revocation |  |  |  |  |
| Multi-device sessions |  |  |  |  |
| Tenant/scope isolation |  |  |  |  |
| Vehicles |  |  |  |  |
| Subscribers |  |  |  |  |
| Packages/balances |  |  |  |  |
| Recharge/manual credit |  |  |  |  |
| Delegate commissions/referrals |  |  |  |  |
| Reports/calculator |  |  |  |  |
| UI/UX parity |  |  |  |  |
| Accessibility/responsive |  |  |  |  |
| PWA |  |  |  |  |
| Cloudflare → Railway → Firebase |  |  |  |  |
| Observability |  |  |  |  |
| Cleanup/rollback |  |  |  |  |

---

## Completion report format

End the report with:

```markdown
## Final decision

- Decision: PASS | PASS WITH BLOCKERS | FAIL
- Commit tested:
- Frontend URL:
- Backend origin:
- Automated tests:
- Browser/API scenarios:
- Blockers:
- Critical defects:
- High defects:
- Synthetic cleanup status:
- Rollback commit:
- Recommended next bounded task:
```

The recommended next task must be exactly one bounded task, for example:

> Repair the server-authoritative delegate approval path for changed idempotency-key payloads, add one integration test, run the focused gate, then rerun the delegate acceptance slice.

Do not combine unrelated fixes under one acceptance result.


---

## Phase 15 — Current-feature coverage reconciliation

This section is an explicit reconciliation against the current RQ frontend and backend so that a broad test does not accidentally skip menu items or routes hidden inside larger screens.

### 15.1 Admin feature coverage

The technical tester must produce evidence for each of these admin capabilities, even when several are rendered inside one dashboard component:

- overview/dashboard;
- garage list, search, pagination/infinite loading, details, creation, approval, rejection, maintenance, and deletion policy;
- recharge requests and garage-creation requests;
- trial leads, trial status decisions, expiry handling, and decision authorization;
- package catalog, package validation, duration/capacity/unlimited variants, and inactive packages;
- people management for delegates and supervisors;
- delegate detail history, period filtering, commission calculations, settlement, PIN update, and revocation;
- fair-use list, fair-use state, automatic extension, and admin extension;
- partner/dividend calculator and its current-month authoritative report contract;
- wallet number and direct/admin wallet top-up;
- admin PIN update/rotation and PIN secrecy;
- platform announcements create, edit, activate/deactivate, delete, and recipient display;
- global settings, configurable subscriber fee fallback, commission policy, and system defaults;
- package/catalog settings;
- active sessions, refresh, revoke, and stale-session handling;
- admin appearance/theme/language behavior;
- admin audit/activity history and safe payload logging.

For each capability, record: authorized role, endpoint or service boundary, success result, validation failure, unauthorized result, idempotency behavior where applicable, audit event, and safe evidence.

### 15.2 Garage-owner feature coverage

The technical test must explicitly cover the owner-visible garage menu and overlays:

- active vehicles and today's completed transactions;
- check-in, checkout, cost calculation, duplicate handling, recent-exit warning, correction, deletion, and refund limits;
- subscriber list, add, edit, renew, delete, date validation, immutable plate behavior, and expiry warning;
- packages and balance recharge;
- recharge history and approved/rejected/pending notification state;
- staff statistics;
- garage reports;
- appearance settings;
- terms and conditions modal;
- active platform announcements;
- trial-expiry decision modal;
- network/offline state and retry behavior;
- plate lookup and empty-result behavior;
- owner logout and session release.

The test must verify that staff does not receive owner-only controls where the UI and policy intentionally hide them.

### 15.3 Staff feature coverage

For a staff principal, explicitly verify:

- staff login and garage scope;
- active vehicle list synchronization;
- check-in and checkout attribution to the correct staff member;
- staff-specific deletion/correction ownership rules;
- subscriber visibility and permitted actions;
- restricted reports and staff-statistics behavior;
- announcements and notifications;
- appearance/terms access if permitted;
- denial of owner, admin, delegate, supervisor, PIN, settings, wallet, approval, and cross-garage actions;
- logout, refresh, stale session, and offline failure behavior.

### 15.4 Delegate feature coverage

For a delegate principal, explicitly verify:

- scoped dashboard read;
- referred/created garage list;
- create-garage request;
- generated unique PIN behavior;
- free-trial toggle and trial-day payload;
- daily creation/request limit;
- top-up/recharge request;
- pending request display;
- commission and period filtering;
- 15-day referral eligibility/expiry;
- history and settlement visibility where permitted;
- denial of approval, unrelated garage, unrelated delegate, admin settings, and cross-scope actions;
- logout, refresh, stale session, and offline behavior.

### 15.5 Supervisor feature coverage

The supervisor acceptance slice must explicitly verify the restricted admin dashboard behavior:

- people/delegates/supervisors area allowed by policy;
- automatic return to the permitted tab if an unsupported admin tab is selected;
- no garage creation;
- no garage deletion;
- no admin PIN change;
- no wallet/manual top-up;
- no global settings or catalog changes;
- no unrestricted financial report access;
- no delegate revocation/settlement unless specifically authorized;
- permitted audit and review scope;
- logout and revoked-session behavior.

### 15.6 Cross-feature user-facing state coverage

For every screen and overlay above, include these human-observable states:

1. first load;
2. loading/refresh;
3. populated data;
4. empty data;
5. invalid input;
6. cancelled confirmation;
7. successful save;
8. duplicate submission;
9. unauthorized action;
10. expired/revoked session;
11. network timeout/offline;
12. retry after reconnect;
13. mobile viewport;
14. Arabic/English direction where supported;
15. return to the screen after logout and re-login.

### 15.7 Coverage sign-off rule

The final report must contain a feature-by-role matrix with no blank cells. Use `PASS`, `FAIL`, `BLOCKED`, or `NOT APPLICABLE — reason`. A general statement such as “admin dashboard tested” is not sufficient evidence for the individual admin screens listed above.
