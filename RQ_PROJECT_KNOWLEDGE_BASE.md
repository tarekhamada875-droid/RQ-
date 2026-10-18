**Current authority fence (2026-10-18):** The top checkpoint below is the only current work selection. All older dated records in this file are historical evidence, not instructions; ignore their old “next task,” “authorized,” or “continue” wording. The owner-selected workstream is the separate [RQ Legacy Removal Plan](RQ_LEGACY_REMOVAL_PLAN_2026-10-18.md), with **LR-00 — Baseline and contract inventory** as the only pending task. No LR implementation has started. Do not start Cross-F1 or later JARVIS work again. The live Worker is healthy at application SHA `ed07806770c8f3aa76d2520e84d5778058978ab5`; `main` may contain later documentation-only commits, so every successor must re-fetch and verify the exact clean `main`/`origin/main` SHA after the final merge. Preserve prepaid credits, customer monthly subscriptions, current referral credits, and historical records. Do not change Firebase data/rules, database routing, or run migrations.

**Legacy Removal Plan checkpoint (2026-10-18, documentation draft):** The owner requested a separate plan for retiring the remaining legacy garage-owner wallet/time-based billing remnants. The validated draft is [RQ_LEGACY_REMOVAL_PLAN_2026-10-18.md](RQ_LEGACY_REMOVAL_PLAN_2026-10-18.md). Re-audit confirmed that `POST /api/transactions/recharge-garage` remains an active legacy writer, while several other recharge, wallet, self-subscribe, fair-use, and referral-day paths are fail-closed but retain dead implementations and client/UI wiring. No application code, Firebase data, rules, database routing, or migration changed. Current prepaid credit grants/ledger, one-credit regular entry, five-credit monthly-subscriber renewal, current referral credits, customer subscriber dates/CRUD, and historical read-only records are explicit protected behavior. The single next task is **LR-00 — Baseline and contract inventory**; do not begin LR-01 or any code cleanup until LR-00 is selected and completed.

