# RQ releases

`main` is the production source branch. Make one focused short-lived branch per bounded change and open a pull request into `main`. Do not bypass protected checks or deploy a Worker manually as a shortcut.

## Before a pull request

Synchronize `main`, confirm a clean working tree, add focused tests, and run the full local gate once:

```bash
npm run ci:check
git diff --check
```

`npm run ci:check` performs the clean install, typecheck, full test suite, Firestore rules emulator tests, production build, Worker-artifact smoke test, maintainability checks, and artifact verification. Do not rerun those steps individually unless diagnosing a failure. GitHub’s required Production Gate remains the final merge gate.

Use emulator and synthetic fixture workflows for local tests. Review the diff for unintended UI, data, rules, or deployment changes.

## Merge and deployment

Merge only after required PR checks pass. A merge to `main` may publish Pages; non-Markdown-only changes may trigger the guarded Worker deployment. Verify the Production Gate, deployed artifact identity, live `/api/health`, and live `/api/version` when application code or deployment configuration changes.

Markdown-only merges run the lightweight documentation validation and do not dispatch a Worker deployment from the post-merge fallback. The fallback checks the merged PR’s changed paths and suppresses deployment when every changed file ends in `.md`. Do not confuse repository `main` with the live Worker version.

## Rollback

Use the repository’s guarded rollback workflow with the full verified commit SHA and matching successful Production Gate run. Do not manually deploy an arbitrary artifact.

## Status language

Use precise terms: local, pushed, in a PR, merged, deployed, or live. Copied notes are not proof of current GitHub or runtime state; fetch current state when reporting a release.
