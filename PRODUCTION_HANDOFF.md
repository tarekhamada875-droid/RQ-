# RQ Production Readiness Handoff

**Last updated:** 2026-09-17 07:48 +03:00
**Repository:** `tarekhamada875-droid/RQ-`
**Branch:** `main`
**Current commit:** `6560c19` — `chore: remove one-time admin PIN migration`

## Objective
Prepare RQ for real production use: secure 8-digit PIN authentication, faster login, clean Arabic/mobile UX, verified deployment, admin credential migration, and deletion of all test data before customer use.

## Completed

1. Production connectivity was previously verified between GitHub, Cloudflare Pages frontend, and Vercel backend.
2. Fixed vehicle check-in failure caused by undefined fair-use timestamps.
3. Simplified garage dashboard warnings and added a dedicated manual wallet-transfer card for zero-balance states.
4. Corrected package capacity logic so explicit `dailyCapacity: 0` means unlimited regardless of package name.
5. Added hourly countdown for daily packages and the final 24 hours of multi-day packages.
6. Fixed Arabic notification wrapping and centering.
7. Strengthened the GitHub Production Gate with commit-parity and frontend availability checks.
8. Implemented the 8-digit PIN migration:
   - New PIN creation/change forms accept exactly 8 Arabic or English digits.
   - PINs are stored in server-only `private_pins` with unique-salt scrypt hashes and deterministic lookup hashes.
   - Login performs parallel role lookups across garages, staff, delegates, supervisors, plus admin lookup.
   - Login routing is server-owned; clients cannot choose a role.
   - Non-8-digit login input is rejected.
   - Legacy public PIN fields and legacy collection scans are no longer accepted by production login.
   - New admin PIN settings form supports verification and change.
   - Admin/garage/delegate detail forms support 8-digit changes.
9. Fixed compile errors in admin PIN editing forms.
10. Validation completed successfully:
    - 4 focused test files passed.
    - 29 tests passed.
    - `npm run lint` / TypeScript passed.
    - `npm run build` passed for frontend, server, Cloud Run, and Vercel API bundles.
    - `git diff --check` passed.
11. Commit `06a0272` was pushed to GitHub `main`.
12. Vercel production deployment is `READY` at the exact same SHA `06a02722b707cbaad84792aedc3d6203bc52f16c`.
13. GitHub Production Gate completed successfully for this SHA.

## Current blocker / browser state

Firebase Admin SDK access is not available as a local environment variable or configured Firebase connector. Firebase Console was opened for project `gen-lang-client-0091669619`, but Google sign-in is required. The user must complete Google sign-in in the browser takeover. After sign-in, inspect Firestore and continue.

The user later chose to preserve all data and migrate only the admin credential. A temporary, rate-limited migration endpoint was deployed in commit `757eed6`, invoked with the previously supplied value `888888`, and returned HTTP 401 `INVALID_OLD_PIN`. No Firestore data or credentials were changed. The endpoint was removed and redeployed in commit `6560c19`; the temporary route is no longer present in production.

The value `888888` is therefore not the current admin PIN. Further admin-only migration requires the actual current admin PIN or an authenticated Firebase/Google project-admin access path.

## Approved destructive scope

The user explicitly confirmed this exact reset scope:

> Delete all current test data from `garages`, `delegates`, `staff`, `supervisors`, `vehicles`, `subscribers`, `transactions/recharges`, sessions, and related test records, while preserving package definitions and application configuration.

This reset is no longer the selected plan. The user explicitly changed direction and requested that all data be preserved. Do not delete any records unless the user separately reconfirms a reset. Before any future mutation, inventory document counts and record the counts in this handoff log.

## Remaining sequence

### A. Firebase access
1. Wait for the user to finish Google sign-in in the already-open Firebase Console.
2. Verify the active project is `gen-lang-client-0091669619`.
3. Inventory the confirmed test-data collections and identify package/config collections to preserve.
4. Update this log with counts before mutation.

### B. Admin credential migration
1. Obtain the actual current admin PIN or authenticated project-admin access; `888888` was rejected and must not be retried blindly.
2. Generate a cryptographically random temporary 8-digit PIN that does not reuse `888888` or any visible old PIN.
2. Write only the secure private admin record at `private_pins/auth_pin` with the new scrypt hash and lookup hash. Do not print the temporary PIN in a public log or commit.
3. Ensure legacy admin credential fields are removed/nullified from `admin_settings/auth_pin`.
4. Tell the user the temporary PIN privately in the chat so they can log in.
5. User logs in and changes it through the new admin PIN settings form.
6. Verify the new private record exists and the old temporary PIN no longer authenticates.
7. Never commit or write the real PIN to repository files.

### C. Data reset
1. After admin migration is complete, inventory again if needed.
2. Delete only the user-confirmed test-data collections/documents.
3. Preserve package definitions and application configuration.
4. Verify all targeted collections are empty and preserved collections remain.
5. Record post-reset counts and timestamp here.

### D. Final acceptance
1. Confirm production deployment still serves the expected commit.
2. Test admin login with the changed 8-digit PIN.
3. Test invalid length rejection.
4. Test garage/delegate creation form validation and PIN uniqueness.
5. Test check-in/check-out, package capacity, hourly countdown, zero-balance transfer guidance.
6. Test Arabic notification wrapping and mobile layout.
7. Do not claim full production readiness until admin migration, reset, and acceptance tests are complete.

## Important implementation files

- `server/app.ts` — authentication/session route.
- `server/utils.ts` — PIN hashing, private lookup, rate limiting.
- `server/validation.ts` — new PIN validation.
- `server/routes/garages.ts` — garage creation PIN enforcement.
- `server/routes/delegates.ts` — delegate creation PIN enforcement.
- `src/components/admin/AdminPinSettingsView.tsx` — admin PIN change UI.
- `src/components/admin/AdminGarageDetailsView.tsx` — garage PIN change UI.
- `src/components/admin/AdminDelegateDetailsView.tsx` — delegate PIN change UI.

## Resume commands

```bash
cd /home/ubuntu/RQ-repo
git status --short
git log -3 --oneline
```

Validation command:

```bash
npx vitest run src/__tests__/garageCreationPinAvailability.test.ts src/utils/index.test.ts src/utils/stressTest.test.ts src/__tests__/stage1TrustBoundary.test.ts && npm run lint && npm run build && git diff --check
```
