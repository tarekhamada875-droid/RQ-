# H6 Controlled Acceptance Runbook

**Status:** H6 was closed for scope by explicit owner residual-risk acceptance on 2026-10-09; unresolved cells remain labeled OPEN/BLOCKED or OPEN/UNVERIFIED. H7 is now in progress.
**Scope:** `migration/unified-hono` and the isolated `rq-hono-preview` Worker only.
**Purpose:** Replace exploratory clicking and ambiguous evidence with a repeatable, risk-controlled acceptance run.

## Assurance limit and authority

No test plan, CI run, or acceptance cycle can prove an application is **100% bug-free**. This process reduces risk by requiring reproducible evidence, defined authorization boundaries, explicit blockers, and a separate cutover decision. Do not promise zero defects or describe the application as risk-free.

This runbook controls **how current H6 work is executed**. `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md` remains the coverage catalog and feature-by-role matrix. If an older example conflicts with this runbook, current owner instructions, or the synthetic-only boundary, do not perform that action; mark it OPEN/BLOCKED and document why.

For a concise operator sequence for the currently unresolved role cases, see [`H6_MANUAL_REMAINING_ROLES_RUNBOOK.md`](H6_MANUAL_REMAINING_ROLES_RUNBOOK.md). It is a field checklist only and does not supersede this runbook.

Never use production, `main`, real-user data, real payments, live financial writes, or a live Firestore Rules deployment for H6. Do not redesign the UI. Do not write secrets, PINs, bearer/session tokens, or sensitive payloads into reports, screenshots, source, or test fixtures.

## Result vocabulary

| Status | Meaning |
|---|---|
| **PASS** | The visible user outcome and relevant technical, authorization, scope, and persistence evidence all match the expected behavior. |
| **FAIL** | Reproducible behavior contradicts a defined expectation. Record severity and stop if the defect could affect data, authorization, or money. |
| **BLOCKED** | A safe precondition, deployment, identity, or evidence source is unavailable. This is not a pass. |
| **OPEN/UNVERIFIED** | Evidence is incomplete or an outcome is ambiguous, including a timed-out mutation whose backend result is unknown. |
| **NOT RUN** | The case has not been attempted. |
| **N/A** | The role is intentionally not permitted to perform the action; record the policy basis and verify a safe denial. |

A visible success toast, HTTP 200 alone, or passing unit test alone does not make a browser acceptance case PASS. Avoid replacing an older result with a stronger claim than its evidence supports.

## Phase 0 — Establish the exact test target

Before browser work, verify the current branch, clean worktree, exact commit SHA, and relevant workflow results. Run the focused and full local gates required by the checkpoint plan. Do not run deployment or release commands without first checking their targets.

For H6, record both:

- an **isolated Cloudflare Pages preview URL** serving the candidate frontend commit; and
- the **`rq-hono-preview` Worker URL and deployed version** serving that same candidate.

Use read-only `/api/health` and `/api/version` checks against the preview Worker. Confirm the frontend's API requests actually reach that Worker, not production or an unintended default origin. If the Pages preview, commit pairing, or API target cannot be verified, stop and mark the Pages-to-Worker acceptance gate **BLOCKED**. A temporary local Vite proxy may diagnose a defect, but it does **not** substitute for the checkpoint's Pages-to-Worker acceptance evidence.

The repository's `npm run release:smoke` is environment-driven and can target any URL supplied to it. For H6, set `SMOKE_BASE_URL` to the preview Worker, `SMOKE_FRONTEND_URL` to the verified Pages preview, and `SMOKE_EXPECTED_VERSION` to the preview's expected version. Never set these to production as part of H6. If a verified Pages preview is unavailable, do not report the smoke as an H6 pass.

Record the run date, commit, Pages URL, Worker URL/version, browser/device, test aliases, and pre-existing failures. Never print environment values or enable shell tracing around secrets.

## Existing evidence — reuse, do not restart

Before testing, read `docs/H6_ROLE_ACCEPTANCE_2026-10-05.md` for chronological browser observations and `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md` for the reconciled feature-by-role statuses. Read the exact-commit workflow evidence linked there and in the current checkpoint plan. Existing results are scoped to their recorded commit, fixture, browser, and frontend path; do not silently broaden a PASS.

Do **not** rebuild the RQ application or repeat the entire role matrix from scratch. Reuse valid prior PASS evidence, then work the OPEN/BLOCKED/NOT RUN cells and any regression cases invalidated by a relevant source or deployment change. The previously passed H5/Production Gate workflows validate the code/build gates for their exact head; they do not close H6 role acceptance. Previous local Vite-proxy browser results may support their recorded behaviors, but they do not close the missing Pages-to-Worker path. If prior evidence is incomplete, first use safe read-only reconciliation; never recreate a write merely to regenerate a missing log or screenshot.

