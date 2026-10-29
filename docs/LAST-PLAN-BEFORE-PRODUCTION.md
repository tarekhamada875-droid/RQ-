# RQ — Production Plan (COMPLETED)

**Status:** COMPLETED. All blockers resolved. The app is live in production.

**Original purpose:** Turn the owner's questionnaire answers into one clear implementation plan. All items below have been implemented, verified, and deployed.

## Completed decisions (formerly "blockers")

| ID | Decision | Status |
|---|---|---|
| B1 | Pricing: 1 credit per regular car check-in. Subscriber check-in is free. Subscriber renewal debits 5 paid credits. No per-garage monthly fee. | ✅ Implemented |
| B2 | Two separate revenues: **Garage Revenue** (money collected from drivers: hourly/overnight rates at check-out, plus 5 EGP per subscriber renewal) and **Admin Revenue** (EGP collected from garages for credits: 1 EGP = 1 credit). Tracked separately on garage docs. | ✅ Implemented |
| B3 | Role access: current server permissions are the approved matrix. Workers enforce authorization; UI hiding is not security. | ✅ Implemented |
| B4 | Deletion: garage deletion keeps the deletion audit log (security requirement). Staff deletion removes sessions, Auth user, and activity history. | ✅ Implemented |
| B5 | Test data: synthetic emulator fixtures only. Production data never copied to tests/Preview. | ✅ Enforced by existing security rules |
| B6 | Secrets: never in Git or logs. Logs stay redacted in all environments. | ✅ Enforced |
| B7 | Operations: owner is the sole contact. No SLA or uptime promise. | ✅ Documented |
| B8 | Plate correction: 3 corrections per garage per Cairo day (implemented as the daily deletion limit). | ✅ Implemented |
| B9 | Exhausted-credit screen: shows "رصيدك خلص" with the admin-configured wallet number (set in Admin → Settings → Payment Wallet Number). | ✅ Implemented |
| B10 | No pilot: launch directly when ready. Launched. | ✅ Done |

## Key product rules (confirmed)

- 5-digit PINs for all roles.
- Admin credit grants: 50–2,000 EGP per operation.
- Delegate commission: 100 EGP once per garage, only on the first qualifying grant (≥ 500 EGP).
- Referral award: 20 credits to the referring garage on the referred garage's first qualifying grant.
- Payment references: unique per garage (not globally).
- Sessions: maximum 24 hours.
- Time hidden from user-facing screens.
- Arabic-only UI, RTL layout.

## Features removed (retired)

Announcements, packages/credit-bundle templates, garage-level subscription billing, recharge requests, wallet/top-up workflows, two-day trial, legacy commission paths. Server endpoints no longer exist.

## Production state

The app is live at https://rq-acg.pages.dev with the Worker at https://rq.tarekhamada875.workers.dev. Health check: `/api/health`. Version: `/api/version`.

For current product rules, see `docs/PROJECT.md`. For security invariants, see `docs/SECURITY.md`.
