# Football Academy SaaS Platform
## From-Scratch Checkpointed Build Plan

**Working title:** Academy RQ
**Purpose:** Build a multi-tenant football-academy management PWA that preserves the existing RQ application's architecture, security model, admin experience, visual language, responsive behavior, and operational style while replacing garage operations with academy operations.
**Status:** Planning baseline — implementation has not started.
**Audience:** The agent responsible for building the application from scratch and the owner reviewing progress.
**Source product to replicate:** The current RQ garage-management PWA.

---

## 1. Plain-English understanding of the product

The new product is a subscription SaaS platform for football academies.

- The platform owner operates a central **admin panel**.
- The platform owner creates and manages **academy tenants**.
- Each academy pays the platform owner a **monthly platform subscription**.
- The platform owner manually creates, approves, enables, suspends, renews, and records academy subscriptions, just as the current RQ admin manually manages garage subscriptions and credits.
- Each academy can have multiple **branches** in different locations.
- Each branch has age groups and teams.
- Children/players belong to an academy, normally to a branch, age group, and team.
- Coaches can work at one or more branches and can coach one or more teams.
- Coaches record attendance for training sessions and optionally matches/events.
- Academies collect monthly fees from children/guardians. The platform records those charges, payments, balances, overdue amounts, receipts, and history. This is an academy-level receivables ledger, separate from the platform subscription ledger.
- The platform owner can see the correct tenant-scoped operational and financial summaries without allowing one academy to see another academy's data.

### Important distinction

There are two separate money systems:

1. **Platform subscription billing:** academy → platform owner, manually enabled monthly by the platform owner.
2. **Academy fee collection:** guardian/child → academy, recorded and managed by the academy.

They must never be mixed into one balance, report, or transaction type.

---

## 2. Non-negotiable product requirements

### 2.1 Preserve the current RQ experience

The new application must reproduce the current RQ product's:

- PWA installation and startup behavior;
- login and logout behavior;
- same-account behavior across multiple devices/tabs;
- tenant isolation and server-authoritative security model;
- frontend structure and component organization principles;
- backend structure and route/domain/transaction separation;
- admin-panel layout, navigation style, cards, tables, modals, drawers, buttons, spacing, sizing, responsive behavior, colors, typography, borders, shadows, loading states, empty states, and error states;
- role-based user flows;
- manual subscription workflow;
- auditability and idempotent financial operations.

Do **not** redesign the visual system merely because the domain has changed. Change labels, icons, terminology, and domain-specific fields only where necessary to represent academies, branches, players, coaches, attendance, and fees.

### 2.2 Server authority

The browser may request operations and subscribe to permitted display reads. The browser must not be the authority for:

- authentication or authorization;
- tenant selection or tenant ownership;
- subscription activation or expiry;
- fee/payment balances;
- attendance ownership or correction authority;
- financial totals;
- coach/branch assignment permissions;
- audit records;
- idempotency or duplicate prevention.

All protected mutations must go through the backend API and database transactions.

### 2.3 Tenant isolation

Every academy-owned record must carry a server-derived `academyId` or an equivalent tenant scope. The backend must derive the permitted academy scope from the authenticated principal, not trust a browser-supplied academy ID.

Cross-tenant access must be denied for:

- direct record reads;
- list queries;
- detail pages;
- mutations;
- exports and reports;
- file/media URLs;
- notifications;
- search and autocomplete;
- aggregate counts and dashboards.

Tenant isolation must be tested with at least two synthetic academies and multiple branches per academy.

---

## 3. Recommended technology and architecture

Use the same general topology and engineering principles as the current RQ application unless a documented technical reason requires a change.

```text
React/Vite/Tailwind PWA frontend
        ↓ authenticated HTTPS API calls
Express/Node.js backend
        ↓ server SDK and transactions
Firebase Authentication + Firestore
        ↓ optional storage
Object/file storage for academy logos and documents
```

### 3.1 Frontend structure

Use a modular structure comparable to RQ:

```text
src/
  api/                 HTTP/API boundary
  components/          reusable UI and domain components
  components/admin/    platform-admin views
  components/academy/  academy-owner/admin views
  components/coach/    coach views
  components/player/   player/guardian views if enabled in MVP
  domain/              pure business rules and calculations
  hooks/               session, synchronization, and feature hooks
  services/            typed API/display-read adapters
  types/               shared frontend domain types
  utils/               formatting and safe date helpers
```

