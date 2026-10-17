# JARVIS Modernization — Remaining Work

**Last verified:** 2026-10-17
**Source of truth:** [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](./RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md)
**Application release baseline:** Deployed application code remains PR #77 / `d5a42ba`; PR #76 fixed the FS-03 timestamp-type mismatch and PR #77 fixed the WKR-02 last-subscriber counter. PRs #78–#81 were documentation-only; PR #81 recorded the prepaid-credit plan at `a9719ad`, and its Production Gate and Worker deployment passed. Re-check current `main` and open PRs before working.
**Next task:** **FS-02** (do not begin until the owner says to continue)

This is a navigation summary, not a replacement for the full roadmap. The full plan contains detailed source references, compatibility requirements, acceptance criteria, tests, risks, rollout rules, measurements, and the new owner-approved prepaid-credit workstream.

## Recently completed

### CI Markdown-only fast path and protected main (merged PR #84)

The Production Gate now keeps the required `verify` check while running only `git diff --check` for Markdown-only diffs; unknown or non-Markdown changes fail closed to the full gate. The Worker deploy workflow ignores Markdown-only pushes. Main ruleset #25292182 requires PRs and `verify`, requires branches up to date, blocks force-push/deletion, and has no bypass actors. PR checks and post-merge Production Gate/Worker deployment passed; live Pages, Worker health, and version endpoints returned HTTP 200. No application code or Firebase data/rules changed. A follow-up documentation-only PR exercises the fast path end-to-end.

### FS-03 — Bound financial reports and aggregate page by page (implemented; PR #73)

The owner selected a rolling latest-12-calendar-month default for undated reports; explicit date ranges remain available for older history. Partial date ranges are bounded as well. Worker queries use stable timestamp/document-name cursors and page size 250; settlements are aggregated first, followed by events, with no full ledger arrays retained. Inclusive-start/exclusive-end semantics and delegate filtering are preserved.

A post-review fix in PR #76 changed event-range bounds to ISO strings to match the persisted `occurredAt` field; settlement timestamps remain Date/Timestamp values. Focused parity/cursor/type regressions passed. The full CI and release gates passed, and live Pages/Worker health and version checks returned HTTP 200. The synthetic benchmark in the full roadmap is not live Firestore billing or Worker/network p95. No production data was changed.

## Remaining implementation tasks

### 1. FS-02 — Add Worker cursor/page-token support and bound lists

Add stable ordering and encoded last-value/document-name cursors to the Worker adapter. Return `items`, `hasMore`, and `nextCursor` with default/max page sizes. Migrate garages, recharge requests, admin delegates, and delegate child lists while preserving filters, scopes, and compatibility fields. Prove no duplicates/skips at page boundaries and remove unbounded reads from migrated endpoints.

### 2. WKR-04 — Bound and stream the Node Fetch adapter

Stop consuming GET/HEAD request bodies, enforce a configurable body limit for write methods including chunked-body byte counting, and stream `response.body` to Node where supported. Preserve headers, status, Fetch behavior, and the buffered fallback. Add oversized-body, byte-equality, concurrency, and health tests.

### 3. BILL-01 through BILL-08 — Replace time-based RQ access with prepaid credits (owner-approved direction; Admin-direct-grant flow clarified 2026-10-17; not implemented)

After the remaining Phase 3 work above, replace expiring RQ garage-access plans with manually granted, non-expiring credits, before general domain cleanup and decomposition. Keep the garage’s own date-based monthly parking memberships. Confirmed direction: one credit costs 1 EGP; a successful regular non-subscriber entry consumes one credit; a successful monthly parking-subscriber renewal consumes five credits once; subscriber visits do not use per-entry credits; the three free mistake/correction events are shared across the garage’s staff per Cairo day. The Admin package editor remains as an Admin-only template catalog for credit quantity and price. After manual payment confirmation, Admin directly grants the selected quantity; garage owners do not purchase packages or top up an EGP wallet to activate them.

The full plan breaks this into a contract/migration decision gate, auditable integer-credit ledger, Admin-only credit templates and direct grants, atomic entry charging, subscriber renewal charging, balance/history UI without owner checkout, separate money-versus-credit reporting, and a tested cutover that retires the old RQ expiry and owner-purchase flow. Before implementation, resolve zero-credit behavior, insufficient-credit renewals, active-plan migration, disposition of legacy EGP wallet balances, mistake definitions/post-limit behavior, corrections/refunds, discounts/bonuses, and whether daily vehicle capacity remains a separate limit. No app code or customer data has changed as part of the roadmap update.

### 4. UI-001 — Move route and overlay ownership out of App

Introduce typed garage/admin route containers and reduce App to authentication/session gates, route choice, back trapping, and a small action model. Preserve route names, browser-back behavior, RTL/LTR behavior, custom plate input, pagination, callbacks, and mount/unmount semantics. Target no more than 15 direct App bindings, 8 route-boundary props, and 300 App lines, with render-count and route-contract tests.

### 5. F2 — Make reconciliation day-safe

Make the pure reconciliation reducer filter valid events by the Cairo date key for `today`, even when called with wider or malformed input arrays. Keep range optimization and clarify `totalRecordedEvents` semantics. Cover previous/next-day, missing, invalid, and non-date timestamps and ensure daily projection/reconciliation parity.

### 6. F3 — One unlimited-package classifier (reassess under BILL-01)

Do not apply the legacy duration/capacity classifier to prepaid credit bundles. BILL-01 must decide whether daily vehicle capacity stays as a separate operational limit; retain and test that rule separately if it does, otherwise mark the corresponding legacy package behavior superseded at cutover.

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
3. **BILL-01 through BILL-08** — prepaid-credit product decisions and staged implementation; no billing code before the decision gate.
4. **F2 and the BILL-01-qualified scope of F3** — domain consistency repairs.
5. **RQ-TG-01 through RQ-TG-06** — release-gate consolidation.
6. **UI-001, WKR-05/Cross-F1, Cross-F2, Cross-F3** — incremental decomposition, one bounded PR at a time.

## Standing completion workflow

For every item: read the relevant full-plan block; verify GitHub and the working tree; work on one bounded task; run focused tests and the full repository gates; update the roadmap and handoff; commit; push; open a PR into `main`; wait for the Production Gate; merge after required checks pass; verify the merged commit and post-merge workflows; then stop and report the completed task. Do not start the next item until the owner says to continue.
