# Continuation Prompt — RQ Unified Hono Migration, H6

**Updated:** 2026-10-08. This prompt directs the next agent to the controlled process; it supersedes earlier ad hoc click-through instructions. No prior browser session, credential, secret, local proxy, or filesystem state transfers. Read the current `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` before acting.

## Mission

Close Checkpoint H6 through reproducible, evidence-based role and security acceptance using synthetic pre-production data only. Follow [`H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`](H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md) as the execution authority and `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md` as the coverage catalog/matrix. H7 remains HOLD until all required H6 gates are resolved.

No process can guarantee “100% bug-free.” Reduce risk, record residual risks honestly, and do not call a blocked or untested scenario a pass.

Do not rebuild the RQ application or repeat the whole matrix from scratch. First reuse the scoped evidence in `docs/H6_ROLE_ACCEPTANCE_2026-10-05.md` and `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md`; rerun only unresolved cases and regressions invalidated by a relevant code, fixture, or deployment change. A prior PASS remains limited to its recorded test target and method.

## Establish actual state first

Repository: `tarekhamada875-droid/RQ-`. Authorized working branch: `migration/unified-hono`. Immediately before this documentation synchronization, the last workflow-verified head was `721932ee36b40e38cc0d79a8ff385668a01cf447`; its H5 Preview Worker [run 37732250392](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37732250392) and Production Gate [run 37732250425](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37732250425) both passed. The preceding source/test commit is `30cccf48d71dcf2e7890c09f3f8bfd3aed7c79a6`, which sets only the `/api/garages/delete` client timeout to 30 seconds and tests it. This synchronization may produce a later docs-only head; verify branch, local/remote HEAD, worktree, workflow status, and preview health/version afresh.

The isolated Worker preview is `https://rq-hono-preview.tarekhamada875.workers.dev`. H6 browser evidence so far used a temporary local Vite proxy; it is diagnostic evidence only, not proof of the required Cloudflare Pages-preview-to-Worker path. No verified Pages preview URL is currently recorded. If the exact preview pairing cannot be established without production access, mark that gate BLOCKED and stop rather than using production or a local proxy as a substitute.

## Current H6 disposition

- **Staff operational access: OPEN/BLOCKED.** A single Admin Staff-create attempt in a synthetic active two-day free-trial context yielded no observed success response, Staff row, or usable credential within the existing client wait. No retry was made, no Staff login/operational test followed, and the owner directed that the Staff-create timeout remain unchanged. First reconcile the prior request using read-only UI/list evidence and safe preview correlation/timing metadata; never blindly resubmit it.
- **Supervisor global-versus-assigned garage-read policy: OPEN.** Obtain the owner's explicit product boundary before any permission-code or Firestore-rules change. Do not guess or test with live writes.
- **Garage Owner listener delivery and cleanup: OPEN/PARTIAL.** One desktop reload passed; no data-change event was used to verify listener delivery. Deletion/list evidence has limits recorded in the reports; use supported flows and do not claim completion without completion evidence.
- **Financial workflows: OPEN/BLOCKED — intentionally untested.** No payment, recharge approval, wallet top-up, transfer/settlement, or package/subscription purchase/renewal. Proceed only with a confirmed isolated financial sandbox and explicit authorization; otherwise keep blocked.
- **Automation:** the current package has no Playwright dependency/configuration or H6 E2E script. Do not claim Playwright coverage exists. Add an opt-in, environment-driven E2E harness as a separate test-infrastructure task before calling subsequent browser coverage automated.

## Required execution order

1. Read `RQ_PROJECT_KNOWLEDGE_BASE.md`, `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`, `AGENTS.md`, `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`, `docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`, `docs/H6_ROLE_ACCEPTANCE_2026-10-05.md`, `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md`, the integrated acceptance coverage catalog, and the current observability runbook. Treat the runbook and current handoff as controlling; use the two reports as existing evidence.
2. Verify the non-production Pages preview and `rq-hono-preview` Worker are for the same candidate commit. Use read-only health/version checks. Never access production or modify `main`.
3. Resolve the ambiguous Staff-create outcome read-only before any create attempt. Do not change the Staff timeout, retry blindly, top up balances, or buy a package.
4. Obtain the Supervisor read-scope decision before attempting to change permissions. Continue safe Owner listener/mobile and other matrix cases only through supported preview paths, one role/context and one mutation at a time.
5. Use a fresh browser context per role. Capture sanitized visible results, route/status/timing, scope/persistence checks, console errors, and cleanup evidence. Never log credentials, tokens, headers, request bodies, personal data, or financial payloads.
6. Update the existing role report, integrated report, checkpoint plan, and this handoff with PASS/FAIL/BLOCKED/OPEN/NOT RUN/N/A evidence. Run relevant tests, maintainability and diff checks; commit/push only to `migration/unified-hono`, then verify the exact head's workflows.

## Hard boundaries

Synthetic pre-production data only. No production deploy or mutation, no `main` merge, no live Firestore Rules deployment, no direct database repair, no financial write, no unapproved UI/UX change, and no blind retry of ambiguous writes. Do not record or transfer PINs, tokens, or sessions. If safe evidence is unavailable, record BLOCKED/OPEN and stop the affected case.

Do not begin H7 while any required H6 role, scope, cleanup, or Pages-to-Worker gate remains open. H7 is a GO/HOLD decision; H8 production replacement requires all gates and explicit owner approval. A green test suite is not a guarantee of zero defects.
