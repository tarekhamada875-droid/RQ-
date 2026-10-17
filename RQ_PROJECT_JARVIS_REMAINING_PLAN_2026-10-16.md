# JARVIS Modernization — Remaining Work

**Last verified:** 2026-10-17

**Source of truth:** [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](./RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md)

**Latest merged code-bearing commit:** `9f0ba2b` (PR #103 / BILL-07 prepaid EGP and credit reporting). PR #101’s post-merge Production Gate, guarded Worker deployment, and Worker health smoke passed; the approved `credit_ledger(garageId ASC, occurredAt DESC)` Firestore index is enabled as `CICAgJj7z4EK`. The current main checkout is clean and matches `origin/main`. BILL-07 PR #103 is merged; the post-merge Production Gate and Worker deployment/health smoke passed. The live Worker health and version endpoints returned HTTP 200.

**Current checkpoint:** BILL-07 is complete, merged, and live. Stop here and report the result; do not begin BILL-08 until the owner directs continuation.

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

### 1. BILL-01 — Finalize the prepaid-credit contract and cutover policy (decision gate) — completed

The owner-approved direction is non-expiring prepaid RQ credits at 1 EGP per credit: one credit for each successful regular non-subscriber entry; five credits once for a successful monthly parking-subscriber renewal; no per-visit subscriber debit; and three free mistake/correction events per garage per Cairo day, shared across staff. Admin confirms offline payment and directly grants credits; garage owners do not purchase packages. The garage’s own monthly parking memberships stay date-based.

**Referral rewards are now decided:** once the referred garage receives its first Admin-confirmed paid credit grant, award its referrer 20 non-expiring referral credits—usable for 20 successful regular non-subscriber entries only. Do not award for unpaid/complimentary grants, self-referrals, or later grants to the same referred garage; referral credits cannot pay monthly subscriber renewals. Preserve a distinct, auditable, one-time reward record. Existing day-based referral rewards remain unchanged until the tested cutover.

**Decision status (owner-approved 2026-10-17):** Block regular entries at zero credits and block subscriber renewals below five credits; count only Admin-authorized vehicle deletion/refunds against the shared three-event allowance; after the third event, block further staff corrections until the next Cairo day; restore the consumed credit with no cash/EGP refund; convert active plans at 10 credits per remaining plan day; convert legacy EGP balances at 1 EGP per credit; allow no discounts/bonuses; retire daily vehicle capacity; and make paid/referral credits interchangeable for eligible regular entries while keeping referral credits separately auditable and forbidden for subscriber renewals. The full decision record is in the BILL-01 section of [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](./RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md).

### 2. BILL-02 — Add the auditable prepaid-credit ledger — completed foundation

Added `server/domain/prepaidCreditLedger.ts` and focused tests. The pure reducer keeps paid and referral balances separate, supports Admin-confirmed paid grants, the one-time 20-credit referral award, one-credit regular-entry debits, five-credit paid-only subscriber-renewal debits, and authorized correction restores. Entries require garage, actor, reason/reference, timestamp, and idempotency-key context; deterministic entry identity prevents ambiguous retry records. `npm run ci:check` passed with 128 test files / 836 tests, including production build and artifact verification. No Worker route, Firestore data, migration, or customer-facing cutover changed; integration begins with BILL-03 through BILL-06.

### 3. BILL-03 — Convert Admin package definitions to non-expiring credit bundles — completed foundation

Admin package creation now validates `catalogType: credit_bundle`, integer `creditQuantity`, and positive price, rejects discounts on new credit bundles, and persists no duration/daily-capacity fields for the new catalog type. Both Admin package entry points use bundle name, credit quantity, and price; legacy records remain visible for review. The garage owner’s legacy self-purchase selector filters out credit bundles. Focused package-catalog, Admin UI, Worker parity, and TypeScript checks passed. No payment confirmation, automatic grant, Firebase backfill, migration, or customer-facing cutover occurred in BILL-03; subsequent bounded grants are BILL-06.

### 4. BILL-04 — Charge regular vehicle entries and enforce the shared mistake allowance — completed bounded implementation

The opt-in `prepaid_credits` Worker path debits one credit atomically for successful regular non-subscriber check-ins, allocates paid credits first while preserving paid/referral auditability, returns the remaining balance, and rejects zero-credit entries before vehicle writes. Monthly-subscriber check-in attempts do not debit. Authorized deletion/refund restores the original credit bucket with a correction ledger entry and no cash refund. The existing shared three-event Cairo-day correction allowance is verified across staff operations. The garage balance card shows total/paid/referral credits above the plate input, announces the updated count, animates downward arrows only after a confirmed debit, and disables motion under `prefers-reduced-motion`. Legacy time-based garages remain unchanged until cutover. Full CI passed with 128 test files / 842 tests, production build and artifact verification passed, and maintainability/diff checks passed. No grants, subscriber renewal debit, migration, or production cutover occurred.

### 5. BILL-05 — Debit monthly parking-subscriber renewals — completed bounded implementation

The opt-in `prepaid_credits` renewal path debits exactly five paid credits atomically with a successful monthly renewal, rejects the renewal before subscriber writes when paid credits are insufficient, never spends referral credits for renewals, returns the remaining balance, and records an auditable `subscriber_renewal_debit` ledger entry. Idempotent retries return the cached result without a second debit or renewal event. Existing legacy time-based renewals remain unchanged, and later subscriber entry/exit operations remain non-debiting. Focused BILL-05 tests and TypeScript checks passed. No Admin grant, migration, reporting change, or production cutover occurred.

### 6. BILL-06 — Admin manual credit grants and garage balance/history — merged and deployed

Added an Admin-only Worker route to grant either a selected active credit-bundle template quantity or a positive entered integer after explicit external/offline payment confirmation, payment reference, and reason. The atomic, idempotent transaction writes paid credits only, an auditable `credit_ledger` record, and an activity record. The first-paid-grant trigger is recorded once per referred garage; a distinct one-time 20-credit referral award is written only if the referrer is already prepaid-enabled. If the referrer is legacy, the route records `referrer_not_prepaid` and does not activate it. It refuses legacy subscription target garages rather than enabling them, and never touches the EGP wallet. Admin garage details show paid/referral/total balances, grant controls, and up to 50 paged grant/usage records; garage balance UI exposes read-only scoped history. Garage users do not receive Admin-only payment references. PR #101 is merged at `f99a67b2e7023d61d36fd1df1f27c40cf9bbc071`. Post-merge Production Gate [39033339698](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39033339698) and Worker deployment/health smoke [39033339649](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39033339649) passed. With owner approval, the `credit_ledger(garageId ASC, occurredAt DESC)` composite index was created and verified Enabled (ID `CICAgJj7z4EK`) in the documented production Firestore project/database. TypeScript and 11 focused tests passed; local `npm run ci:check` passed with 130 files / 856 tests, `npm run maintainability:check`, and `git diff --check` passed. Generated `dist/` and `build/` were removed. No data migration, automatic payment, reporting change, or customer-facing cutover occurred in BILL-06. BILL-07 is the separately authorized reporting task below.

### 7. BILL-07 — Separate verified prepaid EGP receipts from credit activity — merged and deployed

**BILL-07 implementation checkpoint (2026-10-17; PR #103 merged and live):** Owner clarified that the money is transferred outside RQ, then Admin records the amount already received and confirms it; the owner approved a strict 1 EGP per credit. Manual grants now require the verified integer EGP amount to equal the credit quantity, and atomically write the payment amount to the Admin-only ledger plus a new immutable payment event. New credit-bundle prices must also equal their credit quantities. The bounded financial report adds a separate EGP receipts total and separate integer credit grant, referral, entry, renewal, correction, and historical-unrecorded-amount metrics; existing cash/net-revenue totals and partner-dividend math remain unchanged. The bilingual Admin report card displays EGP and credits separately. Historical paid grants without a saved payment amount remain explicitly identified as unrecorded rather than inferred. Focused validation passed (132 tests); full `npm run ci:check` passed (131 files / 872 tests, including TypeScript, rules/build/artifact gates); `npm run maintainability:check` and `git diff --check` passed. No Firebase data/rules migration, actual payment processing, or customer-facing cutover occurred. PR [#103](https://github.com/tarekhamada875-droid/RQ-/pull/103) merged to `main` at `9f0ba2ba97add2dfdd8ed2ff94ef7ebda6db0bf7`. Both the PR/push Production Gates [39037560524](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39037560524) and [39037557839](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39037557839) passed. Post-merge Production Gate [39037825643](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39037825643) and guarded Worker deployment/health smoke [39037825659](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39037825659) passed. Live `/api/health` and `/api/version` returned HTTP 200; health reported `status: ok`, `adminSdk: true`, and version `1.0.0-production`.

### 8. F2 — Make reconciliation day-safe

Make the pure reconciliation reducer filter valid events by the Cairo date key for `today`, even when called with wider or malformed input arrays. Keep range optimization and clarify `totalRecordedEvents` semantics. Cover previous/next-day, missing, invalid, and non-date timestamps and ensure daily projection/reconciliation parity.

### 9. F3 — One unlimited-package classifier (reassess under BILL-01)

Do not apply the legacy duration/capacity classifier to prepaid credit bundles. BILL-01 must decide whether daily vehicle capacity stays a separate operational limit; retain and test it if it does, otherwise mark the corresponding legacy package behavior superseded at cutover.

### 10. RQ-TG-01 through RQ-TG-06 — Release reliability

RQ-TG-01 consolidates verification/install/suite and artifact upload; RQ-TG-02 ties verify → deploy → smoke to the exact commit/artifact and rollback identity; RQ-TG-03 strengthens health checks; RQ-TG-04 pins Firebase CLI and aligns local rules checks; RQ-TG-05 smokes the built Worker artifact; RQ-TG-06 makes local CI fail fast while retaining diagnostic mode.

### 11. UI-001, WKR-05 / Cross-F1, Cross-F2, and Cross-F3 — Incremental decomposition

Move route/overlay ownership out of `App`; extract Worker route families mechanically while preserving route inventory and contracts; split `adminService` behind its unchanged facade; and group the `useGarageApp` contract before migrating `App`. Keep each as a separately tested, bounded PR.

## Recommended order

1. **BILL-01 through BILL-07** are complete; BILL-07 is merged and live. Stop and report this bounded task.
2. **BILL-08** remains a separate cutover task; do not begin it until the owner explicitly directs continuation.
3. **F2 and the BILL-01-qualified scope of F3** — domain consistency.
4. **RQ-TG-01 through RQ-TG-06** — release reliability.
5. **UI-001, WKR-05 / Cross-F1, Cross-F2, and Cross-F3** — incremental decomposition.

## Standing completion workflow

For every item: read the relevant full-plan block; verify GitHub and the working tree; work on one bounded task; run focused tests and the full repository gates; update the roadmap and handoff; commit; push; open a PR into `main`; wait for the Production Gate; merge after required checks pass; verify the merged commit and post-merge workflows; then stop and report the completed task. Do not start the next item until the owner says to continue.
