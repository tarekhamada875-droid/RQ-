# Contributing to RQ

Read `docs/PROJECT.md`, `docs/SECURITY.md`, and `docs/RELEASES.md` before making a substantial change.

For implementation and launch-readiness work before production, follow only `docs/UI_PERFORMANCE_PLAN.md`, the Pre-Production and Pilot Readiness Plan. Do not resume the skipped Reliability and Scale or legacy-data-cleanup workstreams, and do not start speculative UI optimization.

Start from synchronized `main` with a clean working tree. Create one short-lived branch for one bounded change. Add or update a focused regression test before changing sensitive behavior. Preserve current UI/UX unless the task explicitly approves a UI change.

Keep financial and authorization logic in focused Worker/domain modules. Keep React screens focused on composition and move reusable behavior into hooks or services. Preserve API response shapes and error codes unless the task includes a deliberate contract change.

## Local validation

Run focused tests for the changed behavior, then the full local gate:

```bash
npm run ci:check
git diff --check
```

`npm run ci:check` performs a clean install and runs typechecking, the full Vitest suite, Firestore rules tests, production build, Worker-artifact smoke test, maintainability checks, and production artifact checks. Do not repeat those commands individually unless diagnosing a failure. Use the emulator/browser-fixture instructions under `docs/testing/` for local UI and Firestore checks. Do not point synthetic fixtures at production Firebase.

## Documentation governance

Keep the repository’s documentation small and canonical. Use `docs/PROJECT.md` for product and architecture, `docs/UI_PERFORMANCE_PLAN.md` as the only active implementation plan, `docs/SECURITY.md` for security, `docs/RELEASES.md` for release procedure, `docs/OPERATIONS.md` for operations, and `docs/testing/` for test procedures and historical evidence. Do not treat reports or baselines as independent task plans. Do not add new handoff, knowledge, working-agreement, roadmap, release-history, agent-instruction, or duplicate security files. Do not add root-level Markdown files beyond `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`; consolidate durable information into the correct canonical document instead.

## Pull requests and reporting

Push the focused branch and open a pull request to `main`. Merge only after required checks pass. After merge, verify the resulting branch, Production Gate, deployment identity, and live health/version when the change affects deployment.

Report what was wrong, what changed for the user, what was tested, and whether the work is local, in a PR, merged, deployed, or live. Do not describe copied or historical status as current.

Never commit secrets. Never perform destructive Firestore operations without exact collection/predicate scope, a backup or rollback plan, verification evidence, and explicit confirmation.
