# J.A.R.V.I.S. Mission Control — Production Readiness Roadmap

> **J.A.R.V.I.S.** = Just A Reliable, Verified, Integrated System.  
> A phased, evidence-based plan to make RQ- reliable for real business use. This is a planning and progress-tracking document, not a claim that the app is production-ready.

## Ground rules

- **Audit first, fix second.** No implementation fixes until Phase 0 is complete and its findings are organized.
- Work in small, focused changes. Prefer one independently testable concern per pull request.
- Do not start the next fix until the current change passes its required checks and its deployment status is verified.
- Never call a change production-complete based on a green test alone. Confirm the correct commit and live deployment when applicable.
- Record evidence, outcomes, and remaining risks here after each phase and meaningful change.
- Keep the interface/language cleanup for the final phase, as requested. The app should ultimately be Arabic-only; communicate with the project owner in English.
- Protect production data. Use synthetic/test data for destructive or recovery tests. Do not delete branches or data without checking whether they are still needed.

## Overall status

- **Current phase:** Phase 0 — Complete the full read-only repository audit
- **Overall status:** In progress
- **Fixes started under this roadmap:** No
- **Last reviewed base:** `main` at `525519eb0b6e14c59f321aa66d853d7642c3dc04` (re-check the current main SHA before each phase)
- **Last update:** 2026-10-24

## Phase 0 — Full repository audit (NO FIXES)

**Goal:** Understand the whole project before changing code.

### Checklist
- [x] Inventory repository structure, key configuration, core documentation, CI workflows, and release/deployment workflows.
- [x] Review the main frontend state/session hooks, Admin flows, and key garage/delegate views.
- [x] Review core Worker/API routes, validation, transaction/session helpers, financial logic, and Firestore security rules.
- [x] Review existing tests and identify important gaps in coverage.
- [x] Inspect recent pull-request, branch, and deployment status.
- [ ] Complete a systematic file-by-file review of all remaining source modules, components, services, utilities, tests, configuration, scripts, and workflows.
- [ ] Cross-check frontend-to-backend request/response contracts and role permissions across all business workflows.
- [ ] Classify every finding as confirmed defect, security/data risk, test/observability gap, maintainability issue, already fixed, or needs more evidence.
- [ ] Check each finding against current `main` and the relevant tests; remove stale/duplicate findings.
- [ ] Publish a plain-English audit summary and prioritized fix list before starting Phase 1.

### Initial findings to verify during the full audit
These are preliminary findings from the initial review; re-check them before treating them as final:
- Delegate creation appears to have a frontend/backend PIN-length mismatch (8 digits in the Admin form versus 5 digits in backend validation).
- Firestore rules appear to permit direct client writes to legacy billing request collections even though related Worker routes are retired.
- Financial report date boundaries appear to use UTC while business-day rules use Cairo time.
- Admin request/search results and subscriber-expiry counts appear to rely on paginated data in ways that may hide records or miscount.
- Session claim/release concurrency, transaction retry behavior, and direct Admin writes to system configuration need targeted verification.

**Exit criteria:** The audit covers the entire repository; findings are evidence-backed, prioritized, deduplicated, and explained in plain English. No fix begins before this gate is met.

## Phase 1 — Critical correctness and security

**Goal:** Fix issues that could block users, expose data, bypass intended controls, or corrupt business records.

Expected areas (final order comes from Phase 0):
- Login/PIN and frontend/backend contract mismatches.
- Firestore write permissions and retired billing paths.
- Role authorization and ownership boundaries.
- Session claim/release races and stale cross-account data.
- Financial transaction integrity, idempotency, and safe concurrency.

**Exit criteria:** Each confirmed critical/high-risk issue has a focused fix, regression coverage, required CI/Production Gate checks pass, and deployment is verified when the change is deployed.

## Phase 2 — Business rules and data accuracy

**Goal:** Ensure business calculations and records match the actual rules of the business.

