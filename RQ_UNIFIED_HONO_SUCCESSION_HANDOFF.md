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

The latest workflow-verified code/test baseline for this handoff is `ae8ab8099e11de07da5d2d87d9a1c863eb6983d1`. Its H5 Preview Worker [run 37807079547](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079547) and Production Gate [run 37807079550](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37807079550) both passed. The latest application-source change remains `30cccf48d71dcf2e7890c09f3f8bfd3aed7c79a6`, which sets the `/api/garages/delete` timeout to 30 seconds and tests it. Commit `40da805` changes only `wrangler.preview.toml` to allow the stable migration Pages origin for the isolated preview Worker; production `wrangler.toml` was unchanged. Commit `ae8ab80` adds an opt-in read-only Playwright smoke and its documentation; it does not change product behavior or role-acceptance outcomes. A later documentation-only synchronization may make branch HEAD newer; always verify the actual branch, current HEAD, workflow status, and deployment identity before acting.

The stable migration Pages preview is `https://migration-unified-hono.rq-acg.pages.dev`; the isolated Worker preview is `https://rq-hono-preview.tarekhamada875.workers.dev`. A bounded Admin login/dashboard/read-only navigation/logout **PASS** is recorded on the stable Pages URL after the preview-only CORS correction. This is evidence for that recorded preview session, not proof that the URL currently serves the latest candidate commit; verify the exact Pages build and Worker version before further browser testing. Earlier local Vite-proxy results remain diagnostic only. Production configuration remains unchanged.

## Current H6 status — OPEN/BLOCKED

| Area | Status and limitation |
|---|---|
| Staff operational access | **PARTIAL / OPEN/BLOCKED.** Read-only inspection of the documented `QA Garage Beta` fixture found exactly one synthetic Staff row, `Mobile QA Staff`, with its PIN masked. This reconciles the prior ambiguous request as a likely late backend completion after the client wait ended; no retry or deletion was performed. Staff login and operational workflows remain untested because no usable PIN was exposed. |
| Supervisor garage-read policy | **OPEN.** Global-versus-assigned monitoring scope requires an explicit owner decision before changing Worker, Firestore, or UI permissions. |
| Garage Owner listener/cleanup | **OPEN/PARTIAL.** Bounded desktop reload persistence passed and source/lifecycle tests passed **2 files / 15 tests**. One live synthetic hourly check-in was submitted once, but no success response or listener count update appeared; it remains an ambiguous/open mutation with no retry. The fixture deletion reached 50% and the fixture later disappeared from a fresh Admin list, providing partial cleanup evidence only—not confirmed job completion. |
| Financial acceptance | **OPEN/BLOCKED — intentionally untested.** No payment, recharge approval, wallet top-up, transfer/settlement, or package/subscription purchase/renewal without an authorized isolated financial sandbox. |
| Admin browser acceptance | **PASS, bounded.** After the preview-only CORS allowlist fix, one fresh Admin login through `https://migration-unified-hono.rq-acg.pages.dev` reached the Admin dashboard, read-only navigation/counts rendered, and normal PIN-confirmed logout returned to the generic login. No Admin mutation or financial action was performed. |
| Automation and Pages path | An opt-in Playwright read-only smoke is documented in `docs/H6_PLAYWRIGHT_PREVIEW_HARNESS.md`; it checks the generic login shell and isolated Worker health/version endpoints. It is not authenticated role-acceptance E2E, is not in CI, and does not waive fresh candidate-pairing verification. |

The process rewrite does not change any acceptance status. H7 has **not** started. H6 and H7 cannot guarantee “100% bug-free”; report residual risk accurately.

## Required boundaries

Use synthetic pre-production data only. Do not modify `main`, merge to it, deploy production, deploy live Firestore rules, perform financial writes, mutate Firestore directly, redesign the UI, or blindly retry an ambiguous mutation. Preserve credentials and tokens; never put them in source, screenshots, shell logs, or handoff text. Keep writes serialized and use supported UI/API paths for the behavior being accepted.

## Next safe actions

