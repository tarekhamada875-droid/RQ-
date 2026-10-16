# JARVIS Modernization — Remaining Work

**Last verified:** 2026-10-16  
**Source of truth:** [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](./RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md)  
**Repository state:** The roadmap work through WKR-02 is merged into `main` and its guarded Production Gate and Worker deployment passed.  
**Next task:** **FS-03**

This is a navigation summary, not a replacement for the full roadmap. The full plan contains the detailed source references, compatibility requirements, acceptance criteria, tests, risks, rollout rules, and measurement plan.

## Remaining implementation tasks

### 1. FS-03 — Bound financial reports and aggregate page by page

**Next task.** The no-date financial report currently materializes all event and settlement history. Define the owner-approved no-date behavior (bounded default window or explicit date validation), then aggregate events and settlements page by page with cursors without retaining all arrays. Preserve inclusive-start/exclusive-end boundaries and delegate filtering. Add exact multi-page parity tests and 1/3/10-year read, CPU, memory, and p95 measurements. Keep an explicit historical/rebuild path.

**Important decision:** The default no-date report behavior must be explicitly chosen and recorded before implementation changes the finance contract.

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

1. **FS-03** — financial report contract and page-bounded aggregation.
2. **FS-02** — shared cursor/page-token adapter support and remaining bounded lists.
3. **WKR-04** — request/response body and streaming bounds.
4. **F2 and F3** — domain consistency repairs.
5. **RQ-TG-01 through RQ-TG-06** — release-gate consolidation.
6. **UI-001, WKR-05/Cross-F1, Cross-F2, Cross-F3** — incremental decomposition, one bounded PR at a time.

## Standing completion workflow

For every item: read the relevant full-plan block; verify GitHub and the working tree; work on one bounded task; run focused tests and the full repository gates; update the roadmap and handoff; commit; push; open a PR into `main`; wait for the Production Gate; merge after required checks pass; verify the merged commit and post-merge workflows; then stop and report the completed task. Do not start the next item until the owner says to continue.
