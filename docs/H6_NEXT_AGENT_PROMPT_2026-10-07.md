# Continuation Prompt — RQ Unified Hono Migration, Checkpoint H6

**Updated 2026-10-07. This prompt supersedes the earlier brief’s claim that all implementation and automated security tests are complete.** Read the repository’s latest `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` before acting; its final section, **“TOKEN-ENDING SUCCESSION HANDOFF — 2026-10-07,”** is authoritative and contains findings that may not yet be reflected in the H6 report.

## Mission

Continue Checkpoint H6: perform evidence-based role acceptance and security testing for the Unified Hono migration, using **synthetic pre-production data only**. Complete the remaining safe Delegate Alpha/Beta and restricted-role checks, investigate the Supervisor permission findings below, and update the H6 evidence/report/plan. Do not begin H7, H8, or H9; they remain pending until H6 is complete or explicitly accepted.

## Start by establishing the current state

- Repository: `tarekhamada875-droid/RQ-`
- Working directory in the prior Sandbox: `/home/ubuntu/rq-repo`
- Authorized working branch: `migration/unified-hono`
- Verified handoff/evidence base commit: `219fdc4b9ffa63eab5bcc01e0731073dad4a7b13` (`docs: strengthen H6 Supervisor security handoff`). This prompt may be included in a later documentation-only branch commit; verify the actual latest `HEAD` and workflow runs when receiving it.

The Production Gate and H5 Preview Worker both succeeded for that commit:

- Production Gate: https://github.com/tarekhamada875-droid/RQ-/actions/runs/37565905895
- H5 Preview Worker: https://github.com/tarekhamada875-droid/RQ-/actions/runs/37565905920

The H5 workflow redeployed the **isolated preview Worker**; it did not deploy production. The recorded production version remains `1.0.0-production`; preview is `1.0.0-h5-preview`. Verify the actual branch, worktree, current commit, and preview health/version in your own environment. **Do not assume this prompt transfers a browser session, credentials, environment, or uncommitted files.**

Before editing, read the project and migration material, including:

- `README.md`, `RQ_PROJECT_KNOWLEDGE_BASE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `BRANCHING_AND_RELEASES.md`, and `MAINTAINABILITY_HANDOFF.md` (confirm each exists before relying on it).
- `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`
- `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` — read the newest dated section at the end first.
- `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md` (if present)
- `docs/H6_ROLE_ACCEPTANCE_2026-10-05.md`
- `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md`

Also inspect the relevant Worker, authorization policy, frontend service/query, and Firestore-rules code before concluding anything. Compare `main` with `migration/unified-hono` only as needed; **never modify `main`**.

## Verified state and important distinctions

- H6 has browser login/session lifecycle evidence for Admin, Delegate, Garage Owner, Staff, and Supervisor. The full H6 feature matrix remains incomplete.
- A newer synthetic Delegate test account showed **zero garages**. This is separate from the older QA Alpha/Beta Delegate fixture. Do not combine those results or claim Alpha visibility for the zero-garage account.
- The previous Supervisor browser request to `GET /api/garages` returned **200**; its response body was discarded. Source review then showed the Worker list path is unfiltered for Supervisor and returns raw garage documents. Firestore rules/client subscriptions also permit broad Supervisor reads. In contrast, Hono single-garage and dashboard-summary routes deny Supervisor. This is an **open cross-surface scope inconsistency**, not a cross-garage-isolation pass. No live record fields were inspected.
- The H6 plan says Supervisor may perform monitoring/recharge workflows but forbids mutation and financial actions. A subsequent source review found direct Firestore rules include `isSupervisor()` in write permissions for delegates (`firestore.rules` around lines 632–638), subscribers (684–693), and daily counts (around 710–725). These appear inconsistent with the stated H6 mutation prohibition. The Hono/Express counterparts have not yet been fully audited. **No live write was attempted and no Firestore rules were changed or deployed.**
- The source-level rule finding is captured in the succession handoff, but has not yet been added to the H6 evidence, integrated report, or checkpoint plan. Reconcile and document it after safe validation.
- The focused local Worker checks passed **2 files / 27 tests**: `src/__tests__/workerAuthorizationMatrix.test.ts` and `src/__tests__/cloudflareWorkerGarageRoutes.test.ts`. The earlier full suite passed **102 files / 577 tests** before the latest source-only review. Existing route tests do not assert Supervisor list scope.
- Java 21 was present in the prior environment, but the Firebase CLI and `@firebase/rules-unit-testing` were not installed. `authenticationSecurityRebuild.test.ts` is a simulated rules evaluator, **not** an emulator test. Verify tooling afresh; do not call simulated coverage emulator validation.

## Required boundaries

1. Use synthetic pre-production data only. Do not use real-user records.
2. Do not make payments, transfers, wallet top-ups, recharge/subscription purchases, or financial writes. Do not use production data or deploy production.
3. Do not deploy Firestore rules to any live Firebase project as part of testing.
4. Never test a denied mutation by writing to live Firestore. Prefer an isolated local Firestore Rules Emulator and mocked Hono/Express tests.
5. Do not guess a PIN or rely on a credential/browser state from another session. Use only an authorized synthetic credential available in the current session; if unavailable, follow the supported Admin UI flow for a temporary synthetic fixture only when safe and authorized. Do not record PINs, tokens, or other secrets in reports.
6. Preserve the UI freeze. The only approved UI exception is the visible Delegate sign-in entry, PIN-only Delegate form, and its auth wiring. Do not redesign the UI or change unrelated business behavior.
7. Work and push only on `migration/unified-hono`. Do not merge to `main`. Keep H7–H9 pending.
8. If the owner says exactly **“tokens ending”**, immediately stop implementation, update `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` with exact branch/commit/files/tests/deployment/findings/next commands, commit and push the documentation safely to `migration/unified-hono`, and tell the next agent to repeat this protocol.

## Next actions

1. Verify repository status, branch, commit, remote state, and the H5 preview’s health/version without touching production. Confirm the handoff commit is present and inspect any current worktree changes.
2. Audit the Worker and transitional Express authorization for the delegate, subscriber, and daily-count mutations above. Compare each with the written Supervisor policy and the UI’s read-only Supervisor experience. Determine which write capabilities, if any, are intentionally permitted; do not infer policy solely from current rules.
3. Validate Firestore permissions locally. Set up/use a local emulator if feasible; never use a live write as a permission probe. Add real rules tests for Supervisor read/write cases if emulator tooling is available. Test Worker/Express endpoints separately. If the exact product boundary remains unclear, preserve the current behavior and record the unresolved decision rather than silently widening or narrowing permissions.
4. Investigate and test the Supervisor global garage-list versus item/detail mismatch without retaining record contents. If fields might include credentials or sensitive legacy data, test redaction using synthetic local fixtures.
5. Continue the approved Delegate acceptance: verify QA Garage Alpha visibility, QA Garage Beta absence, and safe direct-URL/read-only denial checks. Use only an authorized synthetic Delegate fixture. If the current fixture has zero garages, do not infer assignment; create or assign a synthetic fixture through a supported, non-financial route only if needed and record exactly what was changed.
6. Perform only safe browser-level forbidden-action tests. Never mark a scenario PASS without observable evidence. Record only evidence-supported PASS, N/A, OPEN, or NOT TESTED/BLOCKED outcomes.
7. Update `docs/H6_ROLE_ACCEPTANCE_2026-10-05.md`, `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md`, and `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`; then run the relevant tests, `git diff --check`, and the required branch workflows. Commit/push only to the migration branch, and confirm no production deployment occurred.

**Do not mark H6 complete** while the Supervisor permission mismatch or any required role-acceptance cells remain open. Keep the work traceable and the handoff self-contained so a successor does not need this conversation’s hidden history.