Review and verify:
- Cairo-local date/time boundaries, daily quotas, expiry dates, and reporting periods.
- Vehicle entry/exit, subscriber lifecycle, garage/delegate limits, credit grants, refunds, and financial summaries.
- Pagination, search completeness, totals, and empty/error states.
- Duplicate submissions, retries, partial failures, and transaction consistency.

**Exit criteria:** Important business calculations have boundary tests and end-to-end evidence; no known high-impact discrepancy remains unaddressed.

## Phase 3 — Complete role-based workflows and user experience

**Goal:** Make every role's normal and failure paths reliable.

Test complete journeys for:
- Admin: garages, people, requests, settings, reports, and detail screens.
- Garage owner: vehicles, subscribers, transactions, staff, reports, and package/subscription status.
- Staff and delegates: login/session handling and only the actions they are allowed to perform.
- Shared behavior: loading, empty results, errors, offline/transient failures, retries, logout, and switching accounts.

**Exit criteria:** A documented browser/manual test matrix is completed for each role, including negative permission tests and regression tests for defects found.

## Phase 4 — Code quality, performance, and maintainability

**Goal:** Remove genuine dead weight and reduce avoidable complexity without risky cosmetic rewrites.

Review:
- Dead/unreferenced code, duplicate logic, unused dependencies, abandoned files, and temporary stubs.
- Error handling, logging, observability, accessibility, performance, pagination, and unnecessary network work.
- Type safety, lint/build/test consistency, dependency risk checks, and documentation accuracy.
- Branches and obsolete artifacts only after confirming they are merged, unused, and safe to remove.

**Exit criteria:** Each cleanup has evidence that behavior is preserved; required static checks, tests, and build pass. Avoid broad rewrites without a demonstrated benefit.

## Phase 5 — Production readiness and recovery verification

**Goal:** Prove the approved application version is actually ready to operate.

Checklist:
- [ ] Confirm the live frontend and Worker correspond to the intended release/commit.
- [ ] Run the Production Gate and required build, unit, integration, security-rules, and release-smoke checks.
- [ ] Exercise key workflows in a production-like environment with safe test data.
- [ ] Verify Firestore rules/indexes and production configuration without exposing secrets.
- [ ] Confirm backups and perform a safe restore/recovery rehearsal.
- [ ] Verify monitoring, error alerts, provider quotas, rate limits, and cost controls.
- [ ] Record remaining known risks, rollback procedure, and release decision.

**Exit criteria:** Release evidence is recorded, critical/high issues are resolved or explicitly accepted by the owner, and rollback/recovery is understood. Passing CI alone is not a release approval.

## Phase 6 — Arabic-only interface (FINAL PHASE)

**Goal:** Complete the language and UI/UX sweep after the higher-priority work.

Checklist:
- [ ] Remove English UI text and language-switching paths that conflict with the Arabic-only requirement.
- [ ] Verify Arabic labels, validation messages, dialogs, notifications, dates, numbers, and empty/error states.
- [ ] Check right-to-left layout, alignment, overflow, tables, forms, mobile layouts, and accessibility.
- [ ] Search for remaining user-visible English strings and verify each result.
- [ ] Run the full regression suite and review all major role-based screens.

**Exit criteria:** The user-facing app is consistently Arabic-only and right-to-left, with no regression to core business behavior.

## Change log

| Date | Phase | Update | Evidence / outcome |
|---|---|---|---|
| 2026-10-24 | Phase 0 | Created roadmap. Initial read-only review found candidate issues; the full file-by-file audit is still required. No fixes started. | Current repository reviewed through GitHub; this document tracks remaining audit work. |

## How to update this file

After each meaningful audit milestone or completed fix:
1. Update the phase status and checkboxes based on evidence, not assumptions.
2. Add the relevant PR, commit, test/workflow run, and deployment link where applicable.
3. Record unresolved issues and why they remain open.
4. Do not mark a phase complete until its exit criteria are met.
