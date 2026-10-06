# H6 Role-Based Acceptance Evidence — 2026-10-05

## Scope

- **Target:** unified Hono migration preview Worker (`rq-hono-preview`)
- **Browser:** isolated Sandbox browser
- **Frontend under test:** temporary Vite UI configured to call the preview Worker
- **Production:** not modified or used for data mutation
- **Test data:** no records created or changed

## Phase 0 / deployment evidence

- Migration branch commit before the temporary test-only deployment adjustment: `ec2963a`
- Focused Worker tests: **PASS** — 8 tests passed (`server/api.test.ts`, `server/h5DualRuntime.contract.test.ts`)
- Worker lint/build validation: **PASS**
- H5 Preview Worker workflow for the temporary preview-origin adjustment: **PASS**
- Migration Production Gate for that commit: **PASS**
- The temporary preview-origin adjustment was then reverted to honor the H6 test-only boundary. Revert commit: `d542d0c`.

## Common login test

| Role | Human action | Visible expected result | Visible actual result | Technical observation | Status |
|---|---|---|---|---|---|
| QA Admin | Open `#/admin`, enter the authorized synthetic admin PIN, submit | Admin dashboard opens | Toast: `انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً` | Preview UI reaches the Worker, but the protected PIN request is rejected before PIN validation can produce a role/session. Anonymous Firebase sign-up itself was confirmed available for the configured Firebase client. | **BLOCKED** |
| QA Delegate | Valid login | Delegate dashboard | Dashboard opened; base-URL refresh restored session; logout returned to login | Synthetic preview acceptance completed; scoped zero-garage view was expected. | **PASS** |
| QA Garage Owner | Valid login | Garage dashboard | Not attempted | Dedicated synthetic PIN assigned; browser acceptance remains outstanding. | **NOT ATTEMPTED** |
| QA Staff | Valid login | Staff garage view | Not attempted; fixture creation unconfirmed | Verify or recreate the synthetic Staff fixture before browser acceptance. | **BLOCKED** |
| QA Supervisor | Valid login | Restricted supervisor dashboard | Not attempted | Dedicated synthetic PIN assigned; browser acceptance remains outstanding. | **NOT ATTEMPTED** |

## Findings

1. The initial browser failure was a CORS mismatch: the preview Worker allowed only `http://localhost:5173`, while the temporary browser origin was the Sandbox public Vite origin. A narrow preview-only allowance was deployed temporarily to separate CORS from authentication; the Worker then returned the correct `access-control-allow-origin` value.
2. With CORS corrected, a clean browser session still failed at login with the session-expired error. Repeating after clearing localStorage, sessionStorage, and origin-scoped IndexedDB reproduced the failure.
3. The Worker route `POST /api/auth/verify-pin` requires a valid Firebase bearer token before PIN validation. The remaining failure is therefore an **isolated preview Firebase token-verification / Worker auth-boundary issue**, not a PIN-format or UI rendering issue.
4. Follow-up edge testing isolated the failure further: requests without `Authorization` reach the Worker and return its expected JSON `401`; adding a fresh, valid Firebase bearer token causes Cloudflare edge `403 error code: 1010` even on harmless `GET /api/health` and `GET /api/version` requests. Therefore the Firebase token is being rejected by edge security before the Worker executes.
5. The authorized Cloudflare account has only the managed free ruleset and no account access rules. A dry-run attempt to create a host-scoped Browser Integrity Check skip rule was rejected because the account is not entitled to use the required custom ruleset phase. No Cloudflare security settings were changed.
6. The temporary CORS configuration was reverted. The migration branch is now back within the test-only boundary; `main` and production were not changed.
7. A retest through the connected real browser reached the preview Worker successfully: `/api/health` returned `200`, and the admin login progressed through the loading state instead of showing the Sandbox edge `1010`. The UI then returned to the login screen without a persistent visible error. Connected-browser network diagnostics are unavailable, so the exact post-edge response was not guessed or treated as a pass.
8. After creating a dedicated Firebase Admin SDK key for project `gen-lang-client-0091669619` and configuring it only as the isolated Worker secret `FIREBASE_SERVICE_ACCOUNT_JSON`, the connected-browser Admin login completed successfully. The Admin dashboard loaded Firestore-backed data, including garage counts and dashboard navigation. The temporary CORS allowance was used only for this test and is being removed immediately afterward.
9. Admin read-only navigation reached the Overview, Garages, and People screens. The People screen showed one existing synthetic delegate (`QA--Delegate`) and one supervisor; PIN fields were redacted from the list. The existing synthetic delegate PIN was updated through the supported profile editor for a later role test; the value is intentionally not recorded here.
10. Delegate Phase 1 was initially blocked at the role-entry step. The supported entry repair was subsequently deployed, and the visible Delegate action plus `#/delegate` route now reach `DelegateLoginView` without changing the existing garage/Admin flow.
11. The role-entry repair was deployed in `800bdbf`. The visible Delegate action was verified in the isolated Sandbox browser, and the new regression test passed. GitHub’s H5 workflow successfully deployed and smoke-tested the preview; direct unauthenticated requests from this Sandbox still receive Cloudflare edge `403 error code: 1010`, so no new role-authentication claim is made.
12. A reversible preview-only CORS allowance was tested in `6a6cf45`: the local UI reached the isolated Worker from the Sandbox browser and recovered from its initial offline state. The allowance was removed in `d6a6c95`, and cleanup workflow `37315470556` passed. The preview is locked down again; role credentials remain the only missing H6 input.
13. The automated H6 role/session security matrix passed: **14 test files, 129 tests** covering role authorization, session authority, delegate session locking, garage scope, logout/refresh behavior, and forbidden actions. This is technical evidence only and does not replace browser acceptance with synthetic credentials.
14. Using the approved Admin PIN in preproduction, the existing `QA--Delegate` fixture was assigned a known synthetic PIN and tested through the supported UI. Delegate login and dashboard authorization **PASSED**; the dashboard showed zero garages, zero pending requests, and zero commission as expected for its scope. The first refresh check used the intentional `#/delegate` login route and was invalid for persistence testing. A corrected full-page reload from the base URL restored the Delegate dashboard, so refresh persistence **PASSED**. Delegate logout then returned to the login screen and **PASSED**.
15. H6 fixture preparation then used the supported Admin UI only: the existing synthetic `New Test Garage` record (`01099990000`) received a dedicated test PIN, and the existing `QA--Supervisor` record (`01000000002`) received a dedicated test PIN. A `Synthetic Test Staff` add attempt was submitted for the same garage; the UI closed the form but displayed a zero-staff list on the immediate return, so Staff fixture creation remains **UNCONFIRMED** and must be verified before acceptance. No production records were changed.