Do not create giant page components. Keep page shells, data hooks, domain calculations, and presentation components separate. A component approaching the repository's maintainability threshold must be split before adding more behavior.

### 3.2 Backend structure

```text
server/
  app.ts                         composition and middleware
  auth/                          authentication and session lifecycle
  domain/                        pure decisions and policies
  routes/
    auth.ts
    academies.ts
    branches.ts
    coaches.ts
    players.ts
    teams.ts
    attendance.ts
    academySubscriptions.ts
    playerFees.ts
    payments.ts
    reports.ts
  transactions/                  atomic write workflows
  validation.ts                  input validation
  authorization.ts               role and tenant policies
  idempotency.ts                 duplicate-command protection
  operationTrace.ts              safe audit/observability metadata
  utils.ts                       server helpers only
```

Preferred flow:

```text
HTTP adapter
  → authenticated principal
  → validated typed command
  → tenant/role authorization
  → pure domain decision
  → Firestore transaction
  → ledger/event/idempotency persistence
  → safe response
```

### 3.3 Database approach

Use explicit collections/tables with tenant scope. The agent must document indexes and migration/seed strategy before implementation.

Suggested top-level collections:

- `users`
- `platform_settings`
- `academies`
- `academy_subscriptions`
- `academy_memberships`
- `branches`
- `coaches`
- `coach_branch_assignments`
- `age_groups`
- `teams`
- `players`
- `guardians`
- `player_guardians`
- `training_sessions`
- `attendance_records`
- `fee_plans`
- `player_fee_assignments`
- `fee_charges`
- `academy_payments`
- `financial_ledger_entries`
- `audit_events`
- `idempotency_records`
- `active_sessions`

The exact schema may differ, but the following must remain explicit:

- tenant scope;
- branch scope where applicable;
- immutable IDs;
- status fields and valid transitions;
- created/updated timestamps;
- actor ID and actor role for protected operations;
- source/reference IDs for financial entries;
- idempotency keys for financial and destructive commands.

---

## 4. Roles and permissions

Implement the smallest role model that supports the requested workflows. Do not add roles only because they sound useful.

### 4.1 Platform roles

#### Platform admin

- Create, edit, suspend, and archive academies.
- Create and manually activate monthly academy subscriptions.
- Record subscription payments and renewal dates.
- View all academies and platform-level reports.
- Manage platform settings, subscription price defaults, packages if retained, and operational policies.
- Manage platform users and audit logs.
- Never alter tenant-owned data without an explicit audited action.

#### Platform support/read-only operator (optional, only if needed)

- Read permitted platform data.
- No financial or destructive mutations by default.

### 4.2 Academy roles

#### Academy owner/admin

- Manage only their academy.
- Manage branches, age groups, teams, players, guardians, coaches, fee plans, charges, payments, attendance corrections, and academy reports.
- Cannot change platform subscription status unless the product explicitly permits a request workflow.

#### Branch manager (optional MVP role)

- Manage only assigned branches.
- Can manage assigned teams, players, coaches, sessions, attendance, and branch fee operations according to policy.

#### Coach

- See only assigned academy/branches/teams.
- View roster and record attendance for assigned sessions.
- Cannot edit financial ledgers or platform subscriptions.
- Attendance correction permissions must be explicit and auditable.

#### Finance/operator (optional MVP role)

- Manage academy fee charges and payments for assigned academy/branches.
- Cannot modify rosters, permissions, or platform subscriptions.

#### Guardian/player portal user (post-MVP unless essential)

- View only the linked player's profile, attendance, charges, payments, and notices.
- No access to other children or academy administration.

### 4.3 Permission matrix requirement

Before implementing screens, create a machine-readable permission matrix covering every command and read. The backend tests must prove both allow and deny cases.

---

## 5. Core domain model

### 5.1 Academy

Fields should include:

- legal/display name;
- owner/contact information;
- logo/branding reference if required;
- status: `active`, `suspended`, `archived`, `pending`;
- platform subscription reference;
- timezone and locale;
- created/updated metadata.

An academy's status must be enforced on backend operations. For example, a suspended academy may be blocked from new attendance and fee operations while historical reads remain available according to policy.

### 5.2 Branch

- academy ID;
- branch name;
- address/location;
- contact details;
- operating status;
- optional map coordinates;
- branch manager assignments;
- created/updated metadata.