## Phase 1 — Resolve policy and test-data preconditions

Create a small, run-specific synthetic fixture manifest before any mutation. Use a unique label such as `H6-<date>-<run-id>`. Record only safe aliases, role, intended scope, purpose, creation path, and cleanup state—not credentials or sensitive IDs. Inspect for an existing matching fixture before creating another. Use the supported UI/API path that the case is intended to accept.

**Supervisor retirement:** The owner has decided this role is no longer wanted. Do not create, log in as, or manually test a Supervisor identity; do not delete or alter existing Supervisor account/session records. The migration branch now denies legacy Supervisor authentication and protected access, retires management/PIN-update routes, removes Supervisor controls from the Delegates-focused People view, and denies client access in Firestore Rules. Local regression coverage includes Worker/Express PIN/session behavior and the Firestore Rules Emulator. These local results do not prove the candidate preview deployment is updated; verify exact-head workflows and Pages/Worker identity before acceptance. Treat older Supervisor browser evidence as historical; current active-role scope is **N/A — role retired**, with denial regressions required.

**Staff trial context:** Use only an already active synthetic free-trial context for non-financial operational checks. Do not top up a balance, purchase a package, or manufacture a paid state. The latest handoff reconciles the earlier delayed create: read-only inspection found exactly one synthetic `Mobile QA Staff` row in `QA Garage Beta`, with its PIN masked. Treat Staff transport as PARTIAL and operational access as OPEN/BLOCKED; no usable Staff credential or active-trial context is confirmed. Do not replay creation, reset the PIN, delete the row, or change the Staff-create timeout. Continue only if an owner-authorized credential and a verified active-trial context are already available.

**Financial scope:** Recharge approval, wallet top-up, transfer/settlement, payment, and package/subscription purchase or renewal remain OPEN/BLOCKED unless a dedicated isolated payment/ledger sandbox is confirmed and explicitly authorized. Synthetic naming alone does not make a financial write safe. Otherwise, do not perform these flows and do not mark them PASS.

## Phase 2 — Prepare repeatable browser coverage

An opt-in Playwright smoke is now available at `playwright.preview.config.ts` with its single read-only test in `e2e/preview/readonly-smoke.spec.ts`. It checks the generic login shell and credential-free `GET /api/health` and `/api/version` calls to the isolated Worker from the exact stable Pages preview. It uses a fresh context, one worker, zero retries, no screenshots/traces, and is not wired into default CI. This is **not** authenticated role-acceptance automation and closes no H6 role or mutation cell.

The requirements below remain mandatory before adding broader authenticated or mutating H6 automation; the minimal smoke intentionally does not implement those workflows. Any expansion requires a separately reviewed, opt-in change with a validated isolated-preview target. The harness must:

- require an explicit non-production base URL and fail closed for production hosts;
- receive test credentials only through the authorized runtime secret mechanism or a current authorized session, never committed files or screenshots;
- use a fresh browser context per role and avoid checked-in storage-state files;
- prevent parallel execution of state-mutating scenarios and disable blind automatic retries;
- capture sanitized route, status, duration, correlation/operation ID where safe, console errors, and screenshot evidence without request bodies, auth headers, PINs, tokens, or personal/financial data;
- stop when a mutation has an ambiguous outcome rather than replaying it.

Use the existing opt-in Playwright smoke only for its documented login-shell and read-only health/version scope. Use a supported browser session for visual or human-only role checks. A manual browser test is valid evidence when properly captured, but it is not an automated E2E result. Any broader role automation needs separate review; Vitest/API/rules tests complement browser acceptance and do not replace it.

## Phase 3 — Execute one role and one scenario at a time

Use the full feature-by-role matrix in the integrated acceptance task. Start a clean browser context for each role. Verify the server-derived role and scope after login; do not infer them from a screen label. For each case, connect the human action to the actual preview API result, authorization/scope decision, persistence after refresh where applicable, and any safe audit/idempotency evidence.

Exercise desktop and a defined mobile viewport (390×844 portrait with touch emulation) separately. Record device/viewport details. Verify popup actions on both mobile and desktop. Test allowed behavior positively and denied behavior safely; never send a potentially successful destructive or financial mutation merely to see whether it is denied. For unsafe denial cases, use local emulator, mocked Hono/Express tests, or a non-mutating read route.

Keep test mutations serialized. After any timeout or network failure on a write, capture the safe correlation ID and timing/status metadata, inspect only the relevant read-only UI/list or authorized preview trace, and stop. Do not blindly retry, change the payload, or infer failure from a spinner. If the outcome remains unclear, record OPEN/UNVERIFIED.

The minimum role-oriented focus for the current run is:

