  > **Current authority fence (2026-10-19; LR-06 local, pre-PR):** LR-01 through LR-05 are released/implemented through their recorded checkpoints; LR-06 is implemented locally on `feat/lr06-retire-obsolete-config-contracts`. Wallet payment-number and legacy subscription-price config no longer cross active Worker, client, Admin, or garage contracts; authenticated reads omit the fields and writes reject them. The obsolete wallet Admin view/service/utility and synchronization state are removed. Firestore rules require the active credit-bundle package shape and no longer grant retired admin-setting reads; historical records remain readable through reporting adapters. Focused regressions passed 6 files / 50 tests; lint and diff checks passed. Full CI and the PR/release cycle remain; do not begin LR-07 until complete. LR-01 through LR-04 are released/implemented through their recorded checkpoints; LR-05 is implemented locally on `feat/lr05-retire-legacy-time-authorization`. Prepaid garage access no longer uses garage-owner expiry state in active dashboard authorization, subscriber management, or vehicle entry; customer subscriber dates remain date-based. Fair-use extension aliases are authenticated 410 no-write tombstones with the unreachable writer, client method, and unused domain module/tests removed. Historical reporting adapters remain read-only. Focused regressions passed 4 files / 29 tests plus 4 policy/history files / 16 tests; lint and full CI passed 136 test files / 887 tests, rules, builds, Worker artifact smoke, maintainability, and artifact verification. No Firebase data/rules, migrations, or stored-record changes occurred. The branch still requires commit, PR gate, merge, and post-merge verification; do not begin LR-06/LR-07 until complete.


## Current checkpoint: LR-06 implemented locally (2026-10-19)

LR-06 retires wallet payment-number and legacy subscription-price configuration from active Worker/API, client, Admin UI, and garage route contracts. Authenticated system-config reads omit the retired fields; writes reject them before persistence. The empty subscriptions app group, wallet Admin view, client update method, sync hook, and wallet utility are removed. Firestore rules now require explicit credit-bundle package shape while retaining read compatibility for historical records.

Focused regressions passed 6 files / 50 tests; `npm run lint` and `git diff --check` passed. No stored records, migrations, or live deployment were changed.

**Next step:** Commit, push, open the LR-06 PR, wait for the required Production Gate, merge only after it passes, and verify the merged `main`, post-merge gate/deployment, live Worker identity, open-PR count, and protected decision branch.


## Historical checkpoint: LR-04 implemented locally (2026-10-19)

The selected LR-04 package/catalog cleanup is implemented on `feat/lr04-credit-bundle-package-model`. The active Admin package route requires `catalogType: 'credit_bundle'`; the shared validator rejects explicit type/shape mismatches and preserves legacy records only as readable historical records; the prepaid grant route rejects legacy-time package templates before any balance or ledger write; the package listener avoids adding legacy defaults to credit bundles; and both Admin creation controls stop sending the legacy `vehiclesCount` field.

Focused package/catalog, grant, package UI, and route-parity regressions passed (4 files / 43 tests). `npm run lint`, `npm run ci:check` (137 test files / 890 tests, Firestore rules, Pages/Worker build, Worker artifact smoke, maintainability, and artifact verification), and `git diff --check` passed. No Firebase data/rules, migration, or stored-record change occurred.

**Next step:** Review, commit, push, open the LR-04 PR, wait for the required Production Gate, merge only after it passes, and verify the merged `main`, post-merge gate/deployment, live Worker identity, open-PR count, and protected decision branch.

## Historical checkpoint: LR-03 merged, deployed, and live (2026-10-19)

The read-only source audit is recorded in [`docs/RQ_LEGACY_REMOVAL_LR-03_SOURCE_INVENTORY_2026-10-19.md`](docs/RQ_LEGACY_REMOVAL_LR-03_SOURCE_INVENTORY_2026-10-19.md). It found 59 unique active/test/type paths plus 9 review-only paths; these were audit references, not files to change. PR #176 kept the three authenticated HTTP 410 tombstones and removed only the unreachable writer bodies and client/UI wallet wiring, preserving prepaid credits, subscriber management, login/session behavior, and historical records.

