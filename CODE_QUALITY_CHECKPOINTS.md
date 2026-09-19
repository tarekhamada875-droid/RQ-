# RQ- Code Quality Checkpoints

**Purpose:** Durable continuation plan for the remaining code-quality work identified after the business-logic audit.

**Repository:** `tarekhamada875-droid/RQ-`
**Production architecture:** Cloudflare Pages frontend + Railway backend
**Current baseline:** `4e86fb2` (`Merge pull request #18 from tarekhamada875-droid/quality/empty-and-unused-expressions`)
**Status:** In progress

## Important context

The repository is currently operationally healthy and regression-safe. The complete test suite passed with **52 test files and 287 tests**. TypeScript validation, the production frontend/backend build, the maintainability check, and `git diff --check` also passed at the current baseline.

Do not treat the items in this file as known production failures. They are maintainability improvements and must be implemented without changing business behavior, authentication behavior, financial behavior, deployment topology, or public API contracts.

## Mandatory safety protocol

Before changing code, confirm `git status --short --branch`, record the current commit, and verify that `npm test -- --maxWorkers=1`, `npm run lint`, `npm run build`, and `npm run maintainability:check` are green. If the baseline is not green, stop and record the failure before starting new cleanup work.

Work in one coherent phase at a time. Prefer a separate branch or a single small commit per phase, and never combine ESLint migration, logging migration, bundle changes, and business-logic changes in one commit. Review `git diff` manually before committing. Do not commit generated `dist` output, local environment files, credentials, service-account JSON, or unrelated working-tree changes.

After every meaningful change, run the narrowest relevant tests first, then the full validation gate before pushing. If any test, typecheck, build, maintainability check, smoke check, or security review fails, stop the phase, restore the last green commit or revert only the failing phase, and document the failure here. Do not weaken a test or disable a lint rule merely to make the gate pass.

Production verification must be read-only and safe. Health checks may be used, but do not create garages, add balance, buy packages, approve recharges, delete records, change passwords, or submit financial mutations during smoke testing. Any live test requiring a real account, write operation, or user confirmation must be explicitly paused for the owner.

For logging changes, first preserve the old message meaning in the new structured fields, then compare local output before removing or downgrading the old log. For bundling changes, keep the previous build command available and verify server startup before considering the optimization complete. If an optimization has no clear benefit, leave the working implementation unchanged and mark the review complete with evidence.

## Checkpoint status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Implemented and verified
- `[!]` Blocked or requires an explicit decision

## Phase 1 — ESLint and static analysis

- [x] 1.1 Inspect `package.json`, `tsconfig.json`, and the existing TypeScript/Vite configuration before adding tooling.
- [x] 1.2 Add ESLint using versions compatible with the current Node/npm setup and TypeScript/React codebase.
- [x] 1.3 Add a minimal, non-destructive baseline configuration first. Do not enable aggressive stylistic rules or automatic rewrites initially.
- [x] 1.4 Include TypeScript and React hooks rules where compatible with the current project.
- [x] 1.5 Add an explicit `npm run lint:eslint` script. Preserve the existing `npm run lint` TypeScript check unless a deliberate combined script is documented.
- [x] 1.6 Run ESLint in report-only/fix-free mode first and classify findings into real defects, safe cleanup, and intentional exceptions.
- [~] 1.7 Fix only safe findings in focused commits. Do not mass-run `eslint --fix` over the whole repository without reviewing the diff.
- [ ] 1.8 Add the ESLint command to the production gate only after the initial result is understood and stable.

### ESLint acceptance criteria

- Existing tests still pass.
- `npm run lint` remains green.
- New ESLint command is green with no unexplained errors.
- No changes to business rules, API payloads, Firebase security/session behavior, or deployment configuration.
- Any intentional rule exceptions are narrow, documented, and justified.

## Phase 2 — Structured, level-controlled logging