| Role/area | Controlled acceptance focus | Current caution |
|---|---|---|
| Admin | Login/session, safe dashboard reads, supported synthetic management, and session cleanup. | Financial and security-setting writes are not part of this run. |
| Delegate | Restricted dashboard, assigned-scope reads, and safe denial of out-of-scope/admin actions. | Keep the zero-garage fixture distinct from Alpha/Beta fixtures. |
| Garage Owner | Desktop reload persistence, listener delivery after one harmless synthetic change, vehicle/subscriber workflows, mobile navigation and popup behavior. | Listener delivery and portions of mobile coverage remain OPEN; avoid payment-related actions. |
| Staff | Login in the active free-trial context, allowed vehicle/subscriber operations, and forbidden admin/cross-garage actions. | No trial-context Staff identity is currently confirmed; reconcile the previous create attempt first. No balance top-up or purchase. |
| Supervisor (retired) | No manual role acceptance. Verify only the non-destructive denial regressions for legacy PINs, sessions, APIs, and rules. | Preserve existing account/session records; never create, clean up, or deploy live rules for this role. |

For listener acceptance, generate one harmless, supported synthetic change and verify the same event reaches the active listener; successful connection/status codes without an event do not pass delivery. For cleanup, use the supported UI and verify both the operation's completion evidence and fresh-list absence. If deletion is asynchronous, inspect only a documented read-only job status; absence from a list alone is partial evidence.

## Phase 4 — Capture evidence and manage failures

For every scenario, record:

```text
Run ID / date:
Commit and preview deployment/version:
Role alias and fixture alias:
Scenario ID:
Viewport/browser:
Precondition:
Human action and visible result:
Expected route/result:
Observed route/status/duration:
Safe authorization/scope evidence:
Persistence/listener/audit/idempotency evidence:
Console/diagnostic result (sanitized):
Cleanup result:
Status and severity:
Evidence path/reference:
```

Use the repository's correlation/operation trace conventions and Cloudflare Worker preview observability. Search only by approved correlation/operation ID and report route, status, safe error code, outcome, and duration. Never inspect or copy raw authorization headers, request bodies, PINs, phone numbers, plates, payment data, raw session IDs, or unrelated records. If the needed read-only evidence source is not available, mark the case BLOCKED rather than adding an ad hoc logging endpoint or querying production.

On a reproducible defect, stop the affected workflow, preserve safe evidence, and create a focused issue/fix task. Do not mix product-code changes with the acceptance run. A fix must be tested on the migration branch and exact preview commit before rerunning only the affected scenario and relevant regression set.

## Phase 5 — Cleanup and closeout

Use only supported application flows to release sessions and remove fixtures created by this run. Confirm the deletion response or documented job completion, then verify the named fixture is absent after a fresh UI/list read. Do not use direct Firestore mutation or delete unrelated records. If cleanup completion cannot be confirmed, retain the blocker and provide the safe next check.

At closeout, reconcile every matrix cell as PASS, FAIL, BLOCKED, OPEN/UNVERIFIED, NOT RUN, or N/A with a reason. Record the exact branch/head, Pages/Worker deployment identity, workflow status, tests run, fixtures created/removed, unresolved risks, and next bounded action. Remove temporary local proxies/configuration and sanitized browser artifacts when no longer needed.

## H6 exit and H7 transition

H6 can be marked complete only when the required role workflows have evidence through the verified Cloudflare Pages preview to the isolated preview Worker; no role is silently downgraded; required desktop/mobile popup behavior passes; authorization/scope and persistence checks are complete; cleanup is confirmed; no UI/UX redesign was introduced; and every required matrix cell is resolved. Any explicitly excluded cell requires a written owner scope/risk decision and must remain labeled untested—not tested or passed.

The current H6 blockers are: Staff operational access in an active-trial context; Owner real-time listener delivery and remaining cleanup evidence; fresh verified Pages-to-Worker role-acceptance evidence for the current candidate; and financial workflows without a dedicated safe sandbox. Supervisor is retired by owner decision and is **N/A for manual role acceptance**; its local denial regressions must remain green, but prior Supervisor browser PASS evidence is historical and does not imply continued access. The minimal Playwright smoke is not role E2E and closes none of these blockers. They do not become PASS through documentation updates or unit tests.

On 2026-10-09 the owner explicitly accepted the documented H6 residual risks and instructed that H6 be considered complete for scope purposes so H7 could begin. Staff operational access, Owner listener/cleanup evidence, and financial workflows remain unresolved or intentionally blocked; they are accepted residual risks, not PASS results. H7 is a separate GO/HOLD decision. It requires the plan's full tests, lint, production build, CI, maintainability, release smoke, preview role acceptance, route parity, Firebase authentication/session coverage, no unexplained user-visible warnings, and a rehearsed rollback. If any H7 condition remains blocked, the result is **HOLD/NO-GO**: keep production and `main` unchanged. H6/H7 evidence can reduce risk; neither can certify “100% bug-free.”
