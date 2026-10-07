# RQ Integrated Acceptance Test Report — 2026-10-06

## Decision

**OPEN — H6 remains incomplete. Browser login/session evidence covers Admin, Delegate, Garage Owner, Staff, and Supervisor, but a source audit found a Supervisor permission mismatch: the garage-list endpoint and direct Firestore rules grant global reads, while Hono single-garage and dashboard-summary routes deny Supervisor. The live list body was discarded, so no actual document fields were inspected. Admin-summary, fake-garage-summary, and forbidden Supervisor-creation probes returned HTTP 403; the UI login, refresh, and logout passed. Vehicle/subscriber, financial/recharge/subscription, and mobile/PWA workflows were not exercised under the safe non-payment boundary.** No production or `main` changes were made.

## Tested build and topology

- **Repository:** `tarekhamada875-droid/RQ-`
- **Branch:** `migration/unified-hono`
- **Auth/UI source commit:** `b4c5d28`
- **Validated deployment head:** `5af9bf0` (H5 run `37500199178`; Production Gate run `37500199167`)
- **Frontend:** temporary local Vite UI from the migration branch; same-origin `/api` proxy to the isolated Worker only
- **Backend:** `rq-hono-preview.tarekhamada875.workers.dev`
- **Runtime:** Cloudflare Worker, pre-production
- **Verified health:** `status=ok`, `runtime=cloudflare-worker`, `environment=preproduction`
- **Verified version:** `1.0.0-h5-preview`
- **Browser:** isolated Sandbox browser, RTL Arabic UI
- **Data boundary:** synthetic pre-production records only
- **Production/main:** untouched

## Baseline and automated validation

| Check | Result |
|---|---|
| Full Vitest suite | **PASS — 102 files / 577 tests** |
| Focused H6 authorization matrix | **PASS — 12 files / 63 tests** |
| Protected-view regression suite | **PASS — 37 tests in focused run** |
| TypeScript lint | **PASS** |
| Frontend/server/Worker build | **PASS** |
| `git diff --check` | **PASS** |
| H5 Preview Worker workflow | **PASS** |
| Production Gate workflow | **PASS** |
| Preview health/version smoke test | **PASS** |

Expected error logs in the full suite were from deliberate failure-path tests (network errors, 401/403/409/500 handling, server rejection, and fail-closed session behavior); the suite remained green.

## Role-by-role browser results

| Role | Login | Refresh | Logout | Dashboard/scope | Remaining browser coverage |
|---|---|---|---|---|---|
| Admin | **PASS** | **PASS** | **PASS** | **PASS** for isolated Admin dashboard | Detail tabs, mutations, audit, duplicate actions: **BLOCKED** |
| Delegate | **PASS** — visible entry opened the PIN-only form and an owner-authorized synthetic PIN authenticated against preview | **PASS** on the prior QA fixture; refresh not retested for the new account | **PASS** on the prior QA fixture; the new test session was released with the app's server helper for cleanup (not a logout-challenge test) | Prior QA fixture: Alpha visible, Beta absent, direct Beta reads returned **403**. New account: **0 garages** visible; Admin-summary GET returned **403** | Cross-garage scope for the zero-garage account, commission/settlement, and other operational workflows remain **BLOCKED/NOT TESTED** |
| Garage Owner | **PASS** | **PASS** | **PASS** | Synthetic garage scope: **PASS** | Vehicle/subscriber/recharge/report lifecycle: **BLOCKED** to avoid unapproved writes |
| Staff | **PASS** | **PASS** | **PASS** | Synthetic garage scope and Staff identity: **PASS** | Vehicle lifecycle, wrong-garage and owner/admin denial browser checks: **BLOCKED** |
| Supervisor | **PASS** — synthetic fixture authenticated through visible keypad | **PASS** — restricted view and one active/current session restored | **PASS** — normal UI logout returned to login and cleared role/token state | Restricted People/Delegates view: **PASS**; Admin summary, fake-garage dashboard summary, and Supervisor-create denial: **403**. `GET /api/garages` returned **200**; source audit shows an unfiltered global list | Global-list versus per-garage permission mismatch **OPEN**; live record fields were not inspected |

## Complete feature-by-role matrix