- [ ] 2.1 Inventory all `console.log`, `console.warn`, and `console.error` calls in `src` and `server`.
- [ ] 2.2 Separate logs into startup, authentication/security, migration, diagnostics, expected warnings, and unexpected errors.
- [ ] 2.3 Create a small server logger abstraction with levels such as `error`, `warn`, `info`, and `debug`.
- [ ] 2.4 Make the minimum production log level configurable through an environment variable, with a safe default that preserves important errors and warnings.
- [ ] 2.5 Preserve correlation ID, operation ID, session context, and existing security redaction. Never log PINs, passwords, tokens, authorization headers, or private Firebase credentials.
- [ ] 2.6 Migrate server logs gradually, starting with startup/authentication diagnostics. Do not remove useful operational logs until equivalent structured output exists.
- [ ] 2.7 Handle browser diagnostics separately; do not ship verbose authentication diagnostics to normal production users unless explicitly enabled.
- [ ] 2.8 Add tests for sensitive-field redaction and log-level filtering if the logger contains non-trivial logic.

### Logging acceptance criteria

- No secrets or credentials appear in logs.
- Production errors remain visible.
- Debug/diagnostic logs can be suppressed without code changes.
- Authentication/session and financial flows retain enough correlation information for incident investigation.
- Full tests, TypeScript, build, maintainability, and diff checks pass.

## Phase 3 — Backend bundle review

- [ ] 3.1 Capture the current production bundle sizes as a baseline. Current observed result: `dist/cloud-run.cjs` approximately **6.7 MB**, with an approximately **11.1 MB** source map.
- [ ] 3.2 Inspect the Cloud Run build command in `package.json` and `server/cloudRun.ts` before changing bundling behavior.
- [ ] 3.3 Generate a bundle metafile or equivalent dependency report to identify the largest contributors.
- [ ] 3.4 Distinguish runtime bundle size from source-map size. The source map is not the same as the deployed executable payload.
- [ ] 3.5 Do not remove dependencies or switch `bundle`/`external` settings merely to reduce the number. Verify Firebase Admin, Express routes, Railway startup, and error handling after every change.
- [ ] 3.6 Prefer low-risk improvements such as excluding development-only code, avoiding accidental duplicate imports, or documenting why Firebase/Admin dependencies are bundled.
- [ ] 3.7 If no safe reduction is available, document the result and mark this checkpoint complete as reviewed rather than forcing an optimization.

### Bundle acceptance criteria

- `npm run build` passes.
- Railway/Cloud Run server starts successfully in a smoke test.
- No production dependency becomes unavailable at runtime.
- Bundle reduction is optional; correctness and deployment reliability take priority.

## Phase 4 — Final quality verification

- [ ] 4.1 Run the complete test suite: `npm test -- --maxWorkers=1`.
- [ ] 4.2 Run TypeScript: `npm run lint`.
- [ ] 4.3 Run ESLint once Phase 1 is enabled.
- [ ] 4.4 Run production build: `npm run build`.
- [ ] 4.5 Run maintainability check: `npm run maintainability:check`.
- [ ] 4.6 Run formatting/diff validation: `git diff --check`.
- [ ] 4.7 Inspect `git status --short --branch` and ensure no accidental generated files or secrets are included.
- [ ] 4.8 Run safe live smoke checks for the Cloudflare frontend and Railway `/api/health` endpoint. Do not perform destructive or financial actions.
- [ ] 4.9 Add a progress-log entry with changed files, exact command results, remaining caveats, and commit SHA.
- [ ] 4.10 Commit and push each coherent phase to `main`.

## Recommended implementation order

1. Start with Phase 1 and add ESLint without automatic rewriting.
2. Review and classify the initial findings before fixing anything.
3. Implement the logger abstraction and migrate server logs incrementally.
4. Review the backend bundle using a dependency/metafile report.
5. Run the final verification phase and record the results here.

## Do not do these things

