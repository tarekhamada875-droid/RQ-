# JARVIS Modernization — Remaining Work

**Last verified:** 2026-10-16  
**Source of truth:** [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](./RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md)  
**Repository state:** Roadmap work through WKR-02 is merged into `main`; FS-03 is implemented and tested on branch `feat/fs-03-bounded-financial-reports` in PR [#73](https://github.com/tarekhamada875-droid/RQ-/pull/73), awaiting required GitHub checks and merge.
**Next task after FS-03 completes:** **FS-02**

This is a navigation summary, not a replacement for the full roadmap. The full plan contains the detailed source references, compatibility requirements, acceptance criteria, tests, risks, rollout rules, and measurement plan.

## Remaining implementation tasks

### FS-03 — Bound financial reports and aggregate page by page (implemented; PR #73)

The owner selected a rolling latest-12-calendar-month default for undated reports; explicit date ranges remain available for older history. Partial date ranges are bounded as well. Worker queries now use stable timestamp/document-name cursors and page size 250; settlements are aggregated first, followed by events, with no full ledger arrays retained. Inclusive-start/exclusive-end semantics and delegate filtering are preserved.

Focused parity and cursor contract tests passed. `npm run ci:check` passed (125 test files / 807 tests, TypeScript, Pages/Worker builds and artifact checks); maintainability and whitespace checks passed. The synthetic `npm run financial-report:benchmark` recorded: 1y = 1,616 modeled reads / 1.716 ms local p95 / 185,680-byte peak heap growth; 3y = 4,824 / 1.645 ms / 325,288 bytes; 10y = 16,064 / 4.637 ms / 332,648 bytes (25 runs, page size 250). These are synthetic local aggregation/heap measurements, not live Firestore billing or Worker/network p95. PR #73 is open and awaiting GitHub checks; no production data was changed.

### 2. FS-02 — Add Worker cursor/page-token support and bound lists

Add stable ordering and encoded last-value/document-name cursors to the Worker adapter. Return `items`, `hasMore`, and `nextCursor` with default/max page sizes. Migrate garages, recharge requests, admin delegates, and delegate child lists while preserving filters, scopes, and compatibility fields. Prove no duplicates/skips at page boundaries and remove unbounded reads from migrated endpoints.

### 3. WKR-04 — Bound and stream the Node Fetch adapter

Stop consuming GET/HEAD request bodies, enforce a configurable body limit for write methods including chunked-body byte counting, and stream `response.body` to Node where supported. Preserve headers, status, Fetch behavior, and the buffered fallback. Add oversized-body, byte-equality, concurrency, and health tests.

### 4. UI-001 — Move route and overlay ownership out of App

Introduce typed garage/admin route containers and reduce App to authentication/session gates, route choice, back trapping, and a small action model. Preserve route names, browser-back behavior, RTL/LTR behavior, custom plate input, pagination, callbacks, and mount/unmount semantics. Target no more than 15 direct App bindings, 8 route-boundary props, and 300 App lines, with render-count and route-contract tests.

### 5. F2 — Make reconciliation day-safe

Make the pure reconciliation reducer filter valid events by the Cairo date key for `today`, even when called with wider or malformed input arrays. Keep range optimization and clarify `totalRecordedEvents` semantics. Cover previous/next-day, missing, invalid, and non-date timestamps and ensure daily projection/reconciliation parity.

### 6. F3 — One unlimited-package classifier

Create one pure classifier for explicit unlimited flags, capacity, names, legacy variants, and numeric-string fields. Use it consistently in package catalog, vehicle check-in, and fair-use paths. Establish precedence for conflicting fields before changing behavior and cover the full compatibility matrix.

### 7. RQ-TG-01 through RQ-TG-06 — Release reliability

- **RQ-TG-01:** one canonical verification job/install/full suite with artifact upload and no redundant subscriber rerun.
- **RQ-TG-02:** immutable verify → deploy → smoke DAG tied to the exact commit/artifact, including rollback identity.
- **RQ-TG-03:** replace the weak grep health check with strict JSON/status/adminSdk/version/frontend smoke validation.
- **RQ-TG-04:** pin Firebase CLI and align local rules checks with CI.
- **RQ-TG-05:** smoke the built Worker artifact, not only source modules.
- **RQ-TG-06:** make local CI fail fast while retaining an explicit diagnostic mode.

### 8. WKR-05 / Cross-F1 — Extract Worker route modules mechanically

Add typed route dependencies and extract route families one at a time from `server/cloudflareWorker.ts`: read/system, vehicle, subscriber, financial/recharge/delegate, and garage. Preserve middleware, aliases, order, envelopes, authentication, idempotency, rate limits, and the exact 87-route inventory. This is a reviewability/decomposition task, not a performance claim.

### 9. Cross-F2 — Split adminService behind its unchanged facade

Move method bodies into domain-sized modules while preserving the `firestoreService` key set, method names, return types, listener cleanup, callback timing, pagination, and transport semantics. Keep callers unchanged during the first decomposition PR and verify system-config call-count behavior.

### 10. Cross-F3 — Group the useGarageApp contract before migrating App

Add renderHook characterization for session readiness, offline gating, fallback views, forwarding, and cleanup. Return stable groups for session, navigation/UI, garage data, vehicle operations, subscriptions, and admin management. Temporarily retain flat aliases, then migrate App only after the transition matrix passes.

## Recommended order

1. **FS-02** — shared cursor/page-token adapter support and remaining bounded lists.
2. **WKR-04** — request/response body and streaming bounds.
3. **F2 and F3** — domain consistency repairs.
4. **RQ-TG-01 through RQ-TG-06** — release-gate consolidation.
5. **UI-001, WKR-05/Cross-F1, Cross-F2, Cross-F3** — incremental decomposition, one bounded PR at a time.

## Standing completion workflow

For every item: read the relevant full-plan block; verify GitHub and the working tree; work on one bounded task; run focused tests and the full repository gates; update the roadmap and handoff; commit; push; open a PR into `main`; wait for the Production Gate; merge after required checks pass; verify the merged commit and post-merge workflows; then stop and report the completed task. Do not start the next item until the owner says to continue.
