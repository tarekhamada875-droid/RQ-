# Branching and Releases

## Current state

`main` is the only permanent source branch and contains application code plus project documentation. It is not proof that every commit has been deployed to every service: docs-only merges can advance `main` while the Worker deployment is skipped. Use the Production Gate and live `/api/health` and `/api/version` endpoints to identify the actual deployed Worker release. The production URLs are:

- Frontend: `https://rq-acg.pages.dev`
- Backend: `https://rq.tarekhamada875.workers.dev`

## Main branch protections

As of 2026-10-17, the active repository ruleset [Protect main: pull request and Production Gate](https://github.com/tarekhamada875-droid/RQ-/rules/25292182) protects `main`:

- Changes must arrive through a pull request.
- GitHub Actions check `verify` is required, and the branch must be up to date.
- Force-pushes and branch deletion are blocked; there are no bypass actors.
- No minimum reviewer approval count is configured.

## Normal change flow

1. Update local `main` from GitHub.
2. Create a focused branch such as `fix/<short-description>` or `feat/<short-description>`.
3. Make the change and run tests, typecheck, build, maintainability checks, and smoke checks when relevant.
4. Push the branch and open a pull request targeting `main`.
5. Merge only after CI and review pass.
6. Delete the merged branch.

## Production Gate triggers and cancellation

- The full Production Gate runs for pull requests targeting `main` and pushes to `main`. A feature-branch push alone does not start a second gate; open or update its PR to get the required check.
- When a PR is updated, a newer PR check may cancel the older check for that same PR. A push to `main` is never canceled; its verification, deployment, and smoke must finish normally.
- Documentation-only changes continue to use the existing fast validation path; the Worker deployment job remains skipped for docs-only changes.

## Main SHA versus deployed Worker SHA

These identifiers answer different questions:

- `main` HEAD is the latest merged repository commit. It changes on every merge, including documentation-only PRs.
- The deployed Worker SHA is the application code currently running in production. Confirm it from live `/api/health` and `/api/version` responses and the successful Production Gate that deployed it.
- A docs-only PR may advance `main` while the Worker remains on an earlier code SHA. This is expected if the intervening changes are documentation-only, the gate passes, and Worker deployment is skipped.

Durable notes should record application release commits, deployment evidence, project decisions, tests, risks, and next work—not a supposedly current `main` SHA, worktree, or open-PR list. At handoff, fetch those values and put the exact snapshot in the final message. A docs-only PR cannot reliably record its own resulting merge SHA; after merging one, verify and report that SHA in the handoff message and do not open a second PR solely to record it. If a code PR's deployment fails or the live Worker differs from the intended code release, troubleshoot the release instead of editing documentation to make the SHAs appear equal.

## Manual Worker rollback

The Production Gate keeps each verified release artifact for up to 30 days (subject to the repository’s artifact-retention limit). To restore a previous Worker release, start the **Worker Rollback** workflow from `main` and provide the full commit SHA plus the run ID of that commit’s successful main-branch **Production Gate**. The workflow confirms those two identifiers belong together, downloads only that run’s `rq-production-<SHA>` artifact, and refuses to deploy if the artifact cannot report its source SHA. It then deploys that exact saved Worker build and runs the strict smoke check against the selected SHA.

This workflow is manual and does not roll back Pages or change Firebase data/rules. Do not select a pull-request run, use a shortened SHA, or bypass the workflow. If the selected artifact has expired or predates commit-SHA reporting, the workflow stops before deployment. A successful rollback is still a production release and must be checked in its Actions run.

## Why branches and pull requests exist

A branch is an isolated line of commits used to develop or validate a change without changing `main` immediately. A pull request compares that line with `main`, runs CI, and records the review/merge decision. Once merged, the commits are part of `main`; the branch is normally disposable.

GitHub's **Compare & pull request** prompt appears when a remote branch has commits not contained in `main`. It is an invitation to create a PR, not proof that a PR is open. A real open PR appears under the repository's Pull requests tab.

## Repository cleanup rule

Completed fix branches and retired hosting branches must not remain as active development surfaces. If a branch contains unique work that is not in `main`, review and merge or explicitly archive that work before deleting it. Deleting a branch does not rewrite commit history; the merged commits remain reachable from `main`.