### 5.3 Coach

- academy ID;
- profile and contact information;
- employment/engagement status;
- certifications or notes only if actually needed;
- branch assignments through a separate relationship;
- team/session assignments through explicit relationships.

A coach may belong to multiple branches. Never store only one `branchId` on the coach if multiple locations are supported.

### 5.4 Age group and team

Use separate concepts:

- **Age group:** e.g. U8, U10, U12, U14.
- **Team:** a concrete training/competition group inside an age group and branch.

A player may move teams over time. Preserve assignment history rather than overwriting history without an event.

### 5.5 Player and guardian

Minimum player fields:

- academy ID;
- branch ID;
- current team/age-group assignment;
- full name;
- date of birth;
- registration date;
- active/inactive status;
- emergency and medical fields only if explicitly approved;
- guardian links.

Do not collect sensitive medical or identity data unless the owner approves the exact fields, retention, and access rules.

### 5.6 Training session

- academy ID;
- branch ID;
- team ID;
- coach ID(s);
- date/time and timezone;
- session type: training, match, event;
- status: scheduled, open, closed, cancelled;
- attendance lock/correction policy;
- audit metadata.

### 5.7 Attendance record

One record per player per session, with:

- player ID;
- session ID;
- status: present, absent, late, excused;
- recorded by;
- recorded at;
- optional note;
- correction history.

Attendance writes must be idempotent and scoped to the coach's assignment and the session's branch/team.

### 5.8 Academy platform subscription

This is the platform-to-academy subscription, not a player's fee.

Minimum fields:

- academy ID;
- monthly price;
- currency;
- status: pending, active, grace, suspended, expired, cancelled;
- start date;
- current period start/end;
- manually recorded payment reference;
- enabled by admin ID;
- renewal/extension history;
- notes and audit events.

MVP requirement: monthly period only. Do not add weekly, annual, automated card charging, coupons, or online payment processing unless separately approved.

### 5.9 Player fee plan, charge, and payment

Keep these as separate concepts:

- **Fee plan:** academy-defined monthly fee policy, optionally branch/team/age-group specific.
- **Player fee assignment:** which fee plan applies to a player and from what date.
- **Fee charge:** an amount owed for a defined month/period.
- **Payment:** money received from a guardian for one or more charges.
- **Allocation:** how a payment is applied to charges.
- **Ledger entry:** immutable accounting-style record of charge, payment, refund, waiver, or adjustment.

Never calculate an account balance only from mutable UI state. The backend must derive it from authoritative ledger/charge/payment records.

---

## 6. Product screens and user flows

The screen names below are intentionally mapped to the existing RQ style. The agent should reuse the same layout patterns and component primitives.

### 6.1 Authentication and session screens

- Login screen with the same visual language as RQ.
- Role-aware routing after login.
- Same account opened from multiple devices with explicit session policy.
- Heartbeat/refresh behavior controlled by the backend.
- Server-authoritative logout and session release.
- Session timeout and revoked-session handling.
- Clear loading, expired-session, offline, and unauthorized states.

### 6.2 Platform admin panel

Retain the current RQ admin-panel structure and adapt labels:

1. Admin dashboard
   - active academies;
   - pending subscriptions;
   - active/suspended/expired subscriptions;
   - branches and coaches summary;
   - player count;
   - platform subscription revenue summary;
   - recent operational/audit activity.

2. Academy management
   - academy list;
   - create academy;
   - academy details;
   - academy status actions;
   - academy branches;
   - academy users;
   - academy subscription panel.

3. Academy subscription management
   - create monthly subscription;
   - set or select monthly price;
   - manually record payment;
   - activate/renew/extend;
   - suspend/restore;
   - show current period and history;
   - preserve the existing manual-approval flow used for garages.

4. Platform reports
   - subscription status report;
   - monthly platform revenue report;
   - overdue academy subscriptions;
   - audit report;
   - no mixing with academy player-fee revenue.

5. Platform settings
   - configurable default monthly subscription price;
   - currency and timezone policy;
   - session and operational settings only when explicitly needed.

### 6.3 Academy admin panel

- Academy dashboard.
- Branch management.
- Age-group management.
- Team management.
- Coach management and multi-branch assignment.
- Player and guardian management.
- Training-session calendar/list.
- Attendance overview.
- Fee-plan management.
- Monthly charge generation/review.
- Payment recording and allocation.
- Overdue balances.
- Academy reports.
- Academy audit/activity history.