- Do not rewrite all files with an automatic formatter or `eslint --fix` without review.
- Do not change Cloudflare/Railway deployment topology.
- Do not alter Firebase session, PIN, wallet, package, check-in, deletion, or commission behavior while doing code-quality work.
- Do not log secrets or sensitive authentication data.
- Do not remove logs before replacing their operational value.
- Do not optimize bundle size by externalizing dependencies unless the deployed runtime is verified.
- Do not mark a checkpoint `[x]` without the specified validation evidence.

## Continuation instructions

1. Read this file and `BUSINESS_LOGIC_FIX_CHECKPOINTS.md` first.
2. Inspect the current branch, status, and latest commit.
3. Work only on the first unchecked checkpoint with satisfied dependencies.
4. Update this file immediately after each verified phase.
5. Add exact commands and outcomes to the progress log.
6. Commit and push only reviewed changes.

## Progress log

### 2026-09-19 — Initial code-quality checkpoint created

- Current quality gates are green: 52 test files, 286 tests, TypeScript, production build, maintainability check, and diff checks.
- `BUSINESS_LOGIC_AUDIT.md` is now tracked documentation in commit `9decb08`.
- Remaining work is intentionally limited to ESLint/static analysis, structured logging, and a safe backend bundle review.
- Next action: begin Phase 1.1 by inspecting the current package/tooling configuration.

### 2026-09-19 — Safety protocol strengthened

- Added explicit baseline, incremental-commit, rollback, secret-handling, and read-only smoke-test requirements.
- Added stop conditions for failed validation and instructions not to weaken tests or silently change business behavior.

### 2026-09-19 — Phase 1 baseline and tooling inspection

- Baseline commit: `bf4a8dd`.
- Confirmed a clean `main` worktree before starting Phase 1.
- Inspected `package.json`, `tsconfig.json`, and `vite.config.ts`; no ESLint configuration or ESLint dependencies currently exist.
- Validation passed: `npm test -- --maxWorkers=1` (**52 test files, 287 tests**), `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`.
- Checkpoint status: **1.1 complete**; next action is to add a minimal compatible ESLint baseline without automatic rewriting.

### 2026-09-19 — Phase 1 ESLint baseline scan

- Added `eslint.config.js` using ESLint flat config, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, and `globals`.
- Added `npm run lint:eslint`; the existing `npm run lint` TypeScript check was preserved.
- Archived migration scripts under `tools/archived-migrations/**` are excluded because they are not maintained application code.
- Ran ESLint without `--fix`: **729 findings across 106 files**; the command exits non-zero by design until findings are reviewed.
- Finding categories: **581** `@typescript-eslint/no-explicit-any`, **68** `@typescript-eslint/no-unused-vars`, **20** `react-hooks/exhaustive-deps`, **14** `preserve-caught-error`, **10** `no-empty`, **8** `react-hooks/set-state-in-effect`, **8** `@typescript-eslint/no-unused-expressions`, plus smaller rule groups.
- No source files were auto-rewritten. The findings are now classified as a baseline for focused follow-up; no ESLint rule was disabled merely to force a green result.
- Checkpoint status: **1.1–1.6 complete; 1.7 and 1.8 remain open** until safe findings are fixed, the command is green, and the production gate is updated deliberately.

### 2026-09-19 — Phase 1 safe cleanup slice

- Corrected seven mechanically safe findings: four unnecessary regular-expression escapes and three `prefer-const` declarations in the auth route, validation, vehicle service, and delegate commission test.
- Targeted regression test passed: `src/__tests__/stage4DelegateCommission.test.ts` (**3 tests**).
- ESLint baseline reduced from **729 to 722 findings**. Remaining `prefer-const` findings are timeout declarations assigned after subscription setup; they require a reviewed control-flow refactor rather than blind replacement.
- The dominant categories remain `no-explicit-any` (**581**), `no-unused-vars` (**68**), and hook/dependency diagnostics; these need semantic review and were not mass-edited.
- Post-cleanup validation passed: `npm test -- --maxWorkers=1` (**52 test files, 287 tests**), `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`.
- Checkpoint status: **1.7 in progress**; `npm run lint:eslint` remains intentionally outside the production gate until the baseline is reduced and the remaining findings are classified or fixed.