1. Preserve the bounded Admin PASS and continue only with the remaining unresolved H6 cells: Staff operational access, Supervisor scope decision, Owner listener/cleanup evidence, and blocked financial workflows. Do not repeat the Admin login unless new evidence requires it.
2. Preserve the partial Staff transport reconciliation. Do not change the timeout, replay Staff-create, delete `Mobile QA Staff`, or infer Staff operational PASS from row existence; continue only if a safe credential/test fixture is separately authorized and available.
3. Obtain the Supervisor scope decision before permission edits. Continue only safe Owner listener/mobile and other role cases, one role/context at a time.
4. The opt-in Playwright harness covers only the read-only shell/health smoke; run it only after verifying the Pages/Worker candidate pairing. Continue manual H6 testing under the runbook. Do not infer role PASS from the smoke or expand it to authenticated/mutating journeys without separately approved scope, runtime secret handling, serialized writes, verified cleanup, and no blind retries.
5. Keep financial cases blocked without a dedicated sandbox and explicit authorization. Update all matrix cells with evidence, verify cleanup, run local gates, and push only to `migration/unified-hono`.
6. Do not start H7 until H6 exits are satisfied or the owner explicitly revises scope and accepts the documented residual risk. H7 is GO/HOLD; H8 production replacement requires every gate and explicit approval.

## Mandatory succession protocol — exact message “tokens ending”

If the owner sends exactly **“tokens ending”**, stop feature work and browser testing immediately. Before any other implementation work:

1. Verify and record branch, HEAD, worktree, changed files, local tests, workflow/deployment status, current blockers, and safe next commands.
2. Append a concise dated handoff section with those facts. Never include PINs, tokens, passwords, session IDs, or private payloads.
3. Run `git diff --check`; commit and push the handoff only to `migration/unified-hono` if the push is authorized, and verify the result. Do not merge to `main` or deploy production.
4. Provide the next agent with the runbook and explicit boundaries, then stop current feature work.

Older handoff chronology is retained in Git history and dated acceptance reports; this file is the single current succession instruction.

## Historical snapshot — exact “tokens ending” succession on 2026-10-08 (superseded)

The following point-in-time snapshot was accurate when written for `512a994`. It is retained for succession history only; the branch and workflow state below were superseded by later commits. Use the current branch/CI state in the section above and verify it afresh.

Feature work and browser testing stop here per the exact owner marker.

- **Authorized branch:** `migration/unified-hono`; local and remote HEAD: `512a994899b8fb170dc7296f280d98a35f94c5df` (`docs: reconcile live owner listener result`). Worktree was clean before this handoff append; no production or `main` changes were made.
- **Documentation state:** The latest evidence records the live Owner listener attempt as **OPEN/UNVERIFIED**: one synthetic hourly check-in remained ambiguous, no retry was made, and no listener count update appeared. The synthetic fixture later disappeared from a fresh Admin list after deletion UI progress reached 50%; cleanup is **PARTIAL**, not confirmed job completion. Staff transport is **PARTIAL** with Staff operational access **OPEN/BLOCKED**. Supervisor scope is **OPEN** pending an explicit product boundary. Financial flows remain **OPEN/BLOCKED** and intentionally untested. H6 is not complete; H7 must not start.
- **Validation evidence:** The latest focused listener source/lifecycle validation passed **2 files / 15 tests**. Earlier recorded full gates remain valid for their documented code heads; do not represent the current docs-only head as a fresh full-suite result until rerun.
- **Workflow state at handoff:** Production Gate run `37750093991` for `512a994` is **pending**; H5 Preview Worker run `37750094004` is **in progress**. The preceding H5 run `37748274895` for `5226c6e` completed successfully. Do not infer current-head deployment success until the pending/in-progress runs settle and are checked.
- **Safe next commands:** inspect the two current workflow runs; if they pass, perform credential-free preview health/version and exact Pages/Worker pairing checks; then only resume an explicitly bounded unresolved H6 cell. Do not replay the ambiguous vehicle mutation, change timeouts, modify Supervisor permissions/rules, perform financial writes, access production, merge to `main`, or start H7.
