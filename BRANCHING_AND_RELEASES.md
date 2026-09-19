# Branching and Releases

## Current state

`main` is the only permanent branch. It represents the source that should be deployed to Cloudflare Pages and Railway. The production URLs are:

- Frontend: `https://rq-acg.pages.dev`
- Backend: `https://rq-production-af02.up.railway.app`

## Normal change flow

1. Update local `main` from GitHub.
2. Create a focused branch such as `fix/<short-description>` or `feat/<short-description>`.
3. Make the change and run tests, typecheck, build, maintainability checks, and smoke checks when relevant.
4. Push the branch and open a pull request targeting `main`.
5. Merge only after CI and review pass.
6. Delete the merged branch.

## Why branches and pull requests exist

A branch is an isolated line of commits used to develop or validate a change without changing `main` immediately. A pull request compares that line with `main`, runs CI, and records the review/merge decision. Once merged, the commits are part of `main`; the branch is normally disposable.

GitHub's **Compare & pull request** prompt appears when a remote branch has commits not contained in `main`. It is an invitation to create a PR, not proof that a PR is open. A real open PR appears under the repository's Pull requests tab.

## Repository cleanup rule

Completed fix branches and retired hosting branches must not remain as active development surfaces. If a branch contains unique work that is not in `main`, review and merge or explicitly archive that work before deleting it. Deleting a branch does not rewrite commit history; the merged commits remain reachable from `main`.