### 2026-09-19 — no-unused-vars cleanup

- Baseline at `5450a4a`: **68** `@typescript-eslint/no-unused-vars` findings.
- Added an explicit underscore convention to `eslint.config.js` for intentionally unused compatibility parameters, caught errors, and object-rest exclusion bindings.
- Removed **30** unused catch bindings with line-asserted edits; renamed six intentional security/data-shaping exclusions (`uid`, `role`, `firebaseIdToken`, and PIN fields) to underscore-prefixed bindings without changing payload behavior.
- Re-ran ESLint: **0 remaining `no-unused-vars` findings**. ESLint still reports **653 total findings** from other rule families, so the full ESLint command is not yet green.
- Focused regression validation passed: **6 test files, 34 tests** covering the API client, authentication, session policy, and PIN flows.
- Final full validation after restoring one legitimately used logout error binding passed: `npm test -- --maxWorkers=1` (**52 test files, 287 tests**), `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`.
- Checkpoint status: unused-variable cleanup is complete; Phase 1.7 remains in progress for the remaining safe rule groups, and Phase 1.8 remains open.

### 2026-09-19 — Checkpoint reconciliation after no-unused-vars phase

- Updated the current baseline to merged `main` commit `19b93b9`.
- Marked the `no-unused-vars` sub-phase complete: **68 initial findings reduced to 0**, with focused tests and the full production gate passing.
- Phase 1.7 remains **in progress** because other safe ESLint categories remain; Phase 1.8 remains pending until `npm run lint:eslint` is stable and green.
- Next scheduled cleanup category: review `preserve-caught-error` findings, then continue with other small semantic-safe rule groups.

### 2026-09-19 — preserve-caught-error cleanup

- Reviewed all **14** `preserve-caught-error` findings as intentional error translations or code-preserving rethrows.
- Added `{ cause: caughtError }` to translated `Error` instances while preserving existing messages, error codes, and API behavior across vehicle routes, API client, admin/delegate services, vehicle service, and retry utilities.
- TypeScript validation passed immediately after the edits.
- ESLint findings reduced from **653 to 639**; `preserve-caught-error` residuals are now **0**. The full command remains outside production CI while other categories are reviewed.
- Focused validation passed: **7 test files, 34 tests** covering API, authentication, PIN, delegate, vehicle, and session flows.
- Full validation passed: `npm test -- --maxWorkers=1` (**52 test files, 287 tests**), `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`.

### 2026-09-19 — no-empty and no-unused-expressions cleanup

- Reviewed and resolved **10** intentional `no-empty` catches by documenting their best-effort or fallback behavior; no logging or business behavior was added.
- Rewrote **8** compressed `@typescript-eslint/no-unused-expressions` statements in `GarageDashboardView.tsx` as explicit equivalent control-flow statements.
- Targeted rule residuals: `no-empty` **0**, `@typescript-eslint/no-unused-expressions` **0**.
- ESLint findings reduced from **639 to 621**; remaining findings are in other rule families.
- Focused validation passed: **8 test files, 29 tests** covering garage, vehicle, session, reward, delete, and admin flows.
- Full validation passed: `npm test -- --maxWorkers=1` (**52 test files, 287 tests**), `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`.

### 2026-09-19 — Release smoke deployment-race correction

