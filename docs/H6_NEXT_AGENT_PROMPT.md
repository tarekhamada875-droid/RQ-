# Continuation Prompt — Unified Hono Migration, H6

**Updated:** 2026-10-09. Read `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` and this prompt before acting. This prompt supersedes the old Supervisor manual-login/scope checklist and any ad hoc click-through instructions.

## Mission and current disposition

Finish Checkpoint H6 through reproducible, evidence-based acceptance using synthetic pre-production data only. **H6 is OPEN/BLOCKED; H7 is HOLD/NO-GO.** Do not begin production cutover or merge to `main`.

Work only on `migration/unified-hono`. The deployed production Pages/Worker and `main` are outside scope and must remain untouched. Use the controlled runbook as the execution authority, the Staff/Owner manual runbook for field work, and the integrated acceptance document as a coverage catalog. Reuse valid recorded evidence; do not rebuild the app or repeat the entire matrix.

## Owner-approved Supervisor retirement

Supervisor is no longer an active role. Do not create, authenticate, inspect, delete, or modify legacy Supervisor accounts or session records. Existing `supervisors/` and `supervisor_sessions/` documents are preserved. Local migration-branch changes deny legacy PIN authentication without PIN migration, reject session refresh/release and protected access, remove management/PIN-update capabilities and visible navigation, and deny client access in Firestore Rules. Regression evidence must confirm both denial and record preservation. Prior Supervisor browser PASS results are historical; current active-role disposition is **N/A — role retired**. Do not deploy Firestore Rules to a live/pre-production project as part of this task.

## Remaining H6 gates

- **Staff:** operational access in an active synthetic trial remains OPEN/BLOCKED; the previously found Staff PIN was masked. Do not reset/create/replay/delete that fixture or change the timeout. Proceed only if a known-safe synthetic credential and valid active-trial context are already available.
- **Garage Owner:** listener delivery and prior cleanup completion remain OPEN/PARTIAL. Do not replay the ambiguous check-in or issue a second delete. Only test listener delivery with a newly approved, harmless synthetic event and a known supported cleanup path.
- **Pages/Worker identity:** verify the stable migration Pages preview serves the exact candidate and calls only `https://rq-hono-preview.tarekhamada875.workers.dev`. Run the opt-in Playwright harness only after verifying this pairing. It checks the login shell plus read-only Worker health/version, not role acceptance.
- **Financial cases:** intentionally OPEN/BLOCKED without an isolated financial sandbox. No payment, recharge, balance, wallet, transfer/settlement, subscription/package, or reward writes.
- **Local candidate validation:** `npm run ci:check` passed (**103 files / 592 tests**, including TypeScript/build/artifact checks); focused retirement tests passed (**6 files / 95 tests**); Firestore Rules Emulator retirement/preservation suite, maintainability check, and `git diff --check` passed. These are local-source results, not evidence of a deployed preview. Verify workflows and exact Pages/Worker identity for the pushed candidate before browser acceptance.
- Do not claim H6 complete based on unit tests or smoke tests. Resolve the required gates or obtain explicit owner acceptance of documented residual risk before H7.

## Required start and execution sequence

1. Read `AGENTS.md`, `RQ_PROJECT_KNOWLEDGE_BASE.md`, `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`, this handoff, `docs/H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`, `docs/H6_MANUAL_REMAINING_ROLES_RUNBOOK.md`, the dated role report, and the integrated acceptance report/catalog.
2. Verify current branch, local/remote HEAD, worktree, and exact-head GitHub workflows. Verify Pages/Worker deployment identity and credential-free health/version. If pairing or deployment identity is uncertain, mark that gate BLOCKED and stop browser acceptance.
3. Re-run the focused Supervisor-retirement security tests, full Vitest suite, TypeScript lint, builds, Firestore Rules Emulator, maintainability check, and `git diff --check` as applicable to the exact current head. Preserve test output/status in the handoff without secrets.
4. Use only the Staff/Owner manual runbook for field acceptance. One role/context at a time, one approved mutation at most, no blind retries, no direct database repair, and only supported UI/API paths.
5. Reconcile the integrated matrix accurately as PASS, FAIL, BLOCKED, OPEN/UNVERIFIED, NOT RUN, or N/A with technical and visible evidence kept distinct. Preserve earlier dated evidence rather than rewriting history.
6. Commit and push only to `migration/unified-hono` when authorized, then verify workflows against the pushed SHA. Never modify `main`, publish a production deployment, or deploy live Firestore Rules.

## Fixed constraints and succession

- English documentation and communication only; no UI/UX redesign.
- Keep the garage-delete client timeout at **30 seconds**.
- Synthetic pre-production data only. Never put PINs, tokens, session IDs, private payloads, or personal data in files, logs, screenshots, or this handoff.
- No process can guarantee “100% bug-free”; record residual risk honestly.
- If the owner says exactly **`tokens ending`**, stop feature/browser work and perform the mandatory dated succession handoff before any other change.