`PASS` means browser evidence and technical evidence were both available. `BLOCKED` means the scenario was not safely verifiable with the available synthetic fixture or browser context. `OPEN` means the observed permission surfaces conflict or the intended role boundary is not defined. `N/A` means the role is intentionally not permitted to perform the capability; the denial is covered technically where noted.

| Capability | Admin | Delegate | Garage owner | Staff | Supervisor | Technical evidence |
|---|---|---|---|---|---|---|
| Login/session | PASS | PASS | PASS | PASS | PASS | Session route and role tests; browser evidence |
| Refresh/heartbeat | PASS | PASS | PASS | PASS | PASS | Session enforcement tests; browser refresh evidence |
| Logout/revocation | PASS | PASS | PASS | PASS | PASS | Logout/session tests; browser evidence |
| Dashboard/navigation | PASS | PASS | PASS | PASS | PASS | Routing and role matrix tests; Delegate PIN-only browser login loaded its dashboard |
| Garage creation | BLOCKED | BLOCKED | N/A | N/A | N/A | Authorization tests pass; browser workflow blocked |
| Garage approval/rejection | BLOCKED | N/A | N/A | N/A | N/A | Server authorization tests pass |
| Garage details/status | BLOCKED | BLOCKED — tested new account showed 0 garages; prior QA fixture scope evidence is separate | PASS | N/A | **OPEN** — unfiltered list allowed; individual Hono detail/summary denied; Firestore read allowed | `GET /api/garages` status 200 and source returns all documents for Supervisor; no live fields inspected. Firestore rules permit Supervisor reads; Worker detail/summary use `canManageGarageScopedData` and deny Supervisor. |
| Garage deletion/maintenance | BLOCKED | N/A | N/A | N/A | N/A | Maintenance/deletion authorization tests pass |
| Staff management | BLOCKED | N/A | N/A | N/A | N/A | Authorization tests pass; browser mutation blocked |
| Delegate management | BLOCKED | N/A | N/A | N/A | BLOCKED | Delegate/supervisor authorization tests pass |
| Supervisor management | BLOCKED | N/A | N/A | N/A | N/A | Admin-only create route returned 200 for one synthetic fixture; Supervisor empty-body create returned 403; edit/delete UI not tested |
| Recharge requests | BLOCKED | BLOCKED | BLOCKED | N/A | N/A | Financial/request/idempotency tests pass |
| Recharge approval/rejection | BLOCKED | N/A | N/A | N/A | N/A | Transaction authorization/idempotency tests pass |
| Manual wallet top-up | BLOCKED | N/A | N/A | N/A | N/A | Manual-credit authorization tests pass |
| Wallet number | BLOCKED | N/A | BLOCKED | N/A | BLOCKED | Sensitive-settings tests pass; browser coverage blocked |
| Packages/catalog | BLOCKED | N/A | BLOCKED | N/A | BLOCKED | Package catalog tests pass; browser coverage blocked |
| Subscriber lifecycle | BLOCKED | N/A | BLOCKED | BLOCKED | N/A | Subscriber lifecycle tests pass; no unapproved synthetic writes |
| Vehicle check-in | BLOCKED | N/A | BLOCKED | BLOCKED | N/A | Vehicle authorization/check-in tests pass |
| Vehicle checkout | BLOCKED | N/A | BLOCKED | BLOCKED | N/A | Vehicle checkout tests pass |
| Vehicle correction/deletion | BLOCKED | N/A | BLOCKED | BLOCKED | N/A | Deletion-lock and scope tests pass |
| Plate lookup/recent exit | BLOCKED | N/A | BLOCKED | BLOCKED | N/A | Vehicle scope tests pass; browser coverage blocked |
| Fair use | BLOCKED | N/A | BLOCKED | N/A | N/A | Fair-use policy tests pass |
| Trial leads/decisions | BLOCKED | N/A | BLOCKED | N/A | N/A | Trial decision route tests pass |
| Reports/calculator | BLOCKED | BLOCKED | BLOCKED | N/A | BLOCKED | Financial-report authorization tests pass |
| Staff statistics | BLOCKED | N/A | BLOCKED | N/A | N/A | Scope policy tests pass |
| Delegate commissions/settlement | BLOCKED | BLOCKED | N/A | N/A | N/A | Commission tests pass; browser workflow not tested and current Delegate account has no garage assignment |
| Announcements | BLOCKED | N/A | BLOCKED | BLOCKED | BLOCKED | No complete browser evidence |
| Appearance/language | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No complete browser evidence |
| Admin PIN/security | BLOCKED | N/A | N/A | N/A | N/A | PIN rotation/logout tests pass |
| Active sessions | BLOCKED | N/A | N/A | N/A | N/A | Session route tests pass |
| Audit/history | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Operation trace/audit tests pass |
| Offline/retry | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Resilience/API boundary tests pass |
| Mobile/PWA | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Not run in this acceptance continuation |
| Cross-garage isolation | BLOCKED | **PASS** for prior QA Garage Alpha/Beta direct reads; **BLOCKED/NOT TESTED** for the new zero-garage account | BLOCKED | BLOCKED | **OPEN** — global list/Firestore read versus denied Hono detail/summary | Prior QA fixture showed Alpha only after refresh; direct Beta record and dashboard-summary GETs returned 403. New Delegate showed 0 garages. Owner/Staff own-garage and fake-scope checks are recorded below. Supervisor list is global by source; direct Hono item/summary paths deny Supervisor, while Firestore permits broad reads; actual response fields were not inspected. |