### 6.4 Coach flow

The coach's flow must be short and mobile-friendly:

1. Login.
2. Select assigned branch if more than one.
3. See today's sessions.
4. Open a session.
5. See the correct team roster.
6. Mark present/absent/late/excused.
7. Save attendance.
8. Reopen only if policy allows.
9. Receive clear confirmation and error handling.

The coach must never see players from another academy, branch, or unassigned team.

### 6.5 Future guardian flow

Keep out of MVP unless required for launch:

- guardian login;
- view child profile;
- view monthly charges;
- view payment history and receipts;
- view attendance;
- receive notices.

The data model should support this later without building it prematurely.

---

## 7. Checkpointed implementation plan

Each checkpoint is a controlled deliverable. Do not start the next checkpoint until the current exit gate passes.

### C0 — Product baseline and visual contract

**Goal:** Freeze the source-product behavior that must be reproduced.

**Tasks:**

- Inspect the existing RQ PWA on desktop and mobile widths.
- Inventory login/logout, admin navigation, cards, tables, modals, drawers, forms, toasts, loading states, empty states, error states, colors, spacing, typography, and responsive breakpoints.
- Produce a screen-by-screen visual contract with screenshots or written measurements.
- Identify which labels/icons change from garage domain to academy domain.
- Define MVP/non-MVP scope.
- Confirm currency, timezone, language, and academy subscription pricing assumptions with the owner.

**Exit evidence:**

- `ACADEMY_PRODUCT_DECISIONS.md` completed;
- visual contract completed;
- domain glossary completed;
- no unresolved ambiguity about platform subscription versus academy player fees.

### C1 — Project scaffold and deployment topology

**Goal:** Create the new repository from scratch with the same stable topology.

**Tasks:**

- Create React/Vite/Tailwind PWA frontend.
- Create Express/Node backend.
- Configure Firebase Auth and Firestore boundaries.
- Configure Cloudflare frontend deployment and Railway backend deployment contracts.
- Add npm scripts for test, lint/typecheck, build, maintainability, and CI.
- Add safe environment-variable handling.
- Add PWA manifest, icon, service worker, and offline shell behavior.
- Do not add secrets to files or commits.

**Exit evidence:**

- local frontend and backend start;
- health endpoint works;
- PWA build works;
- deployment manifests are reviewed;
- no production data is accessed.

### C2 — Authentication, roles, tenant scope, and sessions

**Goal:** Establish security before feature work.

**Tasks:**

- Implement authentication.
- Implement platform-admin and academy-scoped principals.
- Implement role and permission policies as pure functions.
- Implement tenant-scope derivation from the authenticated principal.
- Implement multi-device session behavior and timeout policy.
- Implement server-authoritative claim, refresh, release, and revoke.
- Implement rate limiting for login/PIN/password attempts where relevant.
- Add audit events for login, logout, role changes, and session operations.

**Required tests:**

- same user on multiple devices;
- expired session;
- revoked session;
- unauthorized academy access;
- cross-tenant direct ID access;
- cross-tenant list/query access;
- rate-limit behavior across multiple backend instances or a shared store;
- no browser-side protected session writes.

**Exit evidence:** Full auth and tenant isolation tests pass.

### C3 — Database schema and migration/seed discipline

**Goal:** Create the minimum complete domain foundation.

**Tasks:**

- Implement academy, branch, coach, player, guardian, age group, team, and membership schemas.
- Add indexes for all supported list/report queries.
- Define status transitions.
- Define immutable versus mutable fields.
- Create synthetic seed data for at least:
  - two academies;
  - three branches;
  - coaches assigned to multiple branches;
  - multiple age groups and teams;
  - players and guardians;
  - platform admins and academy roles.
- Document rollback and data reset strategy for synthetic environments.

**Exit evidence:** Schema, indexes, seed data, and tenant-scoped repository helpers are reviewed and tested.

### C4 — Academy and branch management

**Goal:** Replace garage creation and management with academy/branch management.

**Tasks:**

- Platform admin creates and manages academies.
- Academy admin manages only their academy.
- Academy can create multiple branches.
- Branch status and archive behavior are defined.
- Preserve existing RQ list, form, modal, validation, and confirmation patterns.
- Add server-side validation and idempotency for create/update operations.

