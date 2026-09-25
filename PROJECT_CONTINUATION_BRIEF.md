# RQ- Project Continuation Brief

> **Purpose:** This file is the durable handoff point for continuing work on the RQ- repository from another account or coding session.

## Latest session handoff — 2026-09-25

The garage dashboard cleanup is complete: the standalone Arabic **`تجريبي`** badge was removed from the subscription countdown card because it overlapped the card content on mobile. Trial access logic, countdown calculations, balance behavior, and wallet-number rendering were not changed. The change is in `src/components/garage/GarageDashboardView.tsx`.

Validation completed for this slice:

- `npm run lint` passed.
- `npm run build:web` passed.
- `git diff --check` passed.

The next agent should verify the pushed commit and deployment status, then continue with the existing bounded code-quality plan in this brief and `CODE_QUALITY_CHECKPOINTS.md`. Do not repeat the removed-badge investigation unless a production screenshot shows a different overlapping element. When the owner sends the exact phrase **`tokens ending`**, stop feature work immediately and follow [`docs/SUCCESSION_PROTOCOL.md`](docs/SUCCESSION_PROTOCOL.md), recording the current commit, validation, changed files, blockers, and one exact next bounded task for the successor. Every successor must repeat that protocol.

## Important limitation

This document cannot transfer consciousness, personal memory, or awareness between accounts. A new coding agent will not literally remember previous conversations. It can, however, reconstruct the project context from this brief, the repository history, the checkpoint files, and fresh validation. The correct behavior after reading this file is to verify the current repository state and then continue from the recorded plan rather than starting the audit from zero.

## If you are a new coding agent

Read this file first. Then read `CODE_QUALITY_CHECKPOINTS.md` and `BUSINESS_LOGIC_FIX_CHECKPOINTS.md`. Confirm the current branch, commit, and working-tree state before changing anything. Treat the files as project history and operating constraints, not as a substitute for current verification.

A useful continuation response should begin with the following understanding:

> I remember the project context from the repository handoff. We are preparing RQ- for production with a Cloudflare Pages React/Vite frontend, a Railway Node/Express backend, and Firebase authentication and Firestore. The business-logic audit has already been performed, the major verified fixes are recorded, and the current work is a safety-controlled ESLint and maintainability cleanup. We should continue from the checkpoint files, preserve production behavior, validate every change, and only then move toward the production CI gate and final Cloudflare-to-Railway smoke verification.

Do not claim literal memory or consciousness. Say that the repository handoff restored the working context.

## Repository identity and architecture

The repository is `tarekhamada875-droid/RQ-`.

The frontend uses React 19, TypeScript, Vite, and a PWA service worker. It is deployed on Cloudflare Pages. The backend uses Node.js 22 and Express, with esbuild bundles used for Railway deployment and a Cloud Run-compatible server bundle. Firebase Auth and Firestore support identity, sessions, garages, vehicles, subscribers, packages, wallet operations, financial events, and reporting.

The production communication rule is important: frontend API calls from Cloudflare must go directly to Railway. Do not introduce a proxy, change deployment topology, or silently route production API calls through another service. The CORS configuration must continue to allow the canonical session header `X-Session-ID`.

## Current verified baseline

The current `main` branch was verified clean and synchronized with `origin/main` at commit `e43e964` after the focused Hooks slice:

```text
e43e964 quality: track vehicle setter in check-in callback
b9c08cf quality: stabilize admin login handler
61e4059 quality: track trial status in recharge sync
```

The latest complete validation evidence is:

- Full suite: **75 test files and 423 tests passed**.
- TypeScript: `npm run lint` passed.
- Production build: `npm run build` passed. The build includes the Vite frontend, the external-dependency server bundle, and the bundled Railway/Cloud Run server.
- Maintainability: `npm run maintainability:check` passed.
- Formatting/diff: `git diff --check` passed.
- Focused vehicle-operation regressions: **4 test files and 24 tests passed**.

The complete ESLint command is not yet green. The current remaining React Hooks findings are:

- `react-hooks/exhaustive-deps`: **5** after the current focused slice.
- `react-hooks/set-state-in-effect`: **10**.
- `react-hooks/purity`: **1**.

The broader ESLint result still contains the large pre-existing `@typescript-eslint/no-explicit-any` category. Do not mass-rewrite it.

## Work already completed

The business-logic audit and its verified fixes are recorded in `BUSINESS_LOGIC_FIX_CHECKPOINTS.md`. The completed work includes authentication and session ownership enforcement, safer logout, atomic PIN uniqueness, fail-closed PIN lookup, wallet and package correctness, idempotency protections, canonical financial-event work, trial and garage-state rules, subscriber and vehicle protections, permanent garage deletion, deletion locking, delegate safeguards, and report-related fixes that are explicitly marked in that file.

The recent code-quality work was deliberately narrower:

1. ESLint was introduced with a minimal flat configuration and a report-only baseline.
2. `no-unused-vars` was reduced from 68 findings to zero.
3. `preserve-caught-error` was reduced from 14 findings to zero while preserving error causes.
4. `no-empty` and `no-unused-expressions` were reduced from 18 findings to zero.
5. `no-useless-assignment` was reduced from 6 findings to zero.
6. Safe React Hooks findings were corrected without changing business behavior. This included unconditional hook ordering, ref initialization during render, declaration ordering, redundant memo dependencies, and two unnecessary callback dependencies.
7. The CI release smoke check was hardened with bounded deployment-aware retries because Railway can briefly serve the previous commit while a new deployment is propagating.
8. The Cloudflare-to-Railway path and CORS handling were previously verified as healthy through safe read-only checks.