- The first post-merge quality-phase production gate failed only because the smoke check ran while Railway was still serving the previous commit (`bf4a8dd`) approximately 21 seconds before the new deployment (`dd618e4`) became live; all code-quality checks had already passed.
- Updated `tools/release-smoke.ts` with bounded retry/backoff for transient deployment propagation and health-request races. It still fails when the expected version is not reached after the configured attempts.
- Verified the live release smoke check against Railway and Cloudflare with the current commit: **passed**.
- Verified the mismatch path with two attempts and a one-second delay: it waited, then failed with the expected version diagnostic.

### 2026-09-19 — Checkpoint reconciliation after empty/expression phase

- Updated the current baseline to merged `main` commit `4e86fb2`.
- Marked the `no-empty` and `no-unused-expressions` cleanup complete: **18 findings reduced to 0**, with focused tests, full validation, and the post-merge production gate passing.
- Phase 1.7 remains **in progress**; Phase 1.8 remains pending until the ESLint command is stable and green.
- Next scheduled cleanup category: review the **6 `no-useless-assignment` findings**, then continue with the smaller hook diagnostics.

### 2026-09-19 — no-useless-assignment cleanup

- Reviewed and resolved all **6** `no-useless-assignment` findings without changing business rules, API payloads, authentication/session behavior, financial behavior, or deployment topology.
- Replaced redundant initial assignments with type-only declarations in `src/__tests__/vehicleOperationsScopeEnforcement.test.ts`, `src/components/garage/RechargeHistoryView.tsx`, `src/components/modals/PlateLookupModal.tsx`, `src/domain/garage/subscription.ts`, and `src/hooks/useVehicleOperations.ts`; removed one dead future-start reassignment in `src/utils/index.ts`.
- ESLint verification: **0** `no-useless-assignment` findings; **615** total findings remain, primarily the pre-existing `@typescript-eslint/no-explicit-any` (**580**) and hook diagnostics.
- Focused validation passed: **6 test files, 73 tests** covering vehicle scope, cost utilities, operational resilience, package/subscriber flows, and garage services.
- Full validation passed: `npm test -- --maxWorkers=1` (**52 test files, 287 tests**), `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`.
- Phase 1.7 remains **in progress**. Next scheduled category: review the smaller React Hooks diagnostics; Phase 1.8 remains pending until the complete ESLint command is stable and green.

### 2026-09-19 — safe React Hooks cleanup subset

- Reviewed the remaining React Hooks diagnostics and fixed only mechanically safe findings: unconditional `useId` ordering in `BorderShimmer`, direct default-value initialization in `useLocalStorage`, declaration ordering for subscription prices in `useGarageApp`, and redundant memo dependencies in `AdminDelegateDetailsView`.
- This slice removed the `react-hooks/rules-of-hooks`, `react-hooks/immutability`, and `react-hooks/refs` findings addressed above, plus two redundant dependency findings; no business behavior, API contract, authentication/session behavior, financial behavior, or deployment topology changed.
- Focused validation passed: **8 test files, 31 tests**. TypeScript validation passed. The full suite passed **52 test files, 287 tests**.
- Production build passed on a standalone retry; the combined 120-second validation wrapper ended during the build before completion, so the build was re-run with a longer bounded window and completed successfully. Maintainability check and `git diff --check` passed.
- React Hooks findings remain under review: **28** total (`exhaustive-deps` **18**, `set-state-in-effect` **9**, `purity` **1**). The remaining findings require semantic decisions and are not being mass-edited.
- Next action: commit and push this verified safe subset, then continue only with individually reviewed hook findings.

### 2026-09-19 — dependency-only React Hooks cleanup

- Removed two unnecessary `react-hooks/exhaustive-deps` dependencies from `useGarageSubscription` and `useAdminAndGarageManagement`, preserving the callback inputs as explicitly named compatibility exclusions.
- Targeted validation passed: TypeScript, zero Hook or unused-variable findings in both edited files, and **6 test files / 21 tests**.
- Full validation passed: **52 test files, 287 tests**, `npm run lint`, production build, `npm run maintainability:check`, and `git diff --check`.
- React Hooks remain under review with **28** findings (`exhaustive-deps` **18**, `set-state-in-effect` **9**, `purity` **1**); only individually understood findings will be changed next.

