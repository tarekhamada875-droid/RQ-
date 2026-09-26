# Repository Cleanup and Frontend–Backend Wiring Audit

**Date:** 2026-09-25  
**Branch:** `chore/repository-cleanup-wiring-audit`  
**UI/UX boundary:** preserve the existing screens, visual design, navigation, and user flows; this audit does not add or remove product features.

## Conclusion

The checkpointed recovery plan is necessary, but it should be executed as a **wiring and authority repair**, not as a redesign or rewrite. The app has a functioning React/Vite frontend, Express/Railway backend, Firebase Auth/Firestore integration, production deployment configuration, and a passing automated baseline.

The dominant confirmed defect is not missing UI. It is that some protected state transitions still have browser Firestore write paths while the backend also owns the same authority. The repair should keep the UI calls and visual behavior stable while changing the service implementation beneath them to use the existing API authority.

## Baseline verified before cleanup

- Repository was synchronized at `a8096b5` before this cleanup branch.
- `npm test -- --run`: 75 files / 423 tests passed.
- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build`: passed.
- `npm run maintainability:check`: passed.
- `git diff --check`: passed.
- Live topology remains Cloudflare Pages → Railway Express → Firebase.

## Safe cleanup completed on this branch

### Removed unused package dependencies

Knip reported these packages as unused, and repository/build configuration searches confirmed they are not imported or required:

- `postcss-preset-env`
- `zod`
- `@babel/core`
- `@babel/generator`
- `@babel/parser`
- `@babel/traverse`

The configured Vite PostCSS pipeline uses Tailwind, `@csstools` plugins, and Autoprefixer directly. No application source or UI component was changed.

### Documentation routing cleanup

The following active guidance was corrected to point to the canonical checkpoint plan rather than a missing `BACKEND_COMPLETE_OVERHAUL_STAGES.md` or `BACKEND_OVERHAUL_HANDOFF.md`:

- `AGENTS.md`
- `README.md`
- `MAINTAINABILITY_HANDOFF.md`
- `RAILWAY_DEPLOYMENT_HANDOFF.md`

The following older documents were marked **historical/superseded** rather than deleted, so audit evidence is preserved without confusing future agents:

- `PROJECT_CONTINUATION_BRIEF.md`
- `RQ_PRODUCTION_READINESS_PLAN_2026-09-25.md`
- `CODE_QUALITY_CHECKPOINTS.md`

`V3_BACKEND_PLAN.md` remains the architectural guide, but its continuation packet now points to the current SHA and the canonical checkpoint plan.

### Confirmed dead-code cleanup checkpoint — 2026-09-26

After a fresh Knip/source-reference audit, the following high-confidence leftovers were removed:

- `api/package.json`, an orphan nested package containing only a CommonJS marker with no active `api/` implementation or deployment reference;
- `src/utils/formatters.ts`, a one-function wrapper used only by `hardeningPlan.test.ts`; the test now imports the canonical `normalizeDigits` implementation from `src/utils/index.ts`;
- the unused browser Firebase Functions initialization and `functions` export from `src/firebase.ts`.

Knip still reports `tools/performance-benchmark.ts` and several unused exports/types. Those remain intentionally retained: the benchmark produced documented evidence, while the exports include compatibility boundaries, test contracts, dynamic UI entrypoints, and future adapter types. They require separate per-symbol review and are not safe bulk-deletion candidates.

## What was intentionally retained

### UI and UX source

No component, route, style, icon, layout, modal, navigation path, or user-facing feature was deleted or redesigned. A source-graph tool flags many test files and some root components as “unreferenced” because tests and dynamically selected React components are not imported like ordinary library modules. That result is not proof of dead product code.

### `tools/performance-benchmark.ts`

Knip reports this tool as unused by package scripts. It is retained because `PERFORMANCE_BENCHMARK_2026-09-18.md` records its output and it remains a useful deterministic benchmark. It should only be removed or moved after the benchmark evidence is deliberately archived and no release process needs it.

### Unused exports

Knip reports unused exports and types. These are not automatically dead code: many are compatibility boundaries, test helpers, public service objects, or future adapter contracts. They require per-symbol review and are not part of safe repository cleanup.

## Confirmed wiring map

### Commands already use the backend

The frontend sends protected commands through `src/api/apiClient.ts` to the Railway API, including:

- vehicle check-in, checkout, and deletion;
- subscriber add, renew, update, and delete;
- garage create, update, delete, and reconciliation;
- recharge, subscription, and manual-credit operations;
- staff, delegate, supervisor, package, announcement, coupon, and system configuration mutations;
- financial reports and authentication/session API operations.

The API client correctly attaches Firebase ID tokens, correlation IDs, operation IDs, and the canonical session header where available.

### Display reads/listeners remain in Firestore

The frontend uses Firestore listeners and reads for display synchronization across garages, vehicles, subscribers, staff, delegates, supervisors, packages, activity logs, announcements, and configuration. This can remain if the rules allow the read and the data is treated as a read model, not an authorization decision.

### Confirmed browser write paths requiring the next wiring slice

1. `src/services/garageService.ts:273-300` — `claimOrRefreshGarageSession` runs a browser Firestore transaction that writes `garages.currentSessionId`, `garages.lastActive`, and `garage_sessions`.
2. `src/services/authService.ts:148-157` — `updateSession` writes a session heartbeat directly from the browser.
3. `src/services/authService.ts:207-223` — supervisor and staff session heartbeat helpers write directly from the browser.
4. `src/services/authSessionService.ts:116-164` — client transaction and batch fallbacks still claim, release, and refresh security/session documents after or around server calls.

These are the first implementation targets because they can produce two authorities for the same session state. The UI should continue calling the same service methods; the service methods should be rewired to the existing server session APIs, with compatibility behavior retained only when it is proven safe and explicitly tested.

## Next implementation order

1. Create/verify staging separation before authenticated behavior changes.
2. Add focused tests around the session service contract and current UI call sites.
3. Rewire one session operation at a time to server authority.
4. Run the existing session/auth regression suite and the full gate.
5. Verify no visual snapshots, component structure, routes, or UX states changed.
6. Continue with manual-credit route integration coverage, then vehicle policy and remaining capability checkpoints.

## Cleanup rules for future agents

- Do not delete files only because a static graph says they are unreferenced.
- Do not delete historical plans; mark them superseded and link the canonical plan.
- Do not remove compatibility code until production data and migration evidence prove it is safe.
- Do not change UI/UX while repairing transport, service, API, or backend authority.
- Do not expand production MCP tools beyond safe diagnostics during this work.

## Validation after cleanup

The dependency and documentation cleanup must pass the same universal gate as source changes:

```bash
npm test -- --run
npm run lint
npm run build
npm run maintainability:check
git diff --check
```
