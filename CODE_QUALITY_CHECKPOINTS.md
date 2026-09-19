# RQ- Code Quality Checkpoints

**Purpose:** Durable continuation plan for the remaining code-quality work identified after the business-logic audit.

**Repository:** `tarekhamada875-droid/RQ-`
**Production architecture:** Cloudflare Pages frontend + Railway backend
**Current baseline:** `9decb08` (`docs: record repository quality gate status`)
**Status:** In progress

## Important context

The repository is currently operationally healthy and regression-safe. The complete test suite passed with **52 test files and 286 tests**. TypeScript validation, the production frontend/backend build, the maintainability check, and `git diff --check` also passed.

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

- [ ] 1.1 Inspect `package.json`, `tsconfig.json`, and the existing TypeScript/Vite configuration before adding tooling.
- [ ] 1.2 Add ESLint using versions compatible with the current Node/npm setup and TypeScript/React codebase.
- [ ] 1.3 Add a minimal, non-destructive baseline configuration first. Do not enable aggressive stylistic rules or automatic rewrites initially.
- [ ] 1.4 Include TypeScript and React hooks rules where compatible with the current project.
- [ ] 1.5 Add an explicit `npm run lint:eslint` script. Preserve the existing `npm run lint` TypeScript check unless a deliberate combined script is documented.
- [ ] 1.6 Run ESLint in report-only/fix-free mode first and classify findings into real defects, safe cleanup, and intentional exceptions.
- [ ] 1.7 Fix only safe findings in focused commits. Do not mass-run `eslint --fix` over the whole repository without reviewing the diff.
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