The inventory snapshot was clean `main` `effe777cf2c3e300031a58d04861813cee951c84`; see the inventory report for the exact snapshot values and scope. After its documentation handoff PR, final verification confirmed clean local `main == origin/main == da890e230f0854bed1e6adfcbd7651fc453b75fb`, no open PRs, and successful main Production Gate [39224257512](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39224257512) on that exact SHA. Live health/version report `935e93c336e61bcc4cfc4cf259c4cd8be028bb0d`; the Worker did not deploy on the documentation-only merge. Protected decision branch: `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`.

**Next step:** Stop after LR-03 completion and await a separate bounded roadmap selection. Keep to the plan and inventory boundaries; do not migrate/delete historical data or change Firebase data/rules.

> **Historical-record note:** Checkpoint sections below the active LR-03 entry are historical snapshots. Any older “next step” or “stop here” directive is superseded by the active Legacy Removal Plan and this LR-03 inventory checkpoint.

## Historical checkpoint: LR-02 complete (2026-10-19)

The user selected option 2: remove all in-app recharge-request history reads. PR #171 is merged as `935e93c336e61bcc4cfc4cf259c4cd8be028bb0d`; the post-merge Production Gate passed deployment and smoke, and the live Worker reports the exact SHA. The app/service/listener/pagination readers and Admin pending-count/history response contracts are removed; authenticated legacy routes fail closed and preserve route-specific role denials. Pending garage applications, delegate commission/settlement, historical activity-log reads, and stored request/guard records are preserved. The only remaining active collection reference is the unchanged garage-deletion cleanup adapter. No data cleanup, migration, Firebase rule/data, or database routing change occurred.

Focused route, authorization, and retained-history regressions passed (3 files / 27 tests). Full local `npm run ci:check` exited 0 (138 files / 889 tests, rules, builds, Worker smoke, maintainability, artifact verification); `npm run lint` and `git diff --check` passed. PR gate #39214021843 and post-merge gate #39214331450 both succeeded. LR-02 is merged and deployed; this task is complete.

**Historical next step at LR-02 completion:** LR-03 had not yet been selected. The owner later requested a read-only inventory, which is recorded in the active checkpoint above; LR-03 implementation remains unselected.

## Historical checkpoint: LR-01 direct Admin recharge retirement complete (2026-10-19)

LR-00 inventory `docs/RQ_LEGACY_REMOVAL_LR-00_BASELINE_INVENTORY.md` was merged in PR #167. LR-01 merged in PR [#169](https://github.com/tarekhamada875-droid/RQ-/pull/169) at `0d7b63009bd0b2a8a68736afb376f119a835f4c6`. `POST /api/transactions/recharge-garage` remains registered as an authenticated 410 tombstone; the transactional writer and unused client method are removed. Main Production Gate [39205342165](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39205342165) passed verify, deployment, and smoke. Live health/version both report the merge SHA. Current prepaid grants/ledger, referral credits, customer subscriber lifecycle/renewal, and historical reads are protected. No Firebase data/rules or database routing changed.

Validation: focused regressions passed (4 files / 71 tests); local full Production Gate passed (139 test files, Firestore rules, builds, Worker artifact smoke, maintainability, artifact verification); `npm run lint` and `git diff --check` passed. PR #169 and post-merge gate/deployment are complete. At that checkpoint LR-02 had not yet been selected; the current status is recorded above. Do not alter Firebase/data/rules/database routing.

## Historical checkpoint: UI-001 App route/modal containers released (2026-10-18)

