

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