## Security finding and fix

A logged-out browser could previously set `app_view=admin_dashboard` and render an empty Admin shell before session coordination completed. No protected records were exposed, but the shell itself was an authorization/UI-integrity defect.

The migration branch now exposes authoritative `isSessionReady` and blocks all non-login views until session coordination completes. The browser regression showed the loading guard followed by the generic login screen. The exact repair is pinned in the H5 freeze gate; no broad UI freeze exception was added.

## Remaining bounded next task

Continue only the remaining H6 browser cells with existing synthetic fixtures: safe role-specific forbidden reads/actions and approved non-financial operational workflows where appropriate. The owner-approved visible Delegate entry and PIN-only form in source commit `b4c5d28` were browser-accepted against the isolated Worker; the new synthetic account showed zero garages, so its cross-garage scope remains unverified. Existing QA Garage Alpha/Beta direct-read isolation evidence is recorded separately. Do not merge to `main` until all required cells are recorded as PASS, N/A, or BLOCKED with owner acceptance.

## Cleanup and rollback

- Earlier role sessions were logged out through supported UI flows; the new Delegate test session was released with the app's server-authoritative session helper and the browser returned to login. This cleanup is not counted as a logout-challenge acceptance.
- The local tampering flag was removed and the browser returned to generic login.
- No production records, payment, wallet, or real-user data were changed.
- Rollback of the security repair remains commit `23b3b7e`; tested Delegate auth/UI source commit is `b4c5d28`. The current documentation head is recorded in the succession handoff.


## 2026-10-06 continuation — Delegate Alpha/Beta isolation and restricted reads

- **Target:** isolated pre-production Worker through a temporary local Vite UI routed only to the preview. The synthetic `QA--Delegate` PIN was reset through the supported Admin editor because its prior value was unavailable; the temporary value is omitted from this report. No production, `main`, deployment, merge, financial operation, or destructive operation occurred.
- **Login entry:** the visible Admin login did not expose a normal Delegate-entry action, and `#/delegate` alone did not select the Delegate view. To preserve the frozen UI, the existing public Delegate view was selected through local browser state; the actual phone/PIN form then authenticated the synthetic Delegate. Authentication is accepted, but ordinary user-facing discoverability/routing remains **BLOCKED**.
- **Scope and persistence:** after login, the dashboard showed **QA Garage Alpha only**. A full-page base-URL reload restored the Delegate session, and the authenticated dashboard API returned Alpha only (one garage); **QA Garage Beta** was absent.
- **Forbidden direct reads:** under the Delegate session, read-only GETs for the Beta garage record and its dashboard summary each returned **HTTP 403**. A read-only Admin-summary GET also returned **HTTP 403**. No write endpoint was called; neither the Beta ID nor protected response data was retained.
- **Logout/cleanup:** the supported logout challenge completed and returned the browser to the generic login screen. The temporary PIN and Beta reference were cleared from browser session storage; the temporary Vite service/config and generated build outputs were removed. The existing Delegate fixture remains on the temporary synthetic PIN because its earlier value was unavailable; no PIN is recorded here.
- **Disposition:** Delegate Alpha visibility, Beta hiding, the two cross-garage denials, the restricted Admin-summary denial, refresh persistence, and logout are **PASS**. Delegate login-entry discoverability and other required role-specific H6 cells remain **BLOCKED**. H7–H9 remain blocked.