**Exit evidence:** CRUD and authorization tests pass for platform admin, academy admin, branch manager, coach, and cross-tenant denial.

### C5 — Academy subscription lifecycle

**Goal:** Implement manual monthly platform subscriptions.

**Tasks:**

- Create the subscription creation page using the same style as the current RQ subscription page.
- Support monthly period only in MVP.
- Allow configurable platform default monthly price.
- Allow admin to override price per academy when policy permits.
- Record manual payment and reference/note.
- Activate, renew, extend, suspend, restore, expire, and cancel through backend commands.
- Keep subscription status and history auditable.
- Enforce academy subscription status on academy operations according to policy.
- Add idempotency to activation, renewal, and payment commands.

**Required rule:** A browser cannot activate itself by changing a Firestore document.

**Exit evidence:** Subscription lifecycle matrix, financial transaction tests, and UI flow tests pass.

### C6 — Coaches, teams, age groups, and multi-branch assignments

**Goal:** Model the actual football-academy organization.

**Tasks:**

- Create age groups.
- Create teams within branch/age-group scope.
- Create coaches.
- Assign one coach to multiple branches.
- Assign coaches to teams/sessions explicitly.
- Add effective dates and history for assignments where required.
- Make the coach dashboard derive its visibility from server authorization, not client filters.

**Exit evidence:** Multi-branch coach tests pass, including denial of unassigned branch/team data.

### C7 — Players, guardians, and roster management

**Goal:** Create safe player and roster operations.

**Tasks:**

- Create/update/archive players.
- Link guardians.
- Assign players to branches, age groups, and teams.
- Preserve assignment history.
- Validate date of birth and required fields.
- Avoid collecting unapproved sensitive medical/identity data.
- Add duplicate detection rules that do not incorrectly merge different children.

**Exit evidence:** Roster lifecycle and tenant/branch authorization tests pass.

### C8 — Training sessions and attendance

**Goal:** Implement the coach's core daily workflow.

**Tasks:**

- Create scheduled sessions.
- Assign branch, team, and coach.
- Open/close/cancel sessions.
- Record present, absent, late, and excused status.
- Save attendance atomically and idempotently.
- Prevent duplicate attendance rows.
- Define correction window and correction permissions.
- Keep attendance history and actor information.
- Provide mobile-first coach screens that reuse RQ card/button/modal patterns.

**Exit evidence:**

- concurrent attendance writes are safe;
- unauthorized coaches are denied;
- a coach assigned to multiple branches sees the correct branch/session data;
- attendance reports reconcile with raw records.

### C9 — Academy fees, monthly charges, and payments

**Goal:** Implement academy-side recurring child fees without mixing them with platform subscriptions.

**Tasks:**

- Create configurable academy fee plans.
- Assign a fee plan to players.
- Generate or preview monthly charges.
- Record manual payments.
- Allocate payments to charges.
- Support partial payments, overpayments, waivers, refunds, and adjustments only if approved in the MVP policy.
- Show paid, unpaid, partially paid, overdue, and waived states.
- Maintain immutable ledger entries and audit events.
- Add idempotency keys to charge generation and payment recording.
- Prevent a duplicated request from duplicating money.

**Required reports:**

- player balance;
- branch balances;
- monthly expected fees;
- collected fees;
- overdue fees;
- payment history;
- adjustments/refunds;
- academy-only revenue report.

**Exit evidence:** Synthetic financial tests pass with transaction rollback, replay, concurrent payment, and cross-tenant cases.

### C10 — Dashboards and reports

**Goal:** Provide useful summaries without presenting misleading numbers.

**Tasks:**

- Platform admin dashboard for academy subscriptions.
- Academy dashboard for branches, players, attendance, and academy fees.
- Coach dashboard for today's assigned sessions.
- Clearly label date range, timezone, currency, and whether a figure is actual, estimated, outstanding, or collected.
- Never use cumulative all-time data as a current-month figure.
- Keep platform subscription revenue and academy player-fee revenue in separate reports.
- Add export only after access control and synthetic validation are complete.

**Exit evidence:** Report totals are tested against known synthetic ledger fixtures.

### C11 — UI parity and responsive/PWA verification

**Goal:** Prove that the new application looks and behaves like the RQ product.

**Tasks:**