## Next step

The supported Delegate-login entry point was added in migration commit `800bdbf` without changing the existing login flow: the main login screen now exposes the existing Delegate login view, and `#/delegate` is a supported direct route. The change passed the full local quality gate and was deployed to the isolated preview by H5 workflow `37313750139`; browser verification confirmed that the visible action opens the phone/PIN Delegate login screen.

Resume H6 by verifying the Staff fixture creation, then test Garage Owner, Staff, and Supervisor through the same preview UI. Delegate refresh persistence and logout are accepted. Do not begin H7 until the remaining role workflows, tenant isolation, persistence, duplicate handling, logout, refresh, and forbidden-action checks are recorded. Keep the dedicated preproduction service-account secret on the isolated preview Worker; never copy it to `main` or production.

## 2026-10-06 continuation — preview role acceptance

### Scope and safety

- **Target:** isolated `rq-hono-preview` Worker only; production Worker and `main` were not changed.
- **Frontend:** temporary local Vite UI with a same-origin proxy targeting only the preview Worker.
- **Test fixtures:** existing `New Test Garage`, `Synthetic Test Staff`, and `QA--Supervisor`; no account was created or deleted. Dedicated synthetic PINs were assigned through the supported Admin UI; values are intentionally omitted and remain on the isolated preview for continuation.
- No vehicle, wallet, balance, rate, recharge, subscription, or other financial operation was performed.
- Temporary Vite service was stopped, `vite.config.ts` restored, and screenshots/HTML/text artifacts from this test origin removed.

### Results

| Role/check | Result | Evidence |
|---|---|---|
| QA Admin | **PASS** | Admin login, dashboard initialization, read-only navigation, and base-URL refresh had passed earlier in this test chain. The supported logout challenge completed; `/api/auth/verify-admin-pin` and `/api/auth/release-session` returned 200, and the UI returned to the generic login screen. |
| Synthetic fixtures | **PASS** | The garage and supervisor fixtures were found; one existing `Synthetic Test Staff` record was visible. The staff fixture was not recreated. |
| Garage Owner login | **BLOCKED** | After assigning the dedicated synthetic PIN through the supported PIN-update service, two shared-login submissions reached `POST /api/auth/verify-pin` but had no browser-observed HTTP status at 15,002 ms and 15,001 ms. The UI remained in “verifying” state. Reload returned to the generic login screen with an empty PIN field; no Garage dashboard or successful session claim was observed. Because the client aborted at its timeout, the server-side outcome of either request is unknown. |
| Staff login | **NOT TESTED** | Deferred after the shared PIN-verification request timed out twice; avoid creating further rate-limit/session ambiguity until the endpoint is diagnosed. |
| Supervisor login | **NOT TESTED** | Same shared PIN-verification path; deferred for the same reason. |
| Preview health/version | **PASS** | Read-only `GET /api/health` and `GET /api/version` returned 200 in 3.83 s and 2.97 s respectively after the login attempts. |

### Findings and next step

1. `src/api/apiClient.ts` sets `DEFAULT_API_TIMEOUT_MS` to 15,000 ms. The two `verify-pin` browser resource entries ended at that boundary with no HTTP status, rather than an observed Worker 4xx/5xx response. The cause is **not yet proven**.
2. The Hono handler first checks the PIN rate limiter, then concurrently reads the Admin PIN and four role collections, then claims a session in a Firestore transaction. More than one stage may contribute; do not assume Firestore or the rate limiter is the cause without timing evidence.
3. A narrow Cloudflare Observability query for the test interval returned no route-level preview invocation records through the available query. This is inconclusive and does not prove that the Worker did not receive or complete the requests.
4. Do not retry more role PINs until the preview auth path can be observed reliably; an aborted browser request may have an unknown server-side result. Capture safe, credential-free timing/request-ID diagnostics for each auth stage on the isolated preview, then re-run H6 with the existing synthetic fixtures.
5. H6 remains **incomplete**. Do not begin H7, H8, or H9. Do not increase the client timeout merely to mask the unmeasured backend delay, and do not change the frozen UI as a test workaround.
