# JARVIS Modernization — Remaining Work

**Last verified:** 2026-10-17

**Source of truth:** [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](./RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md)

**Latest code-bearing commit:** `fa5fa33` (PR #88, WKR-04). The only application-code change there is the local Node/Vite adapter; production Worker/API behavior, Firebase data, rules, and settings were not changed by WKR-04. The guarded Worker workflow and post-deploy health smoke passed. Later commits may update documentation only. Re-check current `main` and open PRs before working.

**Next task:** **BILL-01 — finalize the prepaid-credit contract and cutover policy (decision gate). Do not begin until the owner says to continue.**

This is a navigation summary, not a replacement for the full roadmap. The full plan contains source references, compatibility requirements, tests, risks, rollout rules, and detailed billing acceptance criteria.

## Recently completed

### CI Markdown-only fast path and protected main (merged PR #84)

The Production Gate keeps the required `verify` check while running `git diff --check` only for Markdown-only diffs; unknown or non-Markdown changes fail closed to the full gate. The Worker deploy workflow ignores Markdown-only pushes. Main ruleset #25292182 requires PRs and `verify`, requires branches up to date, blocks force-push/deletion, and has no bypass actors. PR and post-merge checks passed. Documentation-only PR #85’s Markdown gate and initial-push full gate both passed. No application code or Firebase data/rules changed.

### FS-03 — Bound financial reports and aggregate page by page (implemented; PR #73)

Undated reports default to the owner-selected latest 12 calendar months; explicit older date ranges remain supported. Partial date ranges are bounded. Worker queries use stable timestamp/document-name cursors and page size 250; settlements are aggregated first, followed by events, with no full ledger arrays retained. Inclusive-start/exclusive-end semantics and delegate filtering are preserved. PR #76 corrected event-range bounds to match the stored ISO-string `occurredAt` type. Tests, full CI, release gates, and live health/version checks passed. Synthetic benchmarks are not live Firestore billing or Worker/network p95; no production data was changed.

### FS-02 — Bound Worker lists with cursor pagination (merged and deployed; PR #86)

Worker list routes use scope-bound cursors (30-minute expiry), stable timestamp/document-name ordering, and 50-item pages capped at 100 plus one sentinel. Admin garage/delegate/request and delegate dashboard callers expose explicit continuation. Compatibility arrays, authorization, and filters are preserved. Four required Firestore composite indexes were deployed and verified `READY`; two pre-existing indexes were preserved. PR #86 merged at `1b6f1ca`; PR, post-merge Production Gate, Worker deployment, and live Pages/Worker health/version checks passed. No rules or data were changed.

### WKR-04 — Bound and stream the Node Fetch adapter (merged; PR #88)

The local Node/Vite adapter no longer iterates GET/HEAD request bodies. Other methods use a 1 MiB default request cap, configurable with `RQ_NODE_ADAPTER_MAX_BODY_BYTES` or the `maxRequestBodyBytes` option. It checks declared Content-Length early, counts actual bytes for chunked bodies, and returns HTTP 413 when over the limit. Fetch response bodies stream through Node’s Web-stream bridge and `pipeline` when available; the buffered fallback, app injection, response status, and headers remain supported.

Tests cover direct and real-HTTP GET/HEAD bodies, exact-limit and oversized Content-Length/chunked requests, the environment override, response byte equality, buffered fallback, four concurrent 256 KiB responses, and the local health path. `npm run ci:check` passed with 127 test files / 830 tests, including TypeScript, Firestore rules emulator tests, production Pages/Worker build, and artifact verification; `npm run maintainability:check` and diff checks passed. PR gate [#39014085759](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014085759), initial-push gate [#39014081978](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014081978), post-merge Production Gate [#39014289983](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014289983), and guarded Worker deployment plus health smoke [#39014289997](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39014289997) passed. No latency or memory benchmark was run, so the resource benefit is expected, not measured. WKR-04 does not alter production Worker behavior or Firebase data/rules/settings.

## Remaining implementation tasks

### 1. BILL-01 — Finalize the prepaid-credit contract and cutover policy (decision gate)

The owner-approved direction is non-expiring prepaid RQ credits at 1 EGP per credit: one credit for each successful regular non-subscriber entry; five credits once for a successful monthly parking-subscriber renewal; no per-visit subscriber debit; and three free mistake/correction events per garage per Cairo day, shared across staff. Admin confirms offline payment and directly grants credits; garage owners do not purchase packages. The garage’s own monthly parking memberships stay date-based.

**Referral rewards are now decided:** once the referred garage receives its first Admin-confirmed paid credit grant, award its referrer 20 non-expiring referral credits—usable for 20 successful regular non-subscriber entries only. Do not award for unpaid/complimentary grants, self-referrals, or later grants to the same referred garage; referral credits cannot pay monthly subscriber renewals. Preserve a distinct, auditable, one-time reward record. Existing day-based referral rewards remain unchanged until the tested cutover.

Before billing code or cutover, resolve zero-credit check-ins, insufficient-credit subscriber renewals, which actions count as mistakes and what happens after the shared allowance, active time-plan migration, legacy EGP wallet balances, correction/refund accounting, discounts/bonuses, whether daily vehicle capacity remains a separate limit, and whether paid credits or referral credits are used first for eligible regular entries. The full decision worksheet is in the BILL-01 section of [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](./RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md). BILL-02 through BILL-08 are staged behind this decision gate; no billing code, schema migration, data migration, or customer-facing cutover has started or is authorized.

### 2. F2 — Make reconciliation day-safe

Make the pure reconciliation reducer filter valid events by the Cairo date key for `today`, even when called with wider or malformed input arrays. Keep range optimization and clarify `totalRecordedEvents` semantics. Cover previous/next-day, missing, invalid, and non-date timestamps and ensure daily projection/reconciliation parity.

### 3. F3 — One unlimited-package classifier (reassess under BILL-01)

Do not apply the legacy duration/capacity classifier to prepaid credit bundles. BILL-01 must decide whether daily vehicle capacity stays a separate operational limit; retain and test it if it does, otherwise mark the corresponding legacy package behavior superseded at cutover.

### 4. RQ-TG-01 through RQ-TG-06 — Release reliability

RQ-TG-01 consolidates verification/install/suite and artifact upload; RQ-TG-02 ties verify → deploy → smoke to the exact commit/artifact and rollback identity; RQ-TG-03 strengthens health checks; RQ-TG-04 pins Firebase CLI and aligns local rules checks; RQ-TG-05 smokes the built Worker artifact; RQ-TG-06 makes local CI fail fast while retaining diagnostic mode.

### 5. UI-001, WKR-05 / Cross-F1, Cross-F2, and Cross-F3 — Incremental decomposition

Move route/overlay ownership out of `App`; extract Worker route families mechanically while preserving route inventory and contracts; split `adminService` behind its unchanged facade; and group the `useGarageApp` contract before migrating `App`. Keep each as a separately tested, bounded PR.

## Recommended order

1. **BILL-01** decision gate, then BILL-02 through BILL-08 only after the required product decisions are recorded.
2. **F2 and the BILL-01-qualified scope of F3** — domain consistency.
3. **RQ-TG-01 through RQ-TG-06** — release reliability.
4. **UI-001, WKR-05 / Cross-F1, Cross-F2, and Cross-F3** — incremental decomposition.

## Standing completion workflow

For every item: read the relevant full-plan block; verify GitHub and the working tree; work on one bounded task; run focused tests and the full repository gates; update the roadmap and handoff; commit; push; open a PR into `main`; wait for the Production Gate; merge after required checks pass; verify the merged commit and post-merge workflows; then stop and report the completed task. Do not start the next item until the owner says to continue.
