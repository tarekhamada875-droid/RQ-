# RQ Unified Hono Migration — Current Succession Handoff

**Updated:** 2026-10-08
**Active task:** Checkpoint H6 — controlled human role/security acceptance
**Authorized branch:** `migration/unified-hono` only
**Production:** `main` and the deployed Cloudflare Pages/Worker remain untouched.

## Start here

1. Read `RQ_PROJECT_KNOWLEDGE_BASE.md`, `AGENTS.md`, and `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`.
2. Follow [`docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`](docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md) as the execution authority. Use [`docs/H6_NEXT_AGENT_PROMPT.md`](docs/H6_NEXT_AGENT_PROMPT.md) for the current bounded next steps.
3. Use `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md` as the role/feature coverage catalog, not as permission to perform every legacy example. Reuse existing scoped evidence in `docs/H6_ROLE_ACCEPTANCE_2026-10-05.md` and `RQ_INTEGRATED_ACCEPTANCE_TEST_REPORT_2026-10-06.md`; do not rebuild the app or repeat the whole matrix. Run only unresolved cases or regressions invalidated by relevant changes. Older dated notes are historical and may be superseded by later evidence.
4. Before acting, verify actual branch, HEAD, remote state, worktree, preview deployment identity, and workflow status. No browser session, credential, local proxy, or secret transfers to the next agent.

## Current branch and validation context

Immediately before this handoff refresh, the latest workflow-verified branch head was `807d8ec8184ebc833043377699aac97aff629d0d`. Its H5 Preview Worker [run 37734277773](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37734277773) and Production Gate [run 37734277788](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37734277788) both passed. That commit contains documentation synchronization only. The preceding source/test commit is `30cccf48d71dcf2e7890c09f3f8bfd3aed7c79a6`; it changes only the `/api/garages/delete` frontend timeout to 30 seconds and adds its regression test. This handoff refresh is documentation-only; verify actual branch and current HEAD/workflows before acting.

The latest workflow-verified branch head is `81e9f37f510d9563e9214761aa90587ea4306c07`; H5 Preview Worker [run 37734648176](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37734648176) and Production Gate [run 37734648186](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37734648186) both passed. The exact Cloudflare Pages preview deployment `14be67d2-25d5-447c-99f7-1ae21beac5ed` serves this commit at `https://migration-unified-hono.rq-acg.pages.dev`.
The isolated Worker preview is `https://rq-hono-preview.tarekhamada875.workers.dev`, reporting `1.0.0-h5-preview` and healthy pre-production status. Read-only bundle inspection found that the Pages preview still compiled the production Worker origin. The Cloudflare Pages **preview environment only** was corrected to target `rq-hono-preview`; production configuration was preserved unchanged. A fresh Pages deployment is required before browser acceptance. Earlier browser sessions used a temporary local Vite proxy; that remains diagnostic evidence only.

## Current H6 status — OPEN/BLOCKED

| Area | Status and limitation |
|---|---|
| Staff operational access | **OPEN/BLOCKED.** One Admin Staff-create attempt in an active synthetic two-day free-trial context produced no observed success response, row, or usable credential. No retry was made; the owner directed that the Staff-create timeout remain unchanged. Reconcile the prior request read-only before any further write. |
| Supervisor garage-read policy | **OPEN.** Global-versus-assigned monitoring scope requires an explicit owner decision before changing Worker, Firestore, or UI permissions. |
| Garage Owner listener/cleanup | **OPEN/PARTIAL.** Bounded desktop reload persistence passed; real listener event delivery is unverified. Cleanup status must be supported by completion evidence, not list absence alone. |
| Financial acceptance | **OPEN/BLOCKED — intentionally untested.** No payment, recharge approval, wallet top-up, transfer/settlement, or package/subscription purchase/renewal without an authorized isolated financial sandbox. |
| Admin browser acceptance | **OPEN/UNVERIFIED; reconciliation BLOCKED.** One Admin login through the fresh Pages preview reached verification, then returned to the generic login without a dashboard, observed status, or safe success evidence. Source audit identified the preview Worker CORS allowlist as missing the stable migration Pages origin; a preview-only config fix is prepared, but no browser retry has been made. |
| Automation and Pages path | Exact Pages preview deployment and Worker candidate are identified and the fresh deployment passed. No Playwright dependency/configuration/H6 E2E script is present. Do not claim automated or production-equivalent browser acceptance. |

The process rewrite does not change any acceptance status. H7 has **not** started. H6 and H7 cannot guarantee “100% bug-free”; report residual risk accurately.

## Required boundaries

Use synthetic pre-production data only. Do not modify `main`, merge to it, deploy production, deploy live Firestore rules, perform financial writes, mutate Firestore directly, redesign the UI, or blindly retry an ambiguous mutation. Preserve credentials and tokens; never put them in source, screenshots, shell logs, or handoff text. Keep writes serialized and use supported UI/API paths for the behavior being accepted.

## Next safe actions

1. Deploy and verify the preview-only CORS allowlist fix for `https://migration-unified-hono.rq-acg.pages.dev`; only after a fresh deployment is confirmed may one controlled Admin login be attempted again. Do not retry the old ambiguous request or use production.
2. Reconcile the previous Staff-create attempt through read-only UI/list evidence and safe preview correlation/timing metadata. Do not change the timeout or resubmit blindly.
3. Obtain the Supervisor scope decision before permission edits. Continue only safe Owner listener/mobile and other role cases, one role/context at a time.
4. No Playwright harness exists. Manual H6 testing may continue through the controlled runbook; do not build a harness just to restart acceptance. If automated browser coverage is required by the owner or an acceptance gate, scope it as a separate opt-in test-infrastructure task; fail closed for production, store no credentials, and disable blind retries.
5. Keep financial cases blocked without a dedicated sandbox and explicit authorization. Update all matrix cells with evidence, verify cleanup, run local gates, and push only to `migration/unified-hono`.
6. Do not start H7 until H6 exits are satisfied or the owner explicitly revises scope and accepts the documented residual risk. H7 is GO/HOLD; H8 production replacement requires every gate and explicit approval.

## Mandatory succession protocol — exact message “tokens ending”

If the owner sends exactly **“tokens ending”**, stop feature work and browser testing immediately. Before any other implementation work:

1. Verify and record branch, HEAD, worktree, changed files, local tests, workflow/deployment status, current blockers, and safe next commands.
2. Append a concise dated handoff section with those facts. Never include PINs, tokens, passwords, session IDs, or private payloads.
3. Run `git diff --check`; commit and push the handoff only to `migration/unified-hono` if the push is authorized, and verify the result. Do not merge to `main` or deploy production.
4. Provide the next agent with the runbook and explicit boundaries, then stop current feature work.

Older handoff chronology is retained in Git history and dated acceptance reports; this file is the single current succession instruction.
