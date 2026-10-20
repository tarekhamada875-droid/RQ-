# RQ releases

`main` is the production source branch. Make one focused short-lived branch per bounded change and open a pull request into `main`. Do not bypass protected checks or deploy a Worker manually as a shortcut.

## Before a pull request

Synchronize `main`, confirm a clean working tree, add focused tests, and run:

```bash
npm test
npm run test:rules
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

Use emulator and synthetic fixture workflows for local tests. Review the diff for unintended UI, data, rules, or deployment changes.

## Merge and deployment

Merge only after required PR checks pass. A merge to `main` may publish Pages and trigger the guarded Worker deployment. Verify the Production Gate, deployed artifact identity, live `/api/health`, and live `/api/version` when code or deployment configuration changes.

A documentation-only merge may advance `main` without changing the deployed Worker. Do not confuse repository `main` with the live Worker version.

## Rollback

Use the repository’s guarded rollback workflow with the full verified commit SHA and matching successful Production Gate run. Do not manually deploy an arbitrary artifact.

## Status language

Use precise terms: local, pushed, in a PR, merged, deployed, or live. Copied notes are not proof of current GitHub or runtime state; fetch current state when reporting a release.
