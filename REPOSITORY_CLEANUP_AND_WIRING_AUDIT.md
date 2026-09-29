# Repository Cleanup and Frontend–Backend Wiring Audit

**Date:** 2026-09-25
**Branch:** `main`
**UI/UX boundary:** preserve the existing screens, visual design, navigation, and user flows by default. The owner has explicitly approved the product/UI changes in commits `726160c`, `08574c1`, `0d848da`, and `3ea0d86`; those changes are now treated as intentional requirements rather than unauthorized redesign.

## Conclusion

The checkpointed recovery plan remains necessary, but it should be executed as a **wiring and authority repair around the owner-approved product direction**, not as an unrequested rewrite. The app has a functioning React/Vite frontend, Express/Railway backend, Firebase Auth/Firestore integration, production deployment configuration, and a passing automated baseline.

The dominant confirmed defect is not missing UI. It is that some protected state transitions still have browser Firestore write paths while the backend also owns the same authority. The repair should preserve the owner-approved UI workflows while changing the service implementation beneath them to use the existing API authority.

### Delegate dashboard wiring repair — 2026-09-27

The delegate dashboard's garage and recharge-request list listeners were not permitted by the deployed Firestore rules: delegates may read their own document, but collection `list` access for `garages` and `recharge_requests` is intentionally restricted. The listeners therefore failed and left the dashboard's garage count, pending count, and commission inputs empty/zero.

The existing UI was preserved. A scoped `GET /api/delegates/dashboard` endpoint now reads the authenticated delegate's own record, garages created/referred by that delegate, and recharge requests through the server Admin SDK. The frontend refreshes this read model on entry and every 15 seconds, and no longer starts the denied browser list listeners. The endpoint derives scope from the authenticated session and does not accept a client-supplied delegate ID.

### Partner calculator financial wiring repair — 2026-09-28

The partner calculator no longer treats cumulative garage aggregates as the current month's actual revenue. Its actual mode requests the existing admin-only financial report for the current UTC calendar month and uses the authoritative `cashCollectedTotal` value. The simulation mode remains local and configurable. Both modes are explicitly presented as estimates; the component is not a partner ledger, settlement engine, or accounting source of truth. The payout cards were extracted into `PartnerDividendPayouts.tsx` without changing the surrounding navigation or visual workflow.

### Admin enhancement review — 2026-09-29

The latest admin navigation, modal presentation, trial-lead labels, and system-settings enhancements were reviewed against the existing role workflows. TypeScript and focused UI tests passed. One confirmed business-logic inconsistency was corrected: the newly selected 250 EGP monthly-subscriber flat-fee fallback default was aligned across the hook, admin settings save path, public system-config fallback, and server update fallback so a missing or invalid value cannot silently revert to 500 EGP. The persisted system setting remains editable and continues to override this fallback. No protected write authority or financial transaction path was changed.

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

The deterministic benchmark is retained because `PERFORMANCE_BENCHMARK_2026-09-18.md` records its output and it remains useful for future comparisons. It is now exposed as the explicit `npm run benchmark` command rather than being an untracked tool.

### Unused exports

Knip still reports unused exports and types. These are not automatically dead code: many are compatibility boundaries, test helpers, public service objects, or future adapter contracts. The unused server app default export and unused Firebase Admin config export were removed in this pass; the remaining symbols require per-symbol review and are not safe bulk-deletion candidates.

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

The frontend uses Firestore listeners and reads for display synchronization across garages, vehicles, subscribers, staff, delegates, supervisors, packages, activity logs, announcements, and configuration. This can remain if the rules allow the read and the data is treated as a read model, not an authorization decision. Delegate-scoped garage and recharge-request lists are now the explicit exception: they use the server dashboard read because Firestore list rules correctly deny those queries.

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
