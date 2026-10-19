# LR-03 Source Inventory — Owner-Side Wallet and Self-Subscribe Wiring

**Inventory date:** 2026-10-19
**Task status:** Read-only source inventory complete; LR-03 implementation has **not** been selected or started.
**Inventory baseline:** clean `main` at `effe777cf2c3e300031a58d04861813cee951c84`, matching `origin/main`. No source, tests, or configuration were changed by the inventory.

## 1. Verified repository and release state

- Local branch: `main`; working tree clean; `HEAD == origin/main == effe777cf2c3e300031a58d04861813cee951c84`.
- No open pull requests at inventory time.
- Latest main Production Gate: run [39214987627](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39214987627), successful for main SHA `effe777cf2c3e300031a58d04861813cee951c84`.
- Live Worker `/api/health` and `/api/version` both reported application SHA `935e93c336e61bcc4cfc4cf259c4cd8be028bb0d`, the LR-02 code merge (PR #171). The later main commit `effe777...` is the documentation-only LR-02 completion checkpoint (PR #172); do not confuse repository identity with deployed application identity.
- Protected `readiness/firestore-decision-gate` branch observed at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`.

## 2. LR-03 plan boundary

The active plan says LR-03 removes `admin-topup-balance`, `garage-self-subscribe`, `use-referral-reward`, dead top-up modal state, wallet UI compatibility props, wallet service methods, and legacy owner purchase handlers. It protects Admin manual credit entry, credit templates, credit-ledger history, garage login/session behavior, and subscriber management. Acceptance requires no owner/Admin UI to enter or spend a legacy EGP balance, no client calls to retired endpoints, and fail-closed old endpoints with dead handler bodies removed.

This inventory does **not** authorize or start that implementation. Wallet-number/payment-destination configuration, broad historical-field cleanup, data migration, deletion, and Firebase changes are not included. The plan assigns broader wallet-number/config/type retirement to LR-06 after caller inventory.

## 3. Exact inventory counts versus likely change count

The five-area audit catalogued **59 unique active/test/type paths** for classification: 37 production paths, 21 test paths, and 1 type/config/documentation path. It separately identified **9 review-only paths**. These are the broad reference surfaces inspected—not 68 files expected to change. Many of the counted paths are explicitly protected and should stay unchanged.

Within that broad set:

- **8 direct production cleanup candidates** are listed in §4.
- **6 directly related test candidates** are listed in §5, although some may not need edits if the existing authenticated 410 route contract is retained.
- **9 conditional production/type/config candidates** and **4 conditional test candidates** are listed in §6. They depend on whether compatibility-only props, package state, or shared types are proven to be part of LR-03 rather than LR-06 or historical read support.
- Project completion/status notes will normally add about 3–4 documentation files when implementation is eventually selected.

A narrow implementation is likely around **14–18 changed files including status notes**; expanding into all conditional compatibility surfaces could raise the code/test/type candidate set to 27 files plus documentation. This is a range, not a committed diff count; the final number is only known after the owner selects implementation and the change is tested.

## 4. Direct production candidates

1. `server/financialRoutes.ts` — `POST /api/transactions/admin-topup-balance` returns authenticated HTTP 410 at the start of its handler, but the unreachable body remains below it, including legacy balance mutation, `activity_logs`/wallet events, `manual_credit_ledger`, and idempotency writes.
2. `server/garageRoutes.ts` — `POST /api/transactions/garage-self-subscribe` and `POST /api/transactions/use-referral-reward` each return authenticated HTTP 410 before their old bodies. The bodies remain in source: legacy balance/package/expiry changes for self-subscribe and referral-day expiry changes for reward use. Retained credit-grant and credit-ledger routes are nearby and must not be removed.
3. `server/cloudflareWorker.ts` — imports/injects `decideManualCredit` for the retired Admin top-up. Remove only that retired dependency; keep prepaid-credit, subscriber, auth, and session wiring.
4. `server/domain/manualCredit.ts` — exports `decideManualCredit`, used by the retired legacy Admin top-up path; remove only if a final reference audit confirms it has no other caller.
5. `src/services/garageService.ts` — defines client methods `adminTopupGarageBalance`, `garageSelfSubscribe`, and `useReferralRewardDays`, which call the three retired endpoints. Retain unrelated garage CRUD and session methods.
6. `src/components/admin/AdminGarageDetailsView.tsx` — owns dead top-up modal state and the direct `handleTopupSubmit` path. It also has `handleClearBalance`, which writes legacy `balance: 0` and `balanceExpiry`; include that wallet action in the LR-03 review and remove only within the selected legacy-wallet boundary. Preserve `AdminCreditGrantPanel` and unrelated garage settings.
7. `src/components/admin/garage-details/AdminGarageFinancialsSection.tsx` — has unused wallet/top-up and clear-balance compatibility props; preserve monthly-subscriber settings and referral relationship display.
8. `src/components/admin/garage-details/AdminGarageModals.tsx` — has unused top-up modal compatibility props; preserve staff, PIN, and other Admin modal behavior.

**Route compatibility recommendation:** keep the current authenticated HTTP 410 tombstones and remove their dead bodies. This is consistent with LR-01/LR-02 and existing tests; replacing the routes with 404s is not required by the plan and would change the compatibility contract.

## 5. Directly related test candidates

- `src/__tests__/workerRouteExtraction.test.ts` — includes the retired transaction paths in the route manifest. If authenticated 410 tombstones remain registered, preserve route-count/registration coverage; change only if the route contract itself changes.
- `server/honoApi.contract.test.ts` — unauthenticated mutation table currently expects 401 for these endpoints. That remains valid if the authenticated 410 tombstones stay registered.
- `src/__tests__/cloudflareWorkerFinancialRoutes.test.ts` — already covers legacy Admin top-up retirement alongside financial reports and ledger behavior; confirm/add assertions for no body parsing or writes without weakening report coverage.
- `src/__tests__/cloudflareWorkerGarageRoutes.test.ts` — best current location to assert authenticated 410/no-write behavior for self-subscribe and referral reward, while retaining other garage route tests.
- `server/manualCredit.test.ts` — exercises the legacy helper and is a removal/replacement candidate if the helper is deleted.
- `src/__tests__/modularizedComponents.test.tsx` — mocks the old Admin top-up service method and checks legacy wallet labels; update it to cover the new Admin garage-details contract and retained credit panel.

## 6. Conditional compatibility files — inspect before including

### Production/type/config candidates (9)

- `src/components/garage/GarageDashboardView.tsx` — contains a fallback based on `garage.balance`; remove or isolate it if it still gates owner access after wallet retirement, without breaking the credit-only prompt or subscriber view.
- `src/App.tsx` and `src/components/app/AppRoutes.tsx` — pass wallet-number compatibility state/props. Trace consumers before removing; wallet number is payment-contact configuration, not a garage EGP balance.
- `src/hooks/useGarageApp.ts` and `src/hooks/useGarageSystemConfigSync.ts` — carry `walletNumber`/`subscriptionPrices` state. Narrow only props proven to be legacy purchase wiring; preserve session and subscriber state.
- `src/components/admin/AdminDashboard.tsx` and `src/components/admin/AdminNavigationAndViews.tsx` — pass unused `currentWalletNumber`/`onUpdateWalletNumber` props. Remove only the compatibility props required by LR-03; do not remove Admin credits, templates, or reports.
- `src/constants/packages.ts` — contains legacy balance presets and package filtering; retain credit-bundle catalog behavior and include only if an active LR-03 consumer is proven.
- `src/types.ts` — mixes legacy wallet fields with prepaid credits, subscribers, sessions, and historical activity discriminants. Avoid broad type deletion; LR-06 and historical readers remain relevant.

### Conditional tests (4)

- `src/hooks/useGarageApp.test.tsx`
- `src/components/garage/GarageDashboardView.listeners.test.tsx`
- `src/components/admin/AdminDashboard.test.tsx`
- `src/components/admin/AdminNavigationAndViews.delete.test.tsx`

Change these only if the corresponding compatibility props/state are removed.

### Review-only/defer candidates

- `src/components/admin/AdminWalletView.tsx`, `src/services/adminCoreService.ts`, and `src/services/adminSystemConfigService.ts` handle wallet-number/payment configuration, not the garage’s spendable EGP balance; LR-06 covers broader wallet/config retirement.
- `src/services/adminServiceTypes.ts` and `server/events.ts` contain report or historical event fields; preserve until a separate read-model/history decision.
- `server/domain/billingMigrationRehearsal.ts` is a non-mutating migration rehearsal/read-model; do not remove or convert stored values in LR-03.
- Existing tests for Admin credit grants, credit templates, ledger/report history, subscriber lifecycle, and garage session/auth are protected regression coverage, not presumed edit targets.

## 7. Protected behavior and data boundary

Keep the current Admin prepaid-credit path (`POST /api/garages/:id/credit-grants`), scoped credit ledger (`GET /api/garages/:id/credit-ledger`), credit-bundle templates, current referral-credit award path, subscriber CRUD and renewal, and role-scoped garage login/session claims/releases/heartbeats. Preserve reporting distinctions between EGP payment audit metadata and spendable credit quantities. Historical wallet/recharge fields and activity records remain read-only/tolerated unless separately authorized; no Firestore deletion, migration, or Firebase data/rules change is part of LR-03.

## 8. Recommended validation once LR-03 is selected

1. Re-fetch `main`, confirm clean `HEAD == origin/main`, open PR state, current Worker SHA, and protected decision-branch SHA.
2. Add/adjust fail-closed authenticated route tests proving no request body processing or database write; preserve unauthenticated 401 behavior and route-specific role denials.
3. Test that Admin prepaid credit entry, credit templates/ledger/reporting, subscriber management, and garage login/session behavior remain intact.
4. Run focused tests first, then `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` once the source change is stable.
5. Update status notes, review the diff, commit/push a focused branch, open a PR, wait for the required Production Gate, merge only after it passes, and verify the post-merge main gate/deployment and live Worker SHA.

## 9. Continuity status

LR-03 remains **unselected and unstarted**. The single next task is to wait for the owner’s explicit selection before implementation. This inventory is a planning aid only; it does not grant permission to start the LR-03 code change.