- Compare all migrated screens against the source RQ visual contract.
- Verify card sizes, button sizes, spacing, colors, typography, icons, modal dimensions, table behavior, drawers, and responsive breakpoints.
- Verify Arabic/English layout behavior if bilingual support is retained.
- Verify PWA install/startup/offline shell behavior.
- Verify no unauthorized feature removal or visual redesign.

**Exit evidence:** Manual browser checklist and screenshots reviewed at mobile, tablet, and desktop widths.

### C12 — Security, observability, and operational hardening

**Goal:** Prepare the application for controlled pre-production.

**Tasks:**

- Add correlation IDs and safe operation traces.
- Hash or omit sensitive identifiers from logs.
- Add health/readiness endpoints.
- Add rate limiting for auth and critical financial endpoints.
- Add idempotency conflict handling.
- Verify CORS, security headers, request validation, and error envelopes.
- Verify file/media access is tenant-scoped.
- Review backups, restore procedure, and Firestore indexes.
- Confirm no secrets or real customer data enter tests or logs.

**Exit evidence:** Security tests, observability tests, and deployment smoke tests pass.

### C13 — Full production gate

**Goal:** Declare a release candidate only after all evidence exists.

**Required gates:**

- full test suite passes;
- TypeScript/lint passes;
- production frontend build passes;
- backend build passes;
- maintainability check passes;
- diff/whitespace check passes;
- tenant-isolation matrix passes;
- financial/idempotency matrix passes;
- browser smoke tests pass for every role;
- PWA install/startup test passes;
- Cloudflare → Railway authenticated flow passes;
- Firebase/Auth/Firestore deployment identity is documented;
- backup/restore drill is documented;
- rollback commit and incident owner are documented;
- no unresolved critical or high security issue remains.

### C14 — Controlled pilot and release

**Goal:** Start with a safe pilot rather than immediately accepting broad real usage.

**Tasks:**

- Use a separate staging/pre-production environment where possible.
- Create one or two pilot academies with synthetic or explicitly approved data.
- Verify subscription activation manually.
- Verify coaches across multiple branches.
- Verify attendance and fee collection workflows.
- Verify reports against source records.
- Record defects and rollback triggers.
- Only then onboard additional academies.

---

## 8. Business rules that must be decided before coding

The agent must not silently invent answers to these questions. Record the final answers in `ACADEMY_PRODUCT_DECISIONS.md`.

1. What is the platform's default monthly academy subscription price and currency?
2. Can each academy have a custom monthly price?
3. Does an academy remain read-only when its platform subscription expires, or is access fully blocked?
4. Are platform subscription payments always manual, or will online payments be added later?
5. Does the platform record taxes, invoices, receipts, or only payment notes in MVP?
6. Can a player belong to multiple teams at the same time?
7. Can a player train at multiple branches during the same period?
8. Can a coach record attendance for a session only before it closes?
9. Who can correct attendance after closing, and for how long?
10. Are attendance statuses only present/absent/late/excused?
11. Are player fees identical across an academy, or different by branch/team/age group/player?
12. When is a monthly player charge generated: automatically on a date, manually by an operator, or preview-then-confirm?
13. Are partial payments, refunds, waivers, discounts, and credits required for MVP?
14. Are guardians separate login users in MVP or a later phase?
15. Is Arabic/English parity required at first release?
16. What personal, medical, or emergency information is legally and operationally necessary?
17. What is the retention policy for attendance, financial, and audit records?
18. What is the exact session timeout and multi-device policy?
19. Which roles are truly required for MVP: platform admin, academy admin, branch manager, coach, finance operator, guardian?
20. What are the rollback and support procedures when an academy reports a payment or attendance mistake?

Until these are answered, use synthetic data and mark the affected feature as policy-pending rather than guessing.

---

## 9. Testing strategy

### 9.1 Unit tests

Test pure functions for:

- permission decisions;
- tenant-scope decisions;
- subscription period transitions;
- academy status transitions;
- attendance status transitions;
- fee charge generation;
- payment allocation;
- balance calculation;
- overdue calculation;
- report aggregation;
- timezone/date boundaries;
- idempotency fingerprints.

### 9.2 Integration tests

Test backend routes with an in-memory or isolated synthetic database:

- every role's allowed commands;
- every role's denied commands;
- cross-tenant reads and writes;
- cross-branch access;
- coach multi-branch access;
- concurrent attendance writes;
- concurrent payment writes;
- subscription activation and renewal;
- transaction rollback;
- idempotent replay and changed-payload conflict;
- audit event persistence;
- safe error envelopes.

