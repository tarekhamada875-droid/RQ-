# RQ Hono Migration — Shortened Completion Plan

## Objective

Finish the existing Hono migration with the fewest safe steps. Do not redesign the migration, add features, or create another long checkpoint sequence. Hono is already the production backend from H8; this plan governs the remaining H9 source/runtime cleanup. Keep `main` and production unchanged unless the owner explicitly approves a separate production-release action after H9 completion.

## Phase 1 — Verify the exact H9 candidate

1. Identify the exact migration branch, commit SHA, current `main` SHA, and production H8 SHA.
2. Confirm the candidate is the intended Cloudflare Pages + Hono Worker architecture and that the Pages preview points to the isolated Hono Worker—not production.
3. Re-check current CI and required quality-gate results for that exact SHA. Historical green runs do not count if the candidate has changed.
4. Review existing H6/H7/H8 acceptance evidence and reuse evidence that is still valid for the same code and environment. Do not repeat completed tests without a specific reason.
5. Record unresolved risks clearly. At minimum, do not mark these as passed without fresh evidence:
   - Staff operational mutations and their authorization/scope.
   - Owner listener delivery and cleanup behavior.
   - Financial flows, which remain blocked until a suitable isolated sandbox exists.
6. If the candidate, preview wiring, or required checks cannot be verified, stop and report the exact blocker. Do not guess or silently waive it.

**Exit gate:** Exact candidate SHA, preview-to-Worker wiring, current checks, and remaining risks are documented. No production changes.

## Phase 2 — Confirm the existing H8 production state

1. Verify that H8 is already deployed and matches the documented production commit and rollback tag.
2. Confirm that `main` and the H8 production release remain unchanged during H9.
3. Confirm that all H9 work is isolated to `migration/unified-hono`.
4. Run only credential-free health/version checks when needed to confirm the deployed state.
5. Do not merge, deploy, change production, perform financial writes, or perform authenticated preview Firestore operations during H9.
6. Treat any future production promotion as a separate release decision after H9 source completion.

**Exit gate:** H8 production is confirmed and unchanged; H9 work proceeds only on the migration branch.

## Phase 3 — Finish targeted H9 parity and Express cleanup

Do this after the Hono runtime path is verified. Do not delete every file containing “Express” indiscriminately.

1. Search all remaining Express references, including imports, package scripts, test setup, local-development servers, deployment configuration, documentation, and compatibility routes.
2. Classify each reference as:
   - **Obsolete runtime path:** remove it.
   - **Still-required test or development dependency:** retain it temporarily or migrate the consumer deliberately.
   - **Supported compatibility/deployment path:** confirm whether it is still required; otherwise document and remove it.
3. Close the remaining targeted parity areas with Hono/Fetch evidence, prioritizing financial ledger/rate-limit/audit behavior, shared middleware/runtime behavior, vehicle/subscriber semantics, staff behavior, reporting, and local Node/Vite/static/container serving.
4. Remove only proven-obsolete Express routes, code, scripts, dependencies, and configuration. Do not create parallel live API implementations or fallback paths.
5. Update tests and documentation affected by each removal. Keep dual-runtime characterization tests until equivalent Hono coverage passes.
6. Run focused route-parity, authorization, session, and representative business-flow tests after each bounded slice.
7. Review every final diff for accidental changes to business logic, data shape, authentication, authorization, sessions, tenant/garage scoping, or deployment behavior.

**Exit gate:** No obsolete Express runtime, route, dependency, script, deployment, or test reference remains; every intentionally retained Express reference has a named purpose and documented owner; all required checks pass.

## Phase 4 — Final H9 completion gate

1. Run the full test suite and TypeScript validation.
2. Run frontend, Node, and Cloudflare Worker builds plus artifact verification.
3. Run `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`.
4. Verify the exact final migration commit through the required migration-branch workflows.
5. Confirm the final route/import census, clean worktree, rollback baseline, and updated plan, inventory, knowledge base, and handoff.
6. Perform only non-mutating preview health/version checks if deployment wiring requires them.

**Exit gate:** H9 is complete for source/runtime migration only. `main` and production remain unchanged.

## Scope controls

- Freeze feature work during this task.
- No API rewrite, broad refactor, new architecture, or extra migration phases.
- Do not weaken authentication, authorization, session validation, or tenant/garage scoping to make tests pass.
- Preserve the existing UI, accepted behavior, Firestore data shape, Arabic-first/PWA behavior, and intended Cloudflare Pages + Worker deployment.
- Do not use local proxy success as proof that the real Pages preview and isolated Worker are correctly connected.
- Do not change production or merge to `main` without explicit approval for that action.
- Do not perform financial operations without an isolated sandbox.
- Never blindly retry a mutation with an ambiguous result.
- Do not report a gate as passed without a current, reproducible result tied to the exact commit SHA.

## Required final report

Return one concise report containing:

1. Candidate branch and exact commit SHA; `main` and production H8 SHAs.
2. Current CI/quality-gate results and links or logs.
3. Preview Pages URL and the isolated Worker it calls.
4. Acceptance checks passed, failed, and not run.
5. Remaining risks/blockers and their owner-approved disposition, if any.
6. Express references removed and references intentionally retained, with reasons.
7. Final diff summary and rollback baseline/procedure.
8. A clear status: **H9 IN PROGRESS**, **H9 BLOCKED**, **READY FOR H9 SOURCE COMPLETION REVIEW**, **H9 COMPLETE — PRODUCTION UNCHANGED**, or **DEPLOYED AND VERIFIED**.

Do not claim production readiness solely because the build is green. Do not deploy or change production as part of H9 unless the owner explicitly authorizes the separate production-release action.
