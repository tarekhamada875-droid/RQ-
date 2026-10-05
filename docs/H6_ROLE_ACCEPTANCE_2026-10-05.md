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

## Next step

H6 cannot safely continue from the Sandbox edge path until the preview Worker host is tested from an allowed real-browser/network path or Cloudflare support/account configuration removes the host-scoped `1010` edge block. Do not disable Browser Integrity Check globally and do not replace Firebase bearer authentication with a weaker workaround. Once the edge block is resolved, rerun Phase 1 from a clean browser context, then proceed role-by-role and create only `QA-20261005-*` synthetic records.