### 2026-09-19 — PackagesModal dependency stabilization

- Memoized the normalized `allPackages` value in `src/components/modals/PackagesModal.tsx`, removing the unstable dependency warning without changing package filtering or selection behavior.
- Focused package regressions passed: **2 test files, 9 tests**. The edited file has no remaining React Hooks warnings; its four remaining ESLint findings are pre-existing `no-explicit-any` errors.
- Full validation passed: **52 test files, 287 tests**, TypeScript, production build, maintainability check, and `git diff --check`.
- Current ESLint Hook findings: **25** total (`exhaustive-deps` **15**, `set-state-in-effect` **9**, `purity` **1**). Phase 1.7 remains in progress; Phase 1.8 remains pending until the complete ESLint command is stable and green.

### 2026-09-19 — RegistrationCard ref dependency stabilization

- Added the stable `plateInputRef` object to the input synchronization effect dependency list in `src/components/garage/RegistrationCard.tsx`; runtime behavior is unchanged because the ref identity is stable.
- Targeted ESLint and TypeScript validation passed with no findings in the edited file.
- Full validation passed: **52 test files, 287 tests**, production build, maintainability check, and `git diff --check`.
- Current ESLint Hook findings: **24** total (`exhaustive-deps` **14**, `set-state-in-effect` **9**, `purity` **1`). Phase 1.7 remains in progress; Phase 1.8 remains pending until the complete ESLint command is stable and green.

### 2026-09-19 — GarageDashboard announcement dependency stabilization

- Extracted `garageId` before the announcement subscription effect in `src/components/garage/GarageDashboardView.tsx`, replacing the complex optional-chain dependency with the equivalent stable scalar dependency.
- The effect’s two React Hooks warnings are resolved; the file’s remaining warnings concern separate countdown/trial semantics, and its existing `no-explicit-any` errors were not changed.
- Full validation passed: **52 test files, 287 tests**, TypeScript, production build, maintainability check, and `git diff --check`.
- Current ESLint Hook findings: **22** total (`exhaustive-deps` **12**, `set-state-in-effect` **9**, `purity` **1`). Phase 1.7 remains in progress; Phase 1.8 remains pending until the complete ESLint command is stable and green.

### 2026-09-19 — AdminRequestsView auto-switch dependency correction

- Added `requestSubTab` to the auto-switch effect dependencies in `src/components/admin/AdminRequestsView.tsx`, preserving the existing condition while ensuring the effect responds when the user changes tabs.
- The missing `exhaustive-deps` warning is resolved. The same effect still has the pre-existing `set-state-in-effect` warning because it intentionally changes the tab state from an effect; that behavior was not refactored in this safe slice.
- Full validation passed: **52 test files, 287 tests**, TypeScript, production build, maintainability check, and `git diff --check`.
- Current ESLint Hook findings: **21** total (`exhaustive-deps` **11**, `set-state-in-effect` **9**, `purity` **1`). Phase 1.7 remains in progress; Phase 1.8 remains pending until the complete ESLint command is stable and green.

### 2026-09-19 — RechargeHistoryView resolver dependency stabilization

- Wrapped `resolvePackagePrice` in `useCallback` with the package catalog as its dependency, stabilized the catalog fallback, and declared the resolver in the `displayLogs` memo dependencies in `src/components/garage/RechargeHistoryView.tsx`.
- The resolver’s React Hooks warning is resolved without changing package-price fallback logic.
- Full validation passed: **52 test files, 287 tests**, TypeScript, production build, maintainability check, and `git diff --check`.
- Current ESLint Hook findings: **20** total (`exhaustive-deps` **10**, `set-state-in-effect` **9**, `purity` **1`). Phase 1.7 remains in progress; Phase 1.8 remains pending until the complete ESLint command is stable and green.