### 9.3 Frontend tests

Test that the existing RQ interaction patterns remain intact:

- login/logout states;
- loading and error states;
- academy and branch forms;
- subscription creation modal/page;
- coach attendance flow;
- player fee/payment screens;
- responsive navigation and drawers;
- no sensitive fields displayed in unauthorized contexts.

### 9.4 End-to-end smoke matrix

At minimum:

| Role | Flow |
|---|---|
| Platform admin | Login → create academy → create monthly subscription → manually activate → view report |
| Academy admin | Login → create branches → create teams → create coach/player → assign relationships |
| Multi-branch coach | Login → select branch → open assigned session → record attendance → verify other academy/branch is hidden |
| Academy finance/admin | Create fee plan → assign player → generate monthly charge → record partial/full payment → verify balance |
| Unauthorized user | Attempt direct IDs from another academy → every request denied safely |
| Same account/device | Login from two devices → verify documented session policy → logout/revoke → verify server state |

---

## 10. Data and financial safety rules

- Use synthetic data until the owner explicitly approves real pilot data.
- Never print secrets, PINs, tokens, payment details, or sensitive child data in logs.
- Never store raw payment-card data.
- Never let the browser compute or persist authoritative balances.
- Never delete financial history to correct a mistake; use a reversal, adjustment, or correction event according to the approved policy.
- Never mix platform subscription ledgers with academy fee ledgers.
- Every money-changing operation must be atomic, idempotent, auditable, and replay-safe.
- Every report must state its period, timezone, currency, and source.
- Do not change Firebase billing plan, database identity, or production data without explicit owner approval.

---

## 11. Maintainability rules for the build agent

- Read this plan and `AGENTS.md` before changing code.
- Keep one source of truth for each business rule.
- Use pure domain functions for calculations and decisions.
- Keep Firestore access in backend adapters/transactions.
- Keep frontend services typed and thin.
- Do not duplicate financial formulas in multiple components.
- Do not create a parallel backend or a second authority for the same record.
- Split components before they become difficult to review.
- Add tests with every new command, policy, and financial rule.
- Preserve UI structure unless an explicit product decision changes it.
- Commit in small checkpoint-sized changes with clear rollback points.
- Do not move to the next checkpoint while the current checkpoint has failing tests or unresolved authorization ambiguity.

---

## 12. Suggested first implementation sequence

The build agent should begin in this exact order:

1. Read this plan and produce `ACADEMY_PRODUCT_DECISIONS.md`.
2. Inspect the current RQ application and produce the visual/source-product contract.
3. Scaffold the new repository and deployment topology.
4. Implement authentication, role policies, tenant scope, and session tests before domain screens.
5. Implement academy/branch schema and platform-admin academy creation.
6. Implement manual monthly academy subscriptions.
7. Implement coaches, multi-branch assignments, teams, age groups, and players.
8. Implement attendance.
9. Implement academy fee plans, monthly charges, payments, and balances.
10. Implement reports and dashboards.
11. Run UI parity review.
12. Run the full production gate.
13. Run a controlled synthetic pilot.

The agent must return a checkpoint report after each stage containing:

- checkpoint completed;
- files changed;
- database/schema changes;
- tests added and results;
- security/tenant-isolation evidence;
- known risks;
- rollback commit;
- one next bounded task.

---

## 13. Definition of success

The project is successful when an academy owner can use the same familiar, stable RQ-style experience to manage branches, teams, coaches, players, attendance, and monthly fees, while the platform owner can manually manage monthly academy subscriptions from a central admin panel.

It must be:

- visually faithful to the current RQ product;
- mobile-friendly and installable as a PWA;
- safe for multiple academies;
- safe for coaches working across multiple branches;
- server-authoritative for every protected operation;
- financially separated between platform subscriptions and academy fees;
- auditable and idempotent;
- maintainable by future agents;
- validated with automated tests and controlled browser smoke tests before real academy onboarding.

> The first release should be smaller and safer than the full vision. Build the platform foundation, academy/branch/coach/player model, attendance, manual monthly subscriptions, and academy fee ledger first. Defer guardian self-service, online payments, advanced analytics, marketing, and nonessential automation until the core workflows are proven.