## Mandatory safety protocol

Before each new change:

1. Run `git status --short --branch` and record the current commit.
2. Confirm the baseline is green with the relevant tests, `npm run lint`, `npm run build`, and `npm run maintainability:check` when the phase requires it.
3. Make one coherent, reviewable change at a time.
4. Run focused tests before the full validation gate.
5. Review `git diff` manually and run `git diff --check`.
6. Never weaken tests, disable rules, or hide findings merely to obtain a green command.
7. Never change financial rules, authentication/session behavior, API payload contracts, Firebase security behavior, or Cloudflare/Railway topology during code-quality work.
8. Do not commit generated `dist` output, environment files, credentials, service-account JSON, or unrelated changes.
9. For production checks, use only safe read-only health and smoke requests. Do not create garages, add balance, buy packages, approve recharges, delete records, change passwords, or submit financial mutations.
10. Commit and push only after the phase passes its required validation. Keep each coherent phase in its own commit.

## Immediate next plan

The last completed code slice changed only `src/hooks/useVehicleOperations.ts`: the checkout callback now declares the stable `setGarage` and `setVehicles` dispatchers plus the current `vehicles` snapshot used for optimistic rollback. The callback’s server authority, reconciliation, and rollback behavior are unchanged. The `AdminAddGarageModal.tsx` initialization warning remains deferred because its effect intentionally snapshots parent form values only when opening. The full gate passed; the working tree must not be treated as complete until the change is pushed.

The next agent must first verify `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and the latest checkpoint entry. Then run a complete ESLint inventory with the current configuration and choose **exactly one** remaining React Hooks finding. The modal warning remains deferred unless a dedicated snapshot regression proves a different design is intended. The next narrow candidate is `src/hooks/useVehicleOperations.ts` line 440, where the delete callback is missing `isLoading`, `setGarage`, and `setVehicles`; inspect its ownership and rollback semantics before editing. Do not broaden into unrelated findings.

For every candidate, preserve these contracts: the production `server/` backend remains authoritative; browser Firestore listeners are read/display synchronization only; authentication/session, financial, API, Firebase rules, and Cloudflare/Railway topology are out of scope; no `eslint-disable`, test weakening, or broad autofix is allowed. If a finding concerns `set-state-in-effect`, render purity, session/logout behavior, or a data-loading subscription, leave it unchanged unless the semantic replacement and focused regression tests are clear. Record why a finding is intentionally deferred.

The `set-state-in-effect` findings require special care because they concern state synchronization and may represent intentional external-system synchronization. The remaining `exhaustive-deps` findings must be inspected in context. The remaining `purity` finding must be checked for render-time impure values and corrected only if the replacement preserves timing and display semantics.

After React Hooks review, classify the remaining ESLint findings. The dominant `no-explicit-any` findings should be addressed only through narrow, typed boundary improvements where the actual data shape is known. Intentional compatibility boundaries should be documented or handled with a narrow exception rather than receiving speculative types.

When the ESLint result is stable and green, update Phase 1.8 to add the ESLint command to the production CI gate. Then run the final quality verification phase, including the full test suite, TypeScript, ESLint, production build, maintainability check, diff validation, repository status review, and safe Cloudflare/Railway smoke checks.

Only after the static-analysis phase is complete should the project proceed to the structured logging review and the backend bundle review. The next major areas are:

- **Phase 2:** structured, level-controlled logging with preserved redaction and correlation context.
- **Phase 3:** backend bundle size and dependency review without unsafe externalization.
- **Phase 4:** final quality verification and production handoff.

## Files that must remain authoritative

- `CODE_QUALITY_CHECKPOINTS.md` — code-quality phases, safety protocol, exact validation evidence, and next actions.
- `BUSINESS_LOGIC_FIX_CHECKPOINTS.md` — business rules, completed business fixes, deferred product decisions, and regression evidence.
- `eslint.config.js` — current ESLint policy and intentional exclusions.
- `tools/release-smoke.ts` — deployment-aware safe smoke-check behavior.
- `src/api/apiClient.ts` — frontend-to-Railway request behavior and session header handling.
- `package.json` — scripts for tests, TypeScript, ESLint, builds, maintainability, and smoke checks.

## Useful commands

```bash
git status --short --branch
git log -10 --oneline
npm test -- --maxWorkers=1
npm run lint
npm run lint:eslint
npm run build
npm run maintainability:check
git diff --check
npm run release:smoke
```

Use `npm run release:smoke` only with the configured safe environment variables and only for read-only checks. A temporary mismatch between the expected release commit and the live Railway commit can be a deployment-propagation race; the script now retries within bounded limits and still fails if the expected version never becomes live.

## Handoff principle

The goal is not to preserve a fictional personal memory. The goal is to preserve enough verified context that any authorized coding agent can continue safely, explain what has already happened, avoid repeating completed investigations, and finish the production-readiness plan without introducing regressions.

## References

[1]: CODE_QUALITY_CHECKPOINTS.md "RQ- code-quality checkpoints"
[2]: BUSINESS_LOGIC_FIX_CHECKPOINTS.md "RQ- business-logic fix checkpoints"
[3]: eslint.config.js "RQ- ESLint configuration"
[4]: tools/release-smoke.ts "RQ- release smoke check"
[5]: src/api/apiClient.ts "RQ- API client"
[6]: package.json "RQ- package scripts"
