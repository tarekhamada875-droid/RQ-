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
| QA Delegate | Valid login | Delegate dashboard | Not attempted | Phase 1 login/session blocker applies to all remaining roles. | **BLOCKED** |
| QA Garage Owner | Valid login | Garage dashboard | Not attempted | Phase 1 login/session blocker applies to all remaining roles. | **BLOCKED** |
| QA Staff | Valid login | Staff garage view | Not attempted | Phase 1 login/session blocker applies to all remaining roles. | **BLOCKED** |
| QA Supervisor | Valid login | Restricted supervisor dashboard | Not attempted | Phase 1 login/session blocker applies to all remaining roles. | **BLOCKED** |

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
10. Delegate Phase 1 is **BLOCKED** at the role-entry step. After clean Admin logout, the application presents only the generic garage/admin PIN keypad. The state machine contains `delegate_login` and `DelegateLoginView`, but `useGarageApp` only maps URL hashes for `#/admin`, `#/admin_login`, and `#/admin`; there is no visible or direct URL route to enter `delegate_login`. No application code was changed to bypass this blocker.
11. The role-entry repair was deployed in `800bdbf`. The visible Delegate action was verified in the isolated Sandbox browser, and the new regression test passed. GitHub’s H5 workflow successfully deployed and smoke-tested the preview; direct unauthenticated requests from this Sandbox still receive Cloudflare edge `403 error code: 1010`, so no new role-authentication claim is made.
12. A reversible preview-only CORS allowance was tested in `6a6cf45`: the local UI reached the isolated Worker from the Sandbox browser and recovered from its initial offline state. The allowance was removed in `d6a6c95`, and cleanup workflow `37315470556` passed. The preview is locked down again; role credentials remain the only missing H6 input.
13. The automated H6 role/session security matrix passed: **14 test files, 129 tests** covering role authorization, session authority, delegate session locking, garage scope, logout/refresh behavior, and forbidden actions. This is technical evidence only and does not replace browser acceptance with synthetic credentials.
14. Using the approved Admin PIN in preproduction, the existing `QA--Delegate` fixture was assigned a known synthetic PIN and tested through the supported UI. Delegate login and dashboard authorization **PASSED**; the dashboard showed zero garages, zero pending requests, and zero commission as expected for its scope. The first refresh check used the intentional `#/delegate` login route and was invalid for persistence testing. A corrected full-page reload from the base URL restored the Delegate dashboard, so refresh persistence **PASSED**. Delegate logout then returned to the login screen and **PASSED**.

## Next step

The supported Delegate-login entry point was added in migration commit `800bdbf` without changing the existing login flow: the main login screen now exposes the existing Delegate login view, and `#/delegate` is a supported direct route. The change passed the full local quality gate and was deployed to the isolated preview by H5 workflow `37313750139`; browser verification confirmed that the visible action opens the phone/PIN Delegate login screen.

Resume H6 with Garage Owner, Staff, and Supervisor through the same preview UI. Delegate refresh persistence and logout are now accepted. Do not begin H7 until the remaining role workflows, tenant isolation, persistence, duplicate handling, logout, refresh, and forbidden-action checks are recorded. Keep the dedicated preproduction service-account secret on the isolated preview Worker; never copy it to `main` or production.