PR [#156](https://github.com/tarekhamada875-droid/RQ-/pull/156) merged the route-selection and global-modal ownership extraction at main SHA `22411c191653683c35fefadf5fee1458b396b889`. The 604-line `src/App.tsx` is now 94 lines; typed `src/components/app/AppRoutes.tsx` and `src/components/app/AppOverlays.tsx` own route and overlay composition. `App.tsx` remains responsible for global auth/session readiness, offline/landscape gates, theme/network/toast shell, browser-history trapping, and the grouped `useGarageApp` boundary. `GarageAppState` is exported as the inferred hook return type. Existing lazy route loading, route props, fallback recovery, render diagnostics, wallet precedence, modal callbacks, and cleanup semantics are preserved; no Firebase/data/rules/database/billing/performance change is included.

`npm run lint`, focused UI regressions (4 files / 12 tests), `npm run maintainability:check`, `git diff --check`, and the full `npm run ci:check` passed before merge. PR verification passed, and main Production Gate [39126469934](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39126469934) passed 140 test files / 902 tests, Firestore rules emulator, frontend/Worker build, built-Worker artifact smoke, maintainability, verified artifact upload, guarded Worker deployment, and live smoke. The deployed Worker reports SHA `22411c191653683c35fefadf5fee1458b396b889`. **UI-001 is complete; UI-002 through UI-006 were already released in PRs #48, #57, #59, #64, and #65. The UI workstream is complete.** Do not duplicate released work or change Firebase data/rules, database routing, or run migrations without a new bounded selection.

## Historical checkpoint: grouped useGarageApp contract released (2026-10-18; superseded)

PR [#149](https://github.com/tarekhamada875-droid/RQ-/pull/149) merged the focused branch `feat/cross-f3-garage-app-contract` into `main` at `1f2cda9758d2b7936540519f1717b157d97af979`. `useGarageApp` now returns six named groups: `session`, `navigationUi`, `garageData`, `vehicleOperations`, `subscriptions`, and `adminManagement`. The existing flat aliases remain for this migration step, preserving callback and setter identity. `App.tsx` now consumes only the six grouped contracts; view routing, session readiness, offline gating, fallback recovery, modal handling, and cleanup behavior remain unchanged.

New renderHook characterization covers the grouped contract and handler identity. Focused checks passed 1 file / 1 test; full local `npm run ci:check` passed 140 test files / 902 tests, Firestore rules emulator, Pages/Worker build, built-Worker smoke, maintainability, and artifact verification. `npm run lint` and `git diff --check` passed. No Firebase data/rules, database routing, billing decision, migration, deployment, or performance claim changed. PR #149 passed its required Production Gate. Main Production Gate [39122733505](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39122733505) passed full verification, verified artifact upload, guarded Worker deployment, and live smoke. The live Worker reports the exact same SHA `1f2cda9758d2b7936540519f1717b157d97af979`.

**Historical Cross-F3 checkpoint (superseded):** At that time, no unfinished code task was recorded and the handoff said to await a bounded roadmap selection. The current authority fence above supersedes this historical status; LR-02 was not yet selected at that time.

## Historical checkpoint: admin service modules extracted locally (2026-10-18)

PR [#147](https://github.com/tarekhamada875-droid/RQ-/pull/147) merged the focused branch `feat/cross-f2-admin-service-modules` into `main` at `51121b473cc776f27db945639f3a957a3b2841d4`. The 790-line `adminService` implementation is now split into eight domain modules: core/staff, packages, subscribers, coupons, activity, billing, announcements, and system config. `src/services/adminService.ts` remains a compatibility facade that composes the modules; `src/services/index.ts` continues to expose the same `firestoreService` spread.

The public facade contract remains unchanged with 41 method keys. Method names, return values, pagination, listener cleanup, callback order, API/Firestore transport behavior, and system-config bootstrap/fallback behavior are preserved. New characterization coverage locks the key set and system-config call counts. No system-config policy change, Firebase data/rules change, database routing, billing decision, migration, deployment, or performance claim is included.

All modules are below the old 710-line service baseline. Focused checks passed 5 files / 22 tests; full local `npm run ci:check` passed 139 test files / 901 tests, Firestore rules emulator, Pages/Worker build, built-Worker smoke, maintainability, and artifact verification. `npm run lint` and `git diff --check` passed. PR #147 passed its required Production Gate. Main Production Gate [39121937326](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39121937326) passed full verification, verified artifact upload, guarded Worker deployment, and live smoke. The live Worker reports the exact same SHA `51121b473cc776f27db945639f3a957a3b2841d4`.

**Cross-F2 admin-service modularization is complete.** Stop here; do not begin Cross-F3 without a new task. Preserve the separate `readiness/firestore-decision-gate` branch and do not change database routing or run migrations.

## Historical checkpoint: garage-management route family extracted locally (2026-10-18)

PR [#145](https://github.com/tarekhamada875-droid/RQ-/pull/145) merged the focused branch `feat/cross-f5-worker-garage-routes` into `main` at `1074f5356a251c60a859b0d4b94709c1dd880198`. The CF8 garage-management family now lives in `server/garageRoutes.ts`: garage CRUD and reads, deletion/reconciliation/projection maintenance, staff/delegate administration, retired Supervisor tombstones, people PIN updates, admin announcements/coupons/packages, fair-use aliases, prepaid credit grants/ledger, legacy garage transaction endpoints, and cars-inside recalculation. The move is mechanical behind a typed `GarageRouteDeps` boundary. `server/cloudflareWorker.ts` retains global middleware, authentication/session infrastructure, the Worker app, family registration order, activity-log/spike endpoints, and default `fetch`.

Garage authorization, Egyptian plate-related garage behavior, PIN ownership and scope enforcement, deletion resumability, pagination, reconciliation/projection reads and writes, atomic credit/referral/transaction behavior, retired billing responses, and existing response shapes are unchanged. The route inventory regression test confirms all 38 CF8 registrations and the unchanged total of 89 registrations. No Firebase data, rules, database routing, billing decision, migration, deployment, or performance claim changed.

Focused regression checks passed: 6 files / 99 tests covering garage routes, credit grants, staff/delegate/admin parity, authorization, CF7 financial routes, and the full route inventory. The full local `npm run ci:check` passed: 138 test files / 898 tests, Firestore rules emulator, Pages/Worker build, built-Worker smoke, maintainability, and artifact verification. `npm run lint` and `git diff --check` passed. PR #145 passed the required Production Gate. Main Production Gate [39120945803](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39120945803) passed verification, artifact upload, guarded Worker deployment, and live smoke. The live Worker reports the exact same SHA `1074f5356a251c60a859b0d4b94709c1dd880198`.

**Cross-F1 garage-management extraction is complete.** Stop here; do not begin later roadmap work without a new task. Preserve the separate `readiness/firestore-decision-gate` branch and do not change database routing or run migrations.

## Cross-F4 financial-family release verification (2026-10-18)

PR [#143](https://github.com/tarekhamada875-droid/RQ-/pull/143) merged the financial/recharge/delegate route extraction into `main` at `98f1c3ba9dabd89ee302a20ce467cc8f3e943007`. Main Production Gate [39119755307](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39119755307) passed full verification, immutable artifact deployment, and strict live smoke. The live Worker health/version endpoints report the exact same SHA. The 15 CF7 routes are therefore merged, deployed, and live. No Firebase data/rules, database routing, billing decision, or migration changed.

Cross-F4 is complete for the financial/recharge/delegate family only. Stop here; do not begin garage-management extraction in this task.

## Historical checkpoint: financial/recharge/delegate route family extracted locally (2026-10-18)

The focused branch `feat/cross-f4-worker-financial-routes` starts from clean `main` `0bd030b4db3c5d4930a51ad24c2905b1a0fbe965`. The CF7 financial family now lives in `server/financialRoutes.ts`: recharge request creation/approval/rejection/listing, legacy top-up response, delegate dashboard/settlement, and financial reports. The move is mechanical behind a typed `FinancialRouteDeps` boundary. `server/cloudflareWorker.ts` retains global middleware, authentication/error/rate-limit handling, the Worker app, family registration order, garage-management routes, and default `fetch`.

Recharge and delegate transaction behavior, idempotency, pagination/cursor scopes, admin/delegate authorization, financial report date boundaries and filters, legacy retired responses, atomic Firestore transactions, credit/commission/event writes, and existing response shapes are unchanged. The route inventory regression test confirms the 15 CF7 registrations and the unchanged total of 89 registrations. No Firebase data, rules, database routing, billing decision, migration, deployment, or performance claim changed.

Focused regression checks passed: 6 files / 89 tests covering all 13 financial-route tests, CF7 route inventory, authorization, subscribers, vehicles, and read routes. The full local `npm run ci:check` passed: 138 test files / 898 tests, Firestore rules emulator, Pages/Worker build, built-Worker smoke, maintainability, and artifact verification. `npm run lint` and `git diff --check` passed. This is local only; the branch has not yet been pushed or opened as a PR.

**Next step:** finish the normal PR cycle for this financial-family extraction: commit/push, open the PR, wait for the required Production Gate, merge only after it passes, verify the guarded release/live result, then stop. Do not start garage-management extraction in this task. Preserve the separate `readiness/firestore-decision-gate` branch and do not change database routing or run migrations.

## Cross-F3 subscriber release verification (2026-10-18)

PR [#141](https://github.com/tarekhamada875-droid/RQ-/pull/141) merged the subscriber route extraction into `main` at `53f1abb9e9437586ee3497767e88b9f594718ca7`. Main Production Gate [39118898026](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39118898026) passed full verification, immutable artifact deployment, and strict live smoke. The live Worker health/version endpoints report the exact same SHA. The four subscriber lifecycle routes are therefore merged, deployed, and live. No Firebase data/rules, database routing, billing decision, or migration changed.

Cross-F3 is complete for the subscriber family only. Stop here; do not begin financial/recharge/delegate or garage extraction in this task.

## Historical checkpoint: subscriber route family extracted locally (2026-10-18)

The focused branch `feat/cross-f3-worker-subscriber-routes` starts from clean `main` `274eaff9bdda8a0453be35eebab2e26a54d94d68`. The four subscriber lifecycle registrations now live in `server/subscriberRoutes.ts`: add, renew, update, and delete. The move is mechanical behind a typed `SubscriberRouteDeps` boundary. `server/cloudflareWorker.ts` retains global middleware, authentication/error/rate-limit handling, the Worker app, family registration order, financial/recharge routes, and default `fetch`.

Subscriber lifecycle decisions, Egyptian plate normalization and immutability, duplicate lookup precedence, prepaid five-credit renewal debit, idempotency, atomic Firestore transactions, maintained garage/global subscriber summaries, domain events, and existing responses are unchanged. The route inventory regression test confirms subscriber order and the unchanged total of 89 registrations. No Firebase data, rules, database routing, billing decision, deployment, or performance claim changed.

Focused regression checks passed: 5 files / 76 tests covering all 10 subscriber tests, vehicle/read regressions, authorization, and route inventory. The full local `npm run ci:check` passed: 138 test files / 898 tests, Firestore rules emulator, Pages/Worker build, built-Worker smoke, maintainability, and artifact verification. `npm run lint` and `git diff --check` passed. This is local only; the branch has not yet been pushed or opened as a PR.

**Next step:** finish the normal PR cycle for this subscriber-family extraction: commit/push, open the PR, wait for the required Production Gate, merge only after it passes, verify the guarded release/live result, then stop. Do not start financial/recharge/delegate or garage extraction in this task. Preserve the separate `readiness/firestore-decision-gate` branch and do not change database routing or run migrations.

## Cross-F2 vehicle release verification (2026-10-18)

PR [#139](https://github.com/tarekhamada875-droid/RQ-/pull/139) merged the vehicle route extraction into `main` at `d9e4ced185436b1f42c8aa31a39f788d9df32535`. Main Production Gate [39118117050](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39118117050) passed full verification, immutable artifact deployment, and strict live smoke. The live Worker health/version endpoints report the exact same SHA. The six vehicle routes are therefore merged, deployed, and live. No Firebase data/rules, database routing, billing behavior, or migration changed.

Cross-F2 is complete for the vehicle family only. Stop here; do not begin subscriber or admin-service extraction in this task.

## Historical checkpoint: Cross-F2 vehicle route family extracted locally (2026-10-18)

The focused branch `feat/cross-f2-worker-routes` starts from clean `main` `a33e00b74d51adc863cec1d1dc0a7ed3f4277a11`. The six vehicle registrations now live in `server/vehicleRoutes.ts`: check-in, check-out, delete, refund, inside, and history. The move is mechanical behind a typed `VehicleRouteDeps` boundary. `server/cloudflareWorker.ts` retains global middleware, authentication/error/rate-limit handling, the Worker app, family registration order, subscriber routes, and default `fetch`.

The vehicle transaction logic is unchanged, including Egyptian plate normalization, idempotency, atomic credit debit/restore, maintained summaries, projections, activity logs, and domain events. The Firestore binding is resolved lazily inside handlers. The route inventory regression test confirms the vehicle order and unchanged total of 89 registrations. No Firebase data, rules, database routing, billing behavior, deployment, or performance claim changed.

Focused regression checks passed: 5 files / 75 tests covering vehicle routes, authorization, read routes, foundation, and route inventory. The full local `npm run ci:check` passed: 138 test files / 898 tests, Firestore rules emulator, Pages/Worker build, built-Worker smoke, maintainability, and artifact verification. `npm run lint` and `git diff --check` passed. This is local only; the branch has not yet been pushed or opened as a PR.

**Next step:** finish the normal PR cycle for this vehicle-family extraction: commit/push, open the PR, wait for the required Production Gate, merge only after it passes, verify the guarded release/live result, then stop. Do not start subscriber or admin-service extraction in this task. Preserve the separate `readiness/firestore-decision-gate` branch and do not change database routing or run migrations.

## Cross-F1 release verification (2026-10-18)

PR [#137](https://github.com/tarekhamada875-droid/RQ-/pull/137) merged into `main` at `ba194ea33a04dfc499292d1a67568486c116ba71`. Main Production Gate [39117269934](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39117269934) passed both verification and the guarded Worker deployment/live smoke. The live Worker health/version endpoints report the exact SHA `ba194ea33a04dfc499292d1a67568486c116ba71`. The first Cross-F1 read/system family is therefore merged, deployed, and live. No Firebase data/rules, database routing, billing behavior, or migration changed.

This was a historical sequencing note for Cross-F1 and is superseded. The current next task is LR-00 in the Legacy Removal Plan.

## Historical checkpoint: Cross-F1 first route family extracted locally (2026-10-18)

The focused branch `feat/cross-f1-worker-read-routes` starts from verified `main` `410f74df446d8b143ad4f609d774151298bdf807`. The first Cross-F1 read/system family now lives in `server/readRoutes.ts`, with shared lookup/date/sanitization helpers in `server/workerReadHelpers.ts`. `server/cloudflareWorker.ts` retains global middleware, authentication/error/rate-limit handling, the Worker app, registration point, and default `fetch` export. Route aliases and registration order are preserved.

A typed `RouteDeps` boundary supplies the route family’s dependencies; the Firestore binding is resolved lazily inside handlers so module registration does not add import-time reads or change test/runtime initialization. A route-inventory regression test confirms the nine extracted registrations and the unchanged total of 89 Worker registrations. No Firebase data, rules, database routing, billing behavior, or deployment changed.

Focused regression checks passed: 6 files / 85 tests covering read routes, foundation/auth, vehicles, subscribers, authorization, and route inventory. The full local `npm run ci:check` passed: 138 test files / 898 tests, Firestore rules emulator, Pages/Worker build, built-Worker smoke, maintainability, and artifact verification. `npm run lint` and `git diff --check` also passed. This is local only; the branch has not yet been pushed or opened as a PR.

**Next step:** finish the normal Cross-F1 PR cycle for this first family: commit/push, open the PR, wait for the required Production Gate, merge only after it passes, verify the guarded release/live result, then stop. Do not begin vehicle extraction in this task. Preserve the separate `readiness/firestore-decision-gate` branch and do not change database routing or run migrations.

# RQ Maintainability Handoff

## Historical checkpoint: RQ-TG-06 merged, deployed, and verified (2026-10-18)

PR [#133](https://github.com/tarekhamada875-droid/RQ-/pull/133) merged at `ce828f6e857e266e967f75246440759a9f3ceba5`. PR Production Gate [39110741500](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39110741500) and main Production Gate [39110920191](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39110920191) passed. The main run imported and smoke-tested the built Worker after build and after downloading the exact artifact, then deployed it. Strict live smoke reported a healthy backend and frontend, version `1.0.0-production`, and exact commit SHA `ce828f6e857e266e967f75246440759a9f3ceba5`.

TG-06 makes `npm run ci:check` stop after its first failure, identify the failed check and the skipped checks, and provide the troubleshooting command `npm run ci:check -- --diagnostics` for explicitly collecting multiple failures. The local gate now includes maintainability and artifact checks in line with Production Gate. No customer-facing behavior or Firebase data/rules changed.

Focused fail-fast and workflow regression tests passed (2 files / 12 tests). The clean-install full local gate passed (137 test files / 895 tests, Firestore rules emulator, production build, built-Worker smoke, maintainability, and artifact verification); `npm run maintainability:check`, `npm run lint`, and `git diff --check` passed. The first full attempt correctly stopped on an old test expectation that still referred to the previous inline script; the test was updated for the shared runner, and the final full gate passed. A non-blocking existing Vite configuration warning appeared during Vitest.

**Historical continuity authorization (2026-10-18; superseded):** Tarek invoked the “tokens ending” handoff and asked for a new agent to continue. The successor was authorized to begin Cross-F1 at that time, and that decomposition was subsequently released. This old authorization is not permission to restart Cross-F1 or begin any new task. It does not authorize Firebase data/rules changes, database migrations, or production data operations.

**Historical next-task record: Cross-F1 — extract Worker route families one at a time.** This was completed by later released PRs and is not a current instruction. The current next task is LR-00 in the Legacy Removal Plan.

**Workspace cleanup and preserved work:** Before this handoff-only change, local `main` was clean at `893f8e1725f42a166fe96b9c4d735bda0113704a`, matching `origin/main`; no PRs were open. Local copies of merged branches for PRs #121–#134 and their stale remote-tracking references were removed. The generated `firestore-debug.log` and empty `.wrangler/tmp` were removed; `node_modules` was retained to avoid an unnecessary reinstall. The only non-main GitHub branch is `readiness/firestore-decision-gate` at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`; it has unique, unmerged documentation in `PRODUCTION_READINESS_CHECKLIST.md` and `docs/FIRESTORE_DATABASE_DECISION.md`, with no PR. It records a pending owner choice between a default-database migration and named-database billing. Preserve it; do not merge, delete, change database routing, or run a migration without Tarek’s separate decision. It is separate from Cross-F1.

## Previous checkpoint: RQ-TG-05 merged, deployed, and verified (2026-10-18)

PR [#131](https://github.com/tarekhamada875-droid/RQ-/pull/131) merged at `35d16137e48044eae53c0972ee22348936a3c343`. At the TG-05 release checkpoint, `main` and the deployed Worker were at this commit. PR Production Gate [39108512061](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39108512061) and main Production Gate [39108719316](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39108719316) passed. The main run imported and smoke-tested the artifact after build and after download, then deployed it and passed strict live smoke. Direct read-only health and version requests returned healthy/operational status and the exact deployed SHA. This follow-up is documentation-only and does not redeploy the Worker. No customer-facing application behavior or Firebase data/rules changed.

TG-05 adds `tools/worker-artifact-smoke.mjs`, which imports `dist/worker.js` and checks the default Worker handler, health/version responses, allowed-origin CORS, and an unauthenticated protected request. It passes only synthetic Worker bindings and no Firebase credentials. The protected check is a GET that returns 401 before any database access. The command runs in local `npm run ci:check`, in Production Gate after building and before uploading, and again after downloading the exact artifact and before deployment.

Focused workflow regression tests passed (1 file / 6 tests). Clean-install `npm run ci:check` passed (136 test files / 889 tests, Firestore rules emulator tests, production build, and built-artifact smoke); `npm run maintainability:check` and `git diff --check` passed. The artifact smoke itself makes no live-service calls. Only the established post-deploy GET smoke and direct health/version GETs contacted the live read-only endpoints; no Firebase data/rules or application behavior changed. The focused Vitest run printed a non-blocking existing Vite esbuild/oxc configuration warning; all tests passed.

**Faster release workflow:** PR [#127](https://github.com/tarekhamada875-droid/RQ-/pull/127) removed the duplicate feature-push gate; the feature-branch push started no run, while the PR got one required check. Only an older check for the same PR may be cancelled; main releases are never cancelled. Documentation-only PR [#128](https://github.com/tarekhamada875-droid/RQ-/pull/128) also passed its fast text-only gate without redeploying the Worker. The master roadmap now includes a verified step-by-step continuation procedure for future agents.

## Previous checkpoint: RQ-TG-04 merged and deployed (2026-10-18)

PR [#129](https://github.com/tarekhamada875-droid/RQ-/pull/129) merged at `d9c52509c85ebdc4e8d4ea852a921efdc7f673e7`; its PR Production Gate [39106750461](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39106750461) and main Production Gate [39106925290](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39106925290) passed, including deployment and strict live smoke. TG-04 pinned `firebase-tools` at `15.34.0` and added the Firestore rules suite to local `npm run ci:check`; local clean-install CI passed at 136 test files / 888 tests. No customer-facing behavior or Firebase data/rules changed.

## Previous checkpoint: F3 RQ classifier isolation (2026-10-17; merged PR #119 and deployed)

F3 removes the obsolete duration/capacity/unlimited/fair-use classifier from active RQ access behavior. The Worker vehicle-entry decision no longer receives or evaluates classifier state; the frontend no longer applies daily-capacity or legacy subscription-expiry gates to prepaid garages; prepaid dashboard depletion uses paid/referral/trial credits; Admin package creation accepts only credit bundles; and both fair-use extension aliases return HTTP 410 without writes. Garage-owned monthly parking subscriptions remain date-based, and historical records remain readable.

Focused F3 regressions passed. Full `npm run ci:check` passed with 132 test files / 866 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, balances, or configuration was changed. PR #119 merged at `7f7778c`; its Production Gate [39054718882](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054718882) and guarded Worker deployment/health smoke [39054719171](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054719171) passed. `main` and `origin/main` were clean and matched at that checkpoint.

## Previous checkpoint: F2 Cairo-day reconciliation (2026-10-17; merged PR #117)

The focused branch `fix/f2-cairo-day-reconciliation` implements the next JARVIS task. `server/projections.ts` now owns the shared `getCairoDateKey` helper, which safely handles ISO strings, numbers, `Date` values, Firestore-like `toDate()` values, and malformed timestamps. Daily projection and `server/domain/garageReconciliation.ts` use the same Cairo-date predicate, so off-day and invalid events cannot affect today’s counts or revenue. `totalRecordedEvents` intentionally remains the raw input-array length for diagnostic visibility.

Regression coverage includes previous-day, next-day, Cairo boundary, missing, invalid, and non-date timestamps plus projection/reconciliation parity. Focused coverage passed (63 tests across reconciliation, projection, parity, and Worker garage-route tests). Full `npm run ci:check` passed with 132 test files / 871 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, configuration, or deployment was changed.

PR #117 merged at `eaca8db`; the post-merge Production Gate and guarded Worker deployment/health smoke passed. Historical next JARVIS task record (superseded): F3 removed or isolated the obsolete RQ duration/capacity/unlimited classifier without affecting garage-owned date-based monthly subscriptions.

## Previous checkpoint: legacy garage billing retirement (merged PR #114)

The owner confirmed that current garages/data are test-only and approved retiring the old time-based garage plan and EGP-wallet model without preserving active compatibility behavior. PR #114 makes new garages prepaid-credit-only with `{ paid: 0, referral: 0, trial: 0 }`, removes the garage package purchase UI, makes vehicle check-in ignore legacy expiry/daily-capacity/fair-use billing gates, and returns `LEGACY_BILLING_MODEL_RETIRED` (HTTP 410) from the old recharge, wallet top-up, self-subscribe, and referral-day endpoints. Monthly subscriptions sold by garages to their own customers remain separate and are not removed. Historical records are not deleted or rewritten. PR gates, post-merge Production Gate, and guarded Worker deployment/health smoke passed. Local validation passed at 132 test files / 870 tests, TypeScript, production build, maintainability, and diff checks.