**Current JARVIS UI workstream checkpoint (2026-10-18, released):** PR [#156](https://github.com/tarekhamada875-droid/RQ-/pull/156) merged `feat/ui-001-app-route-containers` into `main` at `22411c191653683c35fefadf5fee1458b396b889`. The route-selection and global-modal render branches from the 604-line `App.tsx` are mechanically extracted into typed `src/components/app/AppRoutes.tsx` and `src/components/app/AppOverlays.tsx`. `App.tsx` retains global auth/session gates, theme/network shell, browser-history trapping, toast shell, and the grouped `useGarageApp` boundary; existing lazy route imports, route props, fallback recovery, diagnostics, wallet precedence, modal callbacks, and cleanup semantics are preserved. `useGarageApp` exports the inferred `GarageAppState` type. `App.tsx` is 94 lines. PR and main Production Gate [39126469934](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39126469934) passed 140 files/902 tests, Firestore rules, frontend/Worker build, verified artifact smoke/upload, guarded deployment, maintainability, and live smoke; deployed Worker identity matches the merge SHA. UI-002 through UI-006 were already released in PRs #48, #57, #59, #64, and #65; focused audit coverage passed 7 files / 19 tests. No Firebase/database/billing/rules/migration/performance change is claimed. The UI workstream is complete; await the next explicitly bounded roadmap selection.

**Current Cross-F3 hook/App checkpoint (2026-10-18, released):** PR [#149](https://github.com/tarekhamada875-droid/RQ-/pull/149) merged branch `feat/cross-f3-garage-app-contract` into `main` at `1f2cda9758d2b7936540519f1717b157d97af979`; `useGarageApp` returns six named groups—`session`, `navigationUi`, `garageData`, `vehicleOperations`, `subscriptions`, and `adminManagement`—while retaining flat aliases for one compatibility step. `App.tsx` consumes only the grouped contract. Session readiness, offline gating, fallback views, callback/setter identity, and cleanup boundaries are unchanged. Focused renderHook coverage passed 1 file/1 test; full `npm run ci:check` passed 140 files/902 tests plus rules, build, artifact smoke, maintainability, lint, and whitespace checks. No Firebase/database/billing behavior, migration, deployment, or performance claim changed. PR and main Production Gate [39122733505](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39122733505) passed full verification, verified artifact upload, guarded deployment, and live smoke; live Worker identity matches `1f2cda9758d2b7936540519f1717b157d97af979`. Cross-F3 is complete; stop before later roadmap work. The “tokens ending” continuity handoff is active: verified the latest application code remains `1f2cda9758d2b7936540519f1717b157d97af979`; `main` contains only documentation-only commits after the application merge, live Worker SHA is `1f2cda9758d2b7936540519f1717b157d97af979`, no PR is open, and `readiness/firestore-decision-gate` remains `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`. Single next task: await Tarek’s next bounded roadmap selection.

**Current Cross-F2 admin-service checkpoint (2026-10-18, released):** PR [#147](https://github.com/tarekhamada875-droid/RQ-/pull/147) merged branch `feat/cross-f2-admin-service-modules` into `main` at `51121b473cc776f27db945639f3a957a3b2841d4`; the 790-line `adminService` is mechanically split into eight domain modules while retaining the same 41-key public facade and unchanged `firestoreService` composition. Modules cover core/staff, packages, subscribers, coupons, activity, billing, announcements, and system config. Focused checks passed 5 files/22 tests, including facade-key and system-config call-count characterization; full `npm run ci:check` passed 139 files/901 tests plus rules, build, artifact smoke, maintainability, lint, and whitespace checks. No system-config policy, Firebase/database/billing behavior, migration, or performance claim changed. PR and main Production Gate [39121937326](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39121937326) passed full verification, verified artifact upload, guarded deployment, and live smoke; live Worker identity matches `51121b473cc776f27db945639f3a957a3b2841d4`. Cross-F2 is complete; stop before Cross-F3.

**Current Cross-F1 garage checkpoint (2026-10-18, released):** PR [#145](https://github.com/tarekhamada875-droid/RQ-/pull/145) merged branch `feat/cross-f5-worker-garage-routes` into `main` at `1074f5356a251c60a859b0d4b94709c1dd880198`; the 38 CF8 garage-management registrations are mechanically extracted into `server/garageRoutes.ts`: garage CRUD/reads, deletion and maintenance, staff/delegate administration, PIN updates, admin catalog routes, credit grants/ledger, legacy transaction routes, and cars-inside recalculation. Typed `GarageRouteDeps` keeps auth, scope, validation, PIN, pagination, reconciliation/projection, credit/referral, and deletion dependencies explicit. Global Worker behavior and registration order remain in `server/cloudflareWorker.ts`; activity-log/spike endpoints remain there; route inventory remains 89. Focused tests passed 6 files/99 tests; full `npm run ci:check` passed 138 files/898 tests plus rules, build, artifact smoke, maintainability, lint, and whitespace checks. No Firebase/database/billing behavior changed and no performance gain is claimed. PR and main Production Gate [39120945803](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39120945803) passed verification, artifact upload, guarded deployment, and live smoke; live Worker identity matches `1074f5356a251c60a859b0d4b94709c1dd880198`. Cross-F1 garage-management extraction is complete; stop before later roadmap work.

**Cross-F4 financial-family release verification (2026-10-18):** PR [#143](https://github.com/tarekhamada875-droid/RQ-/pull/143) merged at `98f1c3ba9dabd89ee302a20ce467cc8f3e943007`. Main Production Gate [39119755307](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39119755307) passed verification, verified-artifact deployment, and strict live smoke. Live `/api/health` and `/api/version` report the exact same Worker SHA. No Firebase data/rules, database routing, billing, or migration changed. Cross-F4 is complete for the financial/recharge/delegate family only; stop before garage extraction.

**Current Cross-F1 financial checkpoint (2026-10-18, local; user continuation):** On branch `feat/cross-f4-worker-financial-routes` from clean `main` `0bd030b4db3c5d4930a51ad24c2905b1a0fbe965`, the 15 CF7 financial-family registrations are mechanically extracted into `server/financialRoutes.ts`: recharge create/approve/reject/list routes, retired direct top-up response, delegate dashboard/settlement routes, and financial reports. Typed `FinancialRouteDeps` keeps auth, rate limiting, validation, idempotency, transaction/event, credit/commission, pagination, and report dependencies explicit. Global Worker behavior and registration order remain in `server/cloudflareWorker.ts`; garage routes remain there; route inventory remains 89. Focused tests passed 6 files/89 tests; full `npm run ci:check` passed 138 files/898 tests plus rules, build, artifact smoke, maintainability, lint, and whitespace checks. No Firebase/database/billing behavior changed and no performance gain is claimed. This is local only until the PR gate completes; do not begin garage extraction here.

**Cross-F3 subscriber release verification (2026-10-18):** PR [#141](https://github.com/tarekhamada875-droid/RQ-/pull/141) merged at `53f1abb9e9437586ee3497767e88b9f594718ca7`. Main Production Gate [39118898026](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39118898026) passed verification, verified-artifact deployment, and strict live smoke. Live `/api/health` and `/api/version` report the exact same Worker SHA. No Firebase data/rules, database routing, billing, or migration changed. Cross-F3 is complete for the subscriber family only; stop before financial/recharge/delegate or garage extraction.

**Current Cross-F1 subscriber checkpoint (2026-10-18, local; user continuation):** On branch `feat/cross-f3-worker-subscriber-routes` from clean `main` `274eaff9bdda8a0453be35eebab2e26a54d94d68`, the four subscriber lifecycle registrations are mechanically extracted into `server/subscriberRoutes.ts`: add, renew, update, and delete. Typed `SubscriberRouteDeps` keeps authentication, scoped authorization, lifecycle decisions/adapters, idempotency, credit ledger, summary writes, and event recording explicit. Global Worker behavior and registration order remain in `server/cloudflareWorker.ts`; route inventory remains 89. Focused tests passed 5 files/76 tests; full `npm run ci:check` passed 138 files/898 tests plus rules, build, artifact smoke, maintainability, lint, and whitespace checks. No Firebase/database/billing behavior changed and no performance gain is claimed. This is local only until the PR gate completes; do not begin financial/recharge/delegate or garage extraction here.

**Cross-F2 vehicle release verification (2026-10-18):** PR [#139](https://github.com/tarekhamada875-droid/RQ-/pull/139) merged at `d9e4ced185436b1f42c8aa31a39f788d9df32535`. Main Production Gate [39118117050](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39118117050) passed verification, verified-artifact deployment, and strict live smoke. Live `/api/health` and `/api/version` report the exact same Worker SHA. No Firebase data/rules, database routing, billing, or migration changed. Cross-F2 is complete for the vehicle family only; stop before the subscriber family.

**Current Cross-F2 vehicle checkpoint (2026-10-18, local):** On branch `feat/cross-f2-worker-routes` from clean `main` `a33e00b74d51adc863cec1d1dc0a7ed3f4277a11`, the six vehicle Worker registrations are mechanically extracted into `server/vehicleRoutes.ts`: check-in, check-out, delete, refund, inside, and history. Typed `VehicleRouteDeps` keeps shared transaction, authorization, plate, credit-ledger, projection, audit, and idempotency dependencies explicit. Global Worker behavior and route order remain in `server/cloudflareWorker.ts`; route inventory remains 89. Focused tests passed 5 files/75 tests; full `npm run ci:check` passed 138 files/898 tests plus rules, build, artifact smoke, maintainability, lint, and whitespace checks. No Firebase/database/billing behavior changed and no performance gain is claimed. This is local only until the PR gate completes; do not begin the subscriber family here.

**Cross-F1 release verification (2026-10-18):** PR [#137](https://github.com/tarekhamada875-droid/RQ-/pull/137) merged at `ba194ea33a04dfc499292d1a67568486c116ba71`. Main Production Gate [39117269934](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39117269934) passed verification, verified-artifact deployment, and strict live smoke. Live `/api/health` and `/api/version` report the exact same Worker SHA. No Firebase data/rules, database routing, billing, or migration changed. Cross-F1 is complete for the first read/system family only; stop here before the next family.

**Current Cross-F1 checkpoint (2026-10-18, local):** The first Worker read/system route family is mechanically extracted on branch `feat/cross-f1-worker-read-routes` from clean `main` `410f74df446d8b143ad4f609d774151298bdf807`. `server/readRoutes.ts` owns the nine original system/read registrations; `server/workerReadHelpers.ts` owns shared subscriber/date/sanitization helpers needed by both the extracted routes and remaining monolith. Global middleware, auth/error/rate-limit handling, route order/aliases, and the default Worker fetch remain in `server/cloudflareWorker.ts`. Route inventory remains 89 registrations. Focused tests passed 6 files/85 tests; full `npm run ci:check` passed 138 files/898 tests plus rules, build, artifact smoke, maintainability, lint, and whitespace checks. This work is local only until the PR gate completes. The single next step is the PR/release cycle for this first extraction; do not start vehicle extraction here.

# RQ Project Knowledge Base

**Last updated:** 2026-10-18
**Repository:** `tarekhamada875-droid/RQ-`  
**Latest deployed Worker revision:** `ce828f6e857e266e967f75246440759a9f3ceba5` (RQ-TG-06, PR [#133](https://github.com/tarekhamada875-droid/RQ-/pull/133)). PR Production Gate [39110741500](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39110741500) and main Production Gate [39110920191](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39110920191) passed. The main run smoke-tested the artifact after build and after download, deployed it, and strict live smoke reported a healthy backend and frontend, version `1.0.0-production`, and the exact Worker SHA. The clean-install local gate passed (137 test files / 895 tests, Firestore rules, build, built-Worker smoke, maintainability, and artifact checks); focused fail-fast/workflow tests (12), TypeScript, and whitespace checks passed. No customer-facing application behavior or Firebase data/rules changed.

**Historical JARVIS checkpoint (2026-10-18; superseded):** RQ-TG-06 was complete and live at Worker SHA `ce828f6e857e266e967f75246440759a9f3ceba5`. The old continuation authorization to start Cross-F1 was consumed by subsequent released work and must not be reused. Do not change Firestore data/rules or database routing as part of a revived route-extraction task.

**For future agents:** read the full master roadmap and the current handoff before choosing work; do not rely only on the next-task paragraph. Follow the verified PR-only fast path in “Efficient task workflow for future contributors”: feature-branch pushes do not start a duplicate gate; PRs do; only superseded checks for the same PR may be cancelled, never a main release; and documentation-only changes use the text-only gate without Worker deployment. Every successor handoff must include the thorough, plain-language, ready-to-copy onboarding message defined in `AGENTS.md` and `PROJECT_WORKING_AGREEMENT.md`, including the whole-roadmap reading requirement. The dated task notes below are historical checkpoints; verify current GitHub and working-tree state before editing.

**Workstream status:** The owner stopped H9 / Express decommissioning on 2026-10-12, then explicitly authorized final Express-runtime removal on 2026-10-13. PR #32 removed the obsolete Express host, packages, middleware, and Node/Docker production artifact path. Hono remains the production backend; no Express runtime remains. The former `migration/unified-hono` branch was deleted after merge; do not recreate it as an active workstream.

**Current JARVIS continuation point (verified 2026-10-17; updated after PR #114):** Phase 3 backend bounded-read work **FS-03, FS-02, and WKR-04** is complete; the WKR-02 counter correction is also merged. PR #86 / `1b6f1ca` delivered FS-02 and its required indexes, which reached `READY` without changing rules or documents. WKR-04 PR [#88](https://github.com/tarekhamada875-droid/RQ-/pull/88) merged at `fa5fa33`; its post-merge Production Gate and guarded Worker deployment passed. BILL-01’s prepaid-credit product contract was finalized by the owner on 2026-10-17. BILL-02 through BILL-06 are implemented and verified on main; BILL-06 is merged as PR [#101](https://github.com/tarekhamada875-droid/RQ-/pull/101) at `f99a67b`, with post-merge Production Gate, Worker deployment/health smoke, and the approved Firestore history index all successful. BILL-07 separate-unit financial reporting merged in PR [#103](https://github.com/tarekhamada875-droid/RQ-/pull/103) at `9f0ba2b`. BILL-08’s pure synthetic rehearsal merged in PR [#105](https://github.com/tarekhamada875-droid/RQ-/pull/105) at `83a54b5`; its post-merge Production Gate and Worker deployment/health smoke passed. It previews the approved 10-credits-per-remaining-plan-day and 1-credit-per-whole-EGP conversions, flags historical trials/referral balances for review, and performs no writes. It is a historical preview artifact; the active legacy screen and runtime paths were subsequently retired by PR #114. No historical conversion has been performed. Any future balance conversion remains separately approval-gated and requires idempotency, reconciliation, and support/rollback controls. See [`RQ_PROJECT_JARVIS_REMAINING_PLAN_2026-10-16.md`](./RQ_PROJECT_JARVIS_REMAINING_PLAN_2026-10-16.md) for details.

**Latest completed JARVIS task (2026-10-17):** F3 merged in PR #119 at `7f7778c` and deployed successfully. The active RQ path no longer uses duration/capacity/unlimited/fair-use authorization: vehicle entry is credit-only, prepaid garages bypass legacy expiry gating, Admin package creation accepts only credit bundles, and fair-use extension returns HTTP 410 without writes. Garage-owned monthly parking subscriptions remain date-based and historical records remain readable. Local focused tests and the full 132-file / 866-test `npm run ci:check`, production build/artifact verification, maintainability, and diff checks passed. No Firestore data or configuration changed.

**Latest completed JARVIS task (2026-10-17):** RQ-TG-01, one canonical verification and release-artifact flow, merged in PR [#121](https://github.com/tarekhamada875-droid/RQ-/pull/121) as `8035fe2`. The former separate Worker workflow is consolidated into the Production Gate: one full dependency install and full test suite, upload the verified Pages/Worker build named with the event SHA, then deploy that artifact only after verification. The strict release smoke follows deployment. Local `npm run ci:check` passed (133 files / 869 tests), `npm run test:rules`, the focused workflow tests (3), maintainability, YAML parsing, and a Wrangler no-bundle dry-run passed; PR Production Gate run 39062872565 passed. Post-merge main run [39063103597](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39063103597) also passed, including verified-artifact Worker deployment and strict live smoke. No Firebase data/rules/configuration changed. RQ-TG-02 is the active follow-on task; see the current checkpoint below.

**Latest completed JARVIS task (2026-10-18):** RQ-TG-03 merged in PR [#125](https://github.com/tarekhamada875-droid/RQ-/pull/125) at `49386aba0d8139fa8e4be5edb55786b64eb26b2e`. Shared health-response validation is now used by live release smoke; deterministic fixtures cover healthy/error/incomplete/non-JSON replies, bad versions, HTTP failures, and frontend failures, while workflow regression tests protect post-deploy order, bounded retries, and GET-only requests. PR Production Gate [39104176846](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39104176846) and main Production Gate [39104450208](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39104450208) passed, including deployment and live smoke. The live health response reported `status=ok`, version `1.0.0-production`, and the exact main SHA. Locally: focused tests passed (3 files / 16 tests), `npm run ci:check` passed (136 test files, build/artifact verification), typecheck, demo-emulator rules, maintainability, and diff checks passed. No Firebase data/rules changed. Next Jarvis task: RQ-TG-04.

**Workflow-efficiency improvement completed (2026-10-18; PR [#127](https://github.com/tarekhamada875-droid/RQ-/pull/127)):** The Production Gate now runs for PRs to `main` and pushes to `main`, not feature-branch pushes. It can cancel an older run only when a newer commit arrives for the same PR; main releases remain non-cancellable. Verified behavior: this branch push started no run, the PR produced one required verification [39105649832](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39105649832), and the protected main release [39105794248](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39105794248) passed both verification and Worker deployment/live smoke. The live health endpoint returned `status=ok`, version `1.0.0-production`, and the exact main SHA `7ca1438ba124f66e63f6130e60eaf0417b17407c`. Regression tests, local full CI, demo-emulator rules, maintainability, YAML, and diff checks passed. No app behavior, Firebase data, or rules changed. Next: RQ-TG-04.

**Latest completed JARVIS task (2026-10-18):** RQ-TG-02 merged in PR [#123](https://github.com/tarekhamada875-droid/RQ-/pull/123) at `5010281e90a8ff572dd741f2e3575df09634de87`. Worker health/version now include the deployed `commitSha` alongside the unchanged human version label; production smoke requires an exact match. The new manual Worker Rollback workflow selects a full SHA and its successful main Production Gate run, retrieves only that run’s saved artifact (30-day retention), then deploys and smoke-checks that exact SHA and the selected release’s version label. Synthetic rollback identity tests passed; a production rollback was not needed or run. Local CI passed (135 files / 879 tests), typecheck, rules emulator, maintainability, focused tests (17), workflow parsing, diff checks, and Wrangler dry-run. PR checks passed; post-merge main Production Gate [39096100434](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39096100434) passed. A direct live check returned `status=ok`, `version=1.0.0-production`, and commit `5010281e90a8ff572dd741f2e3575df09634de87`, matching main exactly. No Firebase data/rules/configuration changed.

**BILL-08 read-only data-shape check (2026-10-17):** A bounded Firestore query inspected 16 current garage documents using billing fields only; it did not establish whether those records are synthetic or real. No documents, balances, rules, or configuration were changed. The snapshot showed 13 approved records, 3 with missing status, 7 trial-flagged records, 2 invalid `balanceExpiry` string values (`2099-12-31`), and 0 pending `recharge_requests`. No `isLocked`/`isSuspended` value was true, and no positive referral-balance/day value appeared in the projection. Legacy wallet `balance` fields total 470 EGP. The preview-only candidate output is 395 credits: first convert 345 EGP to 345 credits, then include 50 credits from remaining plan time; the 125 EGP on a missing-status record is excluded. The actual pure calculator, run against the projected billing fields with temporary non-identifying row labels, returned 6 preview-ready records (3 with nonzero candidate value) and 10 needing review. Preview-ready is not cutover approval. Do not treat these figures as migrated balances. Until the data is confirmed otherwise, handle the records as potentially real and do not write to them without explicit cutover approval. The proposed rollback procedure is in [`docs/billing-cutover-rollback.md`](./docs/billing-cutover-rollback.md); it is documentation only and its transactional controls still need implementation and tests. The next gate is owner policy for trials/referral exceptions plus manual review of missing-status/invalid-expiry records, followed by explicit cutover approval.

**BILL-08 documentation release status (2026-10-17):** The rollback playbook and audit notes merged in PR [#107](https://github.com/tarekhamada875-droid/RQ-/pull/107) at `42830f462f630c1bd5a9bd0715de0707d0b674b3`. The PR/push checks and main Production Gate passed. It was documentation-only; no live conversion or Worker deployment occurred. `main` and `origin/main` match cleanly at `42830f4`.

**BILL-08 owner clarification and product decision (2026-10-17):** After the audit, the owner confirmed that all 16 inspected garages are test records and no real users exist yet; leave them in place for now. This supersedes the earlier precaution to treat their classification as unknown. When the prepaid-credit model launches, retire old time-plan/EGP-wallet features from active use but preserve historical EGP payment and receipt records as read-only audit history. Any legacy wallet value is to be converted once at 1 EGP = 1 credit so it cannot be spent twice. This does not authorize deleting garages, changing balances, or performing the cutover. The test-data/history clarification was recorded in PR [#109](https://github.com/tarekhamada875-droid/RQ-/pull/109), merged at `5ca57b8` with required checks passed. The owner later approved converting remaining trial time at 10 credits per remaining day into a separate Trial-credit balance, using the existing partial-day round-up rule. Trial credits may be used for regular non-subscriber entries only, not monthly subscriber renewals; missing/invalid expiry records remain for review. The expiry behavior for converted Trial credits has not been specified and must be clarified before implementation. The current balance schema/ledger still have only paid and referral buckets, and the pure preview still flags trials; no application code or live balance was changed. Any nonzero legacy referral value must be held for owner review.

## 1. What RQ is

RQ is a bilingual Arabic/English garage-management PWA for vehicle check-in/check-out, monthly subscribers, packages, balances, delegates, staff, and Admin operations. The Supervisor role has been retired by owner decision; existing legacy Supervisor records are preserved and do not represent active accounts.

The application was last confirmed by the owner on **2026-10-14** to be in controlled synthetic pre-production, with no real users, customer records, or live financial data. Reconfirm this before future work depends on it. Synthetic pre-production is not permission to touch unknown data, accept real revenue, perform destructive migrations, or claim final production readiness.

## 2. Production topology

```text
Cloudflare Pages frontend
        ↓ HTTPS API requests
Cloudflare Worker API (Hono)
        ↓ Worker-compatible Firebase Auth / Firestore REST adapter
Firebase Authentication + Firestore
```

- Frontend: React/Vite/Tailwind static PWA on Cloudflare Pages.
- Production backend: Hono/Fetch-native Cloudflare Worker named `rq`.
- Data/authentication: Firebase Auth and Firestore. The browser uses the Firebase client SDK for permitted display synchronization; the Worker uses a Worker-compatible REST adapter with protected credentials.
- Cloudflare Pages serves the SPA; the Worker owns the production `/api/*` routes.
- Production Worker URL: `https://rq.tarekhamada875.workers.dev`.
- Production Pages URL: `https://rq-acg.pages.dev`.
- No Express runtime remains in `main`. Local development uses a small Node HTTP adapter to connect Vite to the existing Hono API; production builds contain the Pages frontend and Cloudflare Worker only. PR #32 removed the former compatibility host and unused legacy trace-persistence logic. The Cloud Run entrypoint was retired, and no Cloud Run deployment workflow is active.
- `public/icon.svg`, `public/manifest.json`, and `public/_headers` are active deployment assets.
- `wrangler.toml` is the production Worker deployment configuration.

## 3. Document hierarchy

For future work, use this order:

1. **`AGENTS.md`** for mandatory safety, engineering, and release rules.
2. **`PROJECT_WORKING_AGREEMENT.md`** for owner communication and the “RQ handoff” continuity trigger.
3. **This file** for current architecture and project status.
4. **`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`** as the only active modernization roadmap; verify each task's status before starting.
5. **`MAINTAINABILITY_HANDOFF.md`** for verified implementation details and recent engineering milestones.
6. **`BRANCHING_AND_RELEASES.md`**, `README.md`, and `CONTRIBUTING.md` for the current development and release workflow.
7. `security_spec.md`, `OPERATION_TRAIL_GUIDE.md`, and `docs/duplication-contract-tests.md` for their specific current topics.

Retired migration, preview, and role-acceptance documents have been removed from the active tree. Their Git history remains available if a specific historical fact needs to be audited. Do not recreate closed workstreams from old commit history.

## 4. Core architecture decisions

### Server authority

The backend is authoritative for:

- authentication and authorization;
- session creation, refresh, revocation, and timeout;
- vehicle check-in, checkout, correction, and deletion;
- subscribers and garage lifecycle mutations;
- balances, subscriptions, manual credits, financial ledgers, and idempotency;
- audit events, operational policy, and protected reporting.

The frontend may use Firestore reads/listeners for display synchronization when rules allow them. Display reads must never authorize a protected operation. Protected mutations must use the Cloudflare Worker API in production.

### Functional programming direction

Do not create a parallel V3 backend. The existing `server/` backend remains the production authority. Improve it incrementally using:

```text
HTTP adapter → typed command → pure domain decision → Firestore transaction → event/idempotency persistence → HTTP response
```

Pure domain functions receive time, IDs, and state explicitly. They do not access Firestore, HTTP frameworks, environment variables, randomness, logging, or hidden mutable state.

### UI/UX contract

Preserve existing screens, visual design, navigation, and user flows by default. Wiring, API, loading, error, and authority repairs are allowed underneath the UI. Redesigns, feature removals, label changes, or workflow changes require explicit owner approval.

The owner-approved product direction includes the 24-hour session timeout, fixed 100 EGP delegate commission policy, 15-day referral eligibility/expiry behavior, rewards-screen removal, and related admin/dashboard changes.

## 5. Product and business decisions already recorded

- Current environment is synthetic pre-production; staging is deferred until real users, customer data, revenue, or destructive operations become relevant.
- The named Firestore database must not be casually changed. Database identity and billing are an owner-level decision.
- The 250 EGP monthly-subscriber flat fee is a **configurable fallback default**, not a permanent price. A persisted admin system setting overrides it.
- Delegate dashboard collection data uses the scoped server endpoint because Firestore list rules correctly deny the previous browser queries.
- The partner dividend calculator’s actual mode uses the current UTC-month authoritative financial report and is explicitly an estimate, not an accounting or settlement ledger.
- Financial behavior must remain server-authoritative, transactional, idempotent, and auditable.
- The garage’s RQ access is now prepaid credits with no expiry; after confirming offline payment, Admin directly grants credits. Garage owners do not purchase packages or top up an EGP wallet to activate credits. The Admin package editor remains an Admin-only template catalog, not customer checkout. PR #114 retired the active RQ time-based expiry, daily-capacity, fair-use, wallet top-up, self-subscribe, recharge, and referral-day paths for the synthetic/test-only environment. Historical records remain preserved; historical balance conversion is separate and has not occurred.
- The garage’s own monthly parking memberships remain time-based. Their successful renewal consumes five prepaid credits once; later subscriber entries/exits are not charged per visit but remain operationally recorded.
- The agreed shared mistake allowance is three free events per garage per Cairo day across all staff. The owner has decided that only an Admin-authorized vehicle deletion/refund counts; after the third event, further staff corrections are blocked until the next Cairo day.
- BILL-01 decisions are recorded in the Phase 4 section of `RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`: block zero-credit regular entries and underfunded subscriber renewals; restore the consumed credit for an Admin-only deletion/refund with no cash/EGP refund; convert active plans at 10 credits per remaining plan day; convert legacy EGP balances at 1 EGP per credit; allow no discounts/bonuses; retire daily vehicle capacity; and treat paid/referral credits as interchangeable for eligible regular entries while keeping referral credits separately auditable and unavailable for subscriber renewals. Runtime billing retirement is deployed; historical data migration remains a separate, optional, approval-gated task.

## 6. Completed production-readiness work

The repository has completed and published repairs covering:

- server-authoritative session/API wiring across multiple frontend service paths;
- session timeout/revocation and heartbeat behavior;
- subscriber lifecycle route hardening;
- vehicle authorization and operational policy checks;
- manual-credit and recharge transaction protections;
- delegate dashboard scoped server read;
- admin partner calculator current-month report wiring;
- API client resilience, correlation IDs, operation traces, and health reporting;
- repository dependency/dead-code cleanup;
- removal of the obsolete `public/egypt_crest.svg` asset;
- alignment of the configurable monthly-subscriber fee fallback;
- production PIN-attempt throttling through the Cloudflare Durable Object; a separate unreferenced Firestore/IP limiter was removed during the 2026-10-15 repository noise audit;
- mandatory active server-session validation for Admin, Delegate, Garage, and Staff Worker routes, plus role-scoped session lookups (PR #35, deployed at `e53b2cb`);
- owner-scoped Firestore staff/garage rules and the actual-rules emulator matrix (PR #37, `2f3a61c`); after explicit owner approval, the exact `main:firestore.rules` source was published on 2026-10-14 to Firebase project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`. A fresh Console reload matched SHA-256 `8404b6a6cd833deaa4192e164a43cf2f2916e38840ce52fbce650feac4634d24` and showed no unpublished draft. No Firestore documents were changed; this applies only to that exact Firebase target;
- delete/refund idempotency protection (F1, PR #40, merged at `c7d452c`): retries are fingerprinted by garage, vehicle, semantic operation, and normalized amount; a mismatched key reuse now returns a clear conflict instead of being mistaken for success;
- staff composite index (FS-01, PR #53): `garageId ASC, createdAt DESC` is deployed and Enabled for the named Firestore database; legacy missing-`createdAt` records are not automatically backfilled;
- activity-log fallback correctness (FS-06, PR #54, deployed at `c1296d7`): fallback is restricted to missing-index failures, returns deterministic newest-first history with a 200-record cap, preserves Cairo-day filtering, and surfaces genuine failures rather than silently showing an empty list;
- private system-config API access and fail-closed diagnostics (RULES-02/SPIKE-01, PR #55, deployed at `20873e3`): anonymous system-config access is denied while active app roles retain full config access; diagnostic endpoints require a scoped secret and explicit environment allowlist, with production hard-disabled;
- add-garage draft preservation (UI-002, PR #48, deployed at `6c5993f`): failed/rejected creation keeps the form draft open for correction or retry; successful creation closes and clears the form;
- accessible primary form controls (UI-003, PR #57, deployed at `5f238ae`): all 11 add-garage/package controls have programmatic labels, and the plate input and subscriber search have accessible names; the plate field also describes the custom keyboard;
- the active JARVIS modernization roadmap, owner working agreement, and release documentation.

## 7. Workstream and environment boundaries

The Hono backend transition and owner-authorized Express-runtime removal are complete; no backend migration workstream is active. The JARVIS file named above is the sole active modernization roadmap. Branch previews are not a supported test environment; use local, unit, and emulator tests unless the owner explicitly authorizes a verified alternative. The frontend still imports `firebase-applet-preview-config.json` for an explicit, isolated build-time target; that does not make preview deployments supported, and the preview target must not be enabled on deployed Pages without an owner decision. A successful code deployment is not, by itself, approval to launch to real users or operate on real financial/customer data.

## 8. Repository map

- `src/`: React frontend, services, API client, domain helpers, and tests.
- `src/api/apiClient.ts`: frontend HTTP boundary; attaches auth/session/correlation context.
- `src/services/`: frontend service contracts and display-read adapters.
- `src/domain/`: pure business decisions and policy helpers.
- `server/cloudflareWorker.ts`: current production Hono Worker API and route authority.
- `server.ts`: local-only Node HTTP + Vite host that forwards `/api/*` requests to Hono; there is no Node production server.
- `server/routes/`: remaining legacy artifacts and any retained compatibility/test consumers are frozen; vehicle, subscriber, and delegate routers were removed from the migration branch after confirming zero production imports/mounts and Hono/domain ownership.
- `server/domain/`: pure backend decision modules.
- `tools/`: CI, maintainability, benchmark, and release-smoke tools.
- `.github/workflows/`: GitHub Production Gate.
- `wrangler.toml`: active production Worker deployment contract. The `.dockerignore` file was retired as residue; no Docker deployment path is supported.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: Firebase configuration.

## 9. Documentation and cleanup policy

Keep the operating guidance concise and current: the README, contributor/owner guides, this knowledge base, the single active JARVIS roadmap, the maintainer handoff, and the focused release/security/domain references listed above. Remove retired plans and temporary handoffs from the active tree when their work is closed; Git history is the archive. Do not keep a file merely because it once belonged to a completed migration.

Never delete a file solely because a static import graph does not find it. External deployment tools, Vitest, Cloudflare, Firebase, and maintainability checks may consume non-document files indirectly; audit those consumers before deleting application/configuration assets. Keep `wrangler.toml` and `wrangler.deploy.toml` as active Worker deployment contracts.

Unreferenced metadata candidates still require external-consumer review before deletion:

- `firebase-blueprint.json`
- `metadata.json`

Never delete a file solely because a static import graph does not find it. External deployment tools, Vitest, Cloudflare, Firebase, and maintainability checks may consume files indirectly.

## 10. Standard validation gate

From the repository root (the directory containing `package.json`):

```bash
npm ci
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

For a deployment-related change, also verify the Cloudflare Worker health/version endpoints and run the documented production smoke checks. Never print secrets or commit credentials.

## 11. Direct operating rules for a future owner-authorized task

1. Start by checking `git status --short --branch`, `git rev-parse HEAD`, and `git rev-parse origin/main`.
2. Read this file, `AGENTS.md`, and `PROJECT_WORKING_AGREEMENT.md` before substantial work; for a roadmap task, check the relevant status and acceptance criteria.
3. Choose one bounded task; do not mix cleanup with business-logic changes.
4. Preserve server authority and existing UI/UX.
5. Use synthetic/in-memory data unless the owner explicitly authorizes a safe external workflow.
6. Run focused tests, then the full validation gate.
7. Use a short-lived branch and reviewed PR for code changes; never bypass the current release gate.
8. Use the “RQ handoff” trigger in `PROJECT_WORKING_AGREEMENT.md` for factual continuity handoffs. It does not authorize deployment or data operations.

This file is the project orientation layer. The JARVIS roadmap is the only active modernization plan.

## 12. Historical verified handoff — 2026-10-16

- PR #67 accumulated FE-002, FS-05, FS-04, WKR-03, WKR-01/PERF-01, and WKR-02 on `main` at `bb537194ec3be199d1afd757643ee22faf95aeb4`.
- FS-03 was implemented on a short-lived branch and merged in PR #73 at `31f733fac610cd2dce5b28cbbd28dce1ecd396b2`. Owner-approved undated report behavior is the latest 12 calendar months; explicit date ranges preserve access to older history. Events and settlements now page via stable timestamp/document-name cursors (250 per page) and aggregate incrementally with exact parity, date-boundary, and delegate tests.
- `npm run ci:check` passed with 125 test files / 807 tests, TypeScript, Pages/Worker builds and artifact verification; maintainability and whitespace checks passed. Synthetic 1/3/10-year benchmark results are documented in the active plan and handoff; they are not live Firestore/Worker measurements.
- Post-merge Production Gate [#38921482843](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38921482843) and Worker deployment [#38921482881](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38921482881) passed. Live Pages, Worker health and version endpoints returned HTTP 200. The feature branch was deleted. No production Firebase data/settings changed.
- WKR-02 uses maintained summary documents with bounded fast paths and stale/missing fallback rebuilds. Do not remove the fallback until parity evidence supports it.
- **Historical next step:** FS-02 was next at this 2026-10-16 checkpoint and was later completed in PR #86; see the current continuation point at the top of this file.

## 13. BILL-06 implementation checkpoint — 2026-10-17 (merged PR #101)

- Starting Git baseline was clean `main`/`origin/main` at `ae8111058e288dfcc2f3052b86624895a6fb14f8`; implementation commit `2148171b5a9322db487a95729f4c6a5afe239a67` shipped in PR [#101](https://github.com/tarekhamada875-droid/RQ-/pull/101), merged at `f99a67b2e7023d61d36fd1df1f27c40cf9bbc071`.
- Added Worker-only Admin manual grants for already prepaid-enabled garages, with explicit offline-payment confirmation/reference/reason, either a credit-bundle template or a positive integer amount, atomic paid-bucket update, idempotency, and auditable ledger/activity records. Existing legacy EGP balance, subscription, and expiry are not touched; legacy garages are rejected rather than activated.
- Added garage-scoped cursor-paged credit history (50 default, existing 100 maximum), Admin full audit details, and limited garage-visible history fields. Admin garage detail UI supports manual/template grants and history; the garage balance card has read-only history and no checkout.
- First-paid-grant referral reward logic writes the approved separate 20-credit ledger/marker record only where the referrer is already `prepaid_credits`; it intentionally does not create a `creditBalance` on a legacy referrer, because that field enables prepaid check-in behavior. A legacy-referrer reward therefore remains deferred to an explicit future cutover/eligibility decision; no legacy garage is implicitly switched in this task.
- The index declaration was deployed with owner approval as composite index ID `CICAgJj7z4EK` and is Enabled in project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`. No Firebase documents or rules changed. The merged Worker was deployed and its health smoke passed; Pages was not changed.
- Final focused check: TypeScript and 11 focused tests passed (9 Worker route integration tests, 2 Admin panel UI tests). Local `npm run ci:check` passed with 130 files / 856 tests and production artifact verification; `npm run maintainability:check` and `git diff --check` passed. GitHub push and PR Production Gates passed on retry after initial transient timeouts in the existing Node-adapter concurrency test. Post-merge Production Gate [39033339698](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39033339698) and Worker deployment/health smoke [39033339649](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39033339649) both succeeded. Generated `dist/` and `build/` were removed. Stop at BILL-06; do not begin BILL-07 until owner instruction.


## BILL-08 Trial-credit implementation checkpoint (2026-10-17; local only)

The owner selected **non-expiring Trial credits after conversion**. The local implementation now models `trial` separately from paid and referral balances. Remaining trial time previews at 10 credits per rounded-up remaining day; Trial credits are eligible for regular non-subscriber entries, cannot pay monthly subscriber renewals, and restore to the Trial bucket after an authorized correction. Garage/Admin balance views and financial reporting expose Trial values separately. Existing prepaid records remain compatible with a missing Trial field treated as zero. No live migration, Firestore balance change, cutover route, or deployment has been performed. Focused TypeScript and 46-test validation passed; full repository validation and the normal PR/release workflow remain pending.


## Latest deployed Jarvis checkpoint — legacy garage billing retirement (2026-10-17)

The owner confirmed that current garages/data are test-only and approved retiring active time-based RQ garage billing. PR [#114](https://github.com/tarekhamada875-droid/RQ-/pull/114) merged at `a85ac79888f4e1e52792dfdc2966a3ac3e5c3272`; post-merge Production Gate [39050430571](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39050430571) and Worker deployment [39050430577](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39050430577) passed. New garages are prepaid-credit-only with empty paid/referral/Trial balances. The owner-side package-purchase UI was removed; legacy expiry, daily-capacity, fair-use, wallet top-up, self-subscribe, recharge, and referral-day runtime paths are retired and return `LEGACY_BILLING_MODEL_RETIRED` (HTTP 410). Historical records remain intact, and date-based monthly subscriptions that garages sell to their customers remain separate and active. Local validation passed at 132 test files / 870 tests, plus TypeScript, production build, maintainability, and diff checks.

**Next inline JARVIS task:** F2 — make reconciliation day-safe for wider/malformed event arrays and add day-boundary/parity coverage. Then do F3’s revised RQ-classifier cleanup, followed by the RQ-TG release-reliability work. Historical balance conversion remains optional and separately approval-gated; any further deletion of unreachable legacy handler code should be a bounded cleanup, not a billing-model redesign.