## 2026-10-06 continuation — Delegate entry-path investigation and focused regressions

Source review confirmed that the app persists its selected view in `app_view`; the only hash handlers are the Admin routes `#/admin`, `#admin`, and `#/admin_login`. Although `App.tsx` renders `DelegateLoginView` for `delegate_login`, no component exposes a transition to that view, and `#/delegate` is not handled. The normal visible login therefore has no Delegate entry. The prior acceptance selected the existing public view via local browser state, then authenticated through the actual Delegate phone/PIN screen and server. This proves the role's login/session behavior but not an ordinary user entry path. The UI is frozen and no code change was made; the route/entry gap remains **BLOCKED** pending an owner-approved decision.

Focused automated authorization/session regression run: **PASS — 8 files / 61 tests** (`workerAuthorizationMatrix`, `delegateScopeIsolation`, `workerSessionRoutes`, `claimDelegateSession`, `phase2SessionEnforcement`, `stage2SessionEnforcement`, `vehicleOperationsScopeEnforcement`, and `authViewGuard`). This supplements but does not replace browser evidence. H6 remains **BLOCKED** for the normal Delegate entry path and other required role-specific browser coverage; H7–H9 remain blocked.


## 2026-10-06 continuation — owner-approved phone-free Delegate sign-in

- **Approval and scope:** The owner approved adding a visible Delegate sign-in action and removing the phone-number prompt from Delegate sign-in, on `migration/unified-hono` only. The implementation is local and unpushed in source commit `b4c5d2825e9c8c098779126c0e0a8828c0b766fb`. No preview deployment, production change, `main` change, or preview-data mutation occurred.
- **UI behavior:** The normal login now has a visible Delegate sign-in action; the existing Delegate view accepts a PIN without requesting a phone number. Existing account phone fields/data are unchanged, and no broader UI redesign was made.
- **Authentication boundary:** The client marks the PIN request as Delegate-scoped. Both the Hono Worker and transitional Express route reject a valid PIN belonging to another role before legacy credential migration or session claim. Generic role login remains unscoped and unchanged.
- **Regression evidence:** UI tests cover the visible entry, PIN-only form, and return action. Worker and Express integration tests verify wrong-role rejection without migration/session creation and successful Delegate-only session claim. The full suite passed **102 files / 577 tests**; TypeScript lint, production/server/Worker build, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check` passed. The H5 UI-freeze logic was simulated locally and passed against the exact pinned blobs; GitHub Actions was not run.
- **Credential/data boundary:** The PIN supplied in chat was not used, copied into source, or recorded in evidence. The existing synthetic preview account and its data were not touched by this implementation.
- **Disposition:** The new flow is **PASS locally** but remains **pending preview deployment and browser acceptance**. H6 remains **BLOCKED** overall for the remaining browser role/scope/forbidden-action cells. H7–H9 remain blocked. No push or deployment was performed.


## 2026-10-06 continuation — PIN-only Delegate preview acceptance

- The visible Delegate entry and phone-free PIN form from source commit `b4c5d28` were verified in a temporary local Vite UI, routed through a same-origin `/api` proxy only to `rq-hono-preview`. The Worker health response was **200** and reported `preproduction` / `1.0.0-h5-preview`. H5 Preview Worker run [37500199178](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37500199178) and Production Gate run [37500199167](https://github.com/tarekhamada875-droid/RQ-/actions/runs/37500199167) passed at branch head `5af9bf0`.
- The owner-authorized synthetic Delegate PIN succeeded through the visible UI and loaded the Delegate dashboard. No phone number was requested. The dashboard showed **0 garages**, **0 pending requests**, zero monthly commission, and no matching garage records.
- A read-only `GET /api/admin/summary` via the app's authenticated API client returned **HTTP 403** under this Delegate session. No response body was retained.
- The account had no visible garage assignment, so Alpha/Beta or other direct garage membership could not be tested for this account. Prior Alpha/Beta evidence refers to a separate synthetic fixture. The new test session was released through the app's server-authoritative helper, the browser returned to the generic login screen, and temporary local session identifiers were cleared. The normal logout challenge was not exercised.
- A first direct cross-origin browser request was blocked by CORS and produced no usable HTTP response; no result was inferred from it. The same-origin proxy health check succeeded before the valid login attempt. The temporary Vite service and config were stopped/removed. No account/garage/financial record, `main`, production Worker, or Pages frontend was changed.
- **Disposition:** visible entry, PIN-only login, dashboard load, and Admin-summary denial **PASS**. Cross-garage scope for this zero-garage account and remaining role-specific/operational H6 cells are **BLOCKED/NOT TESTED**. H6 remains incomplete; H7–H9 remain blocked.


## 2026-10-06 continuation — Garage Owner unexpected-screen retest

A single Garage Owner login submission was made in the isolated pre-production test UI with the owner-provided synthetic credential. After submission, the UI displayed an unexpected “balance depleted” screen with transfer/contact instructions instead of a Garage dashboard. No page control, payment, transfer, recharge, balance action, or contact link was used; no further credential submission, refresh, role test, or logout was attempted. Therefore this retest is **INCONCLUSIVE / BLOCKED**: it neither confirms a Garage Owner dashboard/session nor establishes a role-scope result. It does not erase earlier successful Garage Owner evidence from a separate acceptance run, but no PASS is claimed for this retest. Further browser credential attempts are paused pending safe, credential-free investigation of the unexpected state. Production and `main` were untouched, and no financial operation or record mutation occurred.

Local follow-up: `npx vitest run server/auth/pinAuthRoleScope.test.ts server/authSessionRoutes.integration.test.ts` passed **2 files / 7 tests**. These tests cover the transitional Express role-scoped PIN route and session routes only; they are not browser or Hono-preview evidence. H6 remains **BLOCKED**; H7–H9 remain blocked.


### Source clarification — Garage dashboard view

A read-only source review matched the exact balance message to the in-app `SmartActionPrompt` inside `GarageDashboardView`. `App.tsx` renders that view only for `view === 'garage'` with a garage object. The exact “balance depleted” state is selected when the garage has no positive balance and no active trial or paid package. Accordingly, the latest browser observation confirms the Garage dashboard view rendered (**PASS** for view rendering), with the app's existing balance gate visible. No payment/contact action was used. The display does not independently confirm Owner-versus-Staff identity or authoritative garage scope. Refresh persistence, role identity, forbidden-action checks, and logout for this latest attempt remain **NOT VERIFIED / BLOCKED**; the earlier successful Owner flow is separate historical evidence.


## 2026-10-06 continuation — Garage Owner and synthetic Staff live scope checks

This addendum supplements (and, for the later retest, supersedes the earlier inconclusive Garage-screen interpretation) without deleting the prior event history.

- **Environment:** isolated pre-production `rq-hono-preview` Worker through temporary same-origin Vite UI proxies. No production or `main` access, deployment, or source/UI edit occurred.
- **Garage Owner:** the owner-supplied synthetic credential opened the Garage dashboard. Local non-secret role state contained `app_garage` and no `app_staff`. Full-page navigation restored the view. Read-only session listing returned **200** with one current/active session; the owner’s Garage summary returned **200**; a deliberately nonexistent synthetic foreign-garage scope override returned **403**; Admin-summary GET returned **403**.
- **Staff fixture/login:** one phone-free synthetic record, `H6 Preview Staff 20261006`, was created through the authenticated garage-scoped preview route. Its generated PIN was used once through the visible keypad and is intentionally not recorded. The UI loaded the Staff garage view; non-secret local state identified `app_staff` and confirmed its garage assignment matched the current garage. After full-page refresh, the Staff session remained active/current; own summary returned **200**, the nonexistent foreign-garage override **403**, and Admin summary **403**.
- **Cleanup/safety:** both current test sessions were released with the server-authoritative release endpoint (**200 / success**), and reloading each origin returned to the generic login screen. This cleanup is not counted as a normal logout-challenge acceptance. The temporary UI services, configs, and browser captures were removed. No contact/transfer/payment/recharge/balance/subscription/vehicle/subscriber operation was performed. The new synthetic Staff fixture remains in pre-production for the owner’s planned test-account cleanup; no PIN or record identifier is retained here.
- **Regression gate:** `npx vitest run` passed **102 files / 577 tests** after the browser checks.
- **Disposition:** fresh Garage Owner and Staff login/view/refresh, own-garage access, nonexistent foreign-scope denial, and Admin-summary denial are **PASS**. Combined with the earlier separate-fixture browser evidence, the role-auth/session/authorization slice has live acceptance evidence for Admin, Delegate, Garage Owner, Staff, and Supervisor. The broader H6 feature matrix—including vehicle/subscriber workflows, financial/recharge/subscription operations, and mobile/PWA checks—was not exercised in this explicitly non-payment run; the full H6 checkpoint should not be marked complete until those cells are addressed or explicitly accepted as out of scope. Production and `main` remain untouched.


## 2026-10-06 continuation — synthetic Supervisor browser acceptance

A single synthetic Supervisor fixture was created through the Admin-only H5 preview route (**200**); its generated PIN and record ID were not retained. The visible PIN keypad authenticated the Supervisor, and the browser rendered the restricted People/Delegates view. After a full-page refresh, the restricted view returned and the server-authoritative session list showed one active/current session (**200**).

Status-only authorization probes returned **200** for `GET /api/garages` (its body was canceled and no record scope was assessed), **403** for `GET /api/admin/summary`, **403** for a dashboard-summary request using a deliberately nonexistent synthetic garage ID, and **403** for an empty-body `POST /api/supervisors/create` (no record was created). The standard visible logout challenge succeeded with the owner-authorized verification credential and returned to login; post-logout local role state and Firebase token were absent.

Temporary 5174–5176 preview UIs were stopped, temporary configs removed, and their browser storage/caches cleared. The synthetic Supervisor account remains in pre-production for the owner’s planned test-account cleanup. No financial, payment, recharge, vehicle, subscriber, production, or `main` operation occurred.

**Disposition:** Supervisor UI login, restricted dashboard, refresh persistence, logout, and the tested role denials **PASS**. The general garage-list route returned 200, but its body was deliberately discarded; whether the list is appropriately scoped remains **NOT ASSESSED**. H6 remains incomplete because vehicle/subscriber, financial/recharge/subscription, and mobile/PWA cells were not exercised in this safe non-payment run. No production or `main` changes were made.


## 2026-10-07 continuation — Supervisor global-read scope audit

Source review resolves what the previously discarded Supervisor list response would contain by policy, without fetching any garage records. `server/cloudflareWorker.ts:3076–3096` allows `admin`, `supervisor`, and `delegate`; only the delegate path applies a filter. For a Supervisor the Worker queries the whole `garages` collection and returns every stored document without field redaction in this handler. `firestore.rules:653–686` also allows active Supervisors to read/list garage documents and read nested vehicles/subscribers, while `useGarageSync.ts:173–185` subscribes to the full garages collection in `admin_dashboard`. The current role models/query path have no Supervisor-to-garage assignment field.

The Hono single-garage and dashboard-summary routes use `canManageGarageScopedData` and reject Supervisor; the focused role matrix covers that denial. This differs from the global list/Firestore permissions. H6 calls for Supervisor monitoring but does not define whether this is global or assignment-scoped. No record contents were inspected, so the report does not claim that any particular sensitive field was returned. This is an **open policy-consistency finding**, not a pass for cross-garage isolation. No source, UI, rules, accounts, production, or `main` were changed. Focused local regression: **27/27 tests pass** across the Worker authorization matrix and garage-route tests; the existing list test covers Admin only, not Supervisor.

**Required before closing H6:** explicitly set the Supervisor read boundary, then align Worker and Firestore permissions and add tests for the chosen list/detail behavior and sensitive-field redaction. Until then, keep Supervisor garage-list/detail scope **OPEN** and do not represent it as a tenant-isolation pass.
