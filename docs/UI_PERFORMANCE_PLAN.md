# RQ — Production Fix Plan (Executor File)

> **STATUS: PRODUCTION AUDIT IN PROGRESS — major code paths have been inspected, but owner-only Firebase/Cloudflare usage checks, repository privacy/secrets review, and final role walkthrough remain open. The latest application-code release had a passing Production Gate and live Worker smoke test at audit start; repeat release verification after code fixes. Launch sign-off is NOT complete. Confirmed findings and pending owner questions are listed below.** &nbsp;|&nbsp; Last updated by: repository executor &nbsp;|&nbsp; Date: 2026-10-26
>
> This file is a **work order and a live progress sheet**. Every person or AI agent working on the repository must keep it updated as work proceeds. See "Executor Contract" below.

Project: `tarekhamada875-droid/RQ-` (Arabic-only garage-management PWA)
Stack: React 19 + Vite (Cloudflare Pages) → Hono Worker (Cloudflare) → Firebase Auth + Firestore
Reviewed by: Claude, from the ZIP of the `main` branch (538 files). **I read the code; I did not run the app or its tests.** Every "before" snippet below was copied from the real files. Line numbers may drift, so always match by text, not by line number.

---

## 0. For the owner (plain words)

You do not need to understand the code. Do these three things:

1. Give the working agent access to the current repository and these instructions. Prefer the live repository over an old ZIP.
2. Paste this message to the agent:

   > Verify the current `main` branch and read `AGENTS.md`, `README.md`, `docs/PROJECT.md`, `docs/SECURITY.md`, and `docs/UI_PERFORMANCE_PLAN.md`. Follow the Executor Contract. Resume at the first eligible unfinished item in the current Progress Tracker; do not restart completed work or assume Phase 0 is next. Work on one bounded item at a time. After each item or material new finding/decision, update the tracker and Execution Log in this plan before stopping or switching tasks. Use the existing canonical documents, not chat history, as durable project memory. Ask me only when a decision or owner-only action is genuinely unresolved.

3. Review the five decisions in section 2 and the Owner Q&A log. Answer only questions that are not already recorded; do not ask again for decisions already on file.

Things only **you** can do (the executor cannot do them for you): they are marked **OWNER ACTION**.

---

## 1. Executor Contract (rules every executor must follow)

1. **Work in order.** Phase 0 → 1 → 2 → 3 → 4 → 5. Do not skip ahead. Phase 6 is a backlog: **do not do it.**
2. **One branch per phase** (`fix/phase-1-quota`, `fix/phase-2-dead-code`, …), **one commit per task**, commit message `P<phase>.<task>: <what>`.
3. **Match by text, not line numbers.** If a "BEFORE" snippet does not exist exactly as written, **STOP**, mark the task `[!]`, write what you found in the Execution Log, and ask the owner. Never guess or "adapt".
4. **Verify every task.** Each task lists verification commands. A task is `[x]` only when they pass. Paste a short result (pass/fail + counts) in the Execution Log.
5. **At the end of every phase run:** `npm run lint` · `npm test` · `npm run ci:check`. Phase 3 also: `npm run test:rules`. All must pass before the next phase.
6. **Do NOT change:** any Arabic text, layout, RTL behaviour, colours, or screens; financial transaction logic (`server/domain/*`, check-in/check-out/refund transactions, credit grants, idempotency, reports); package versions; add no new dependencies; no refactors that are not listed here.
7. **Tests:** delete a test only when this file says so (because it tests code being deleted). Never weaken or skip a test to make it pass. If a test fails for an unlisted reason, **STOP and report**.
8. **Never** run anything against the production Firebase project. Use the emulators / fixtures that the repo already provides. Never print or commit secrets.
9. **Always-on continuity is mandatory for every executor and session; do not wait for `tokens ending`:**
   - After every bounded plan item, material repository/project change, owner decision, blocker, or finding that changes what is safe or next, update this plan before switching tasks or ending the session.
   - In the Progress Tracker (section 4), record the verified status, date, commit, and concise notes. Add one Execution Log row (section 12) with what changed, affected files, checks and results, any blocker/owner action, and the exact next eligible item. Update the top `STATUS:` line when the project state changes.
   - For durable facts outside this plan, update the appropriate existing canonical document (`docs/PROJECT.md`, `docs/SECURITY.md`, or `docs/OPERATIONS.md`). Do not create separate handoff/history files, and never leave important state only in chat. Record durable facts; re-check branch, PR, check, and deployment state live at the next session.
   - Status marks: `[ ]` not started · `[~]` in progress · `[x]` done and verified · `[!]` blocked (write why) · `[-]` skipped by owner decision (write which decision).
10. **Report format at the end of each phase** (3–6 lines): what changed, files deleted (count), lines removed, test results, anything the owner must decide.

---

## 2. Owner decisions (check recorded answers first; ask only unresolved questions)

| ID | Question | Default if owner says "I don't know" |
|----|----------|--------------------------------------|
| **D1** | Does the production Firebase database contain **real customers** (real garages with real PINs)? | **NO** (pre-launch, only test data). If YES → task P4.2 is skipped (`[-]`). |
| **D2** | Is the Cloudflare Worker `rq` on the **Free** plan or the **Paid** ($5/month) plan? | Owner does not know; the available Cloudflare connection lacks Billing Read permission. Keep unknown; do not upgrade or change billing. Recheck through an authorized billing view (P4.3). |
| **D3** | Must a garage tablet stay logged in **more than 24 hours**? (Today a session appears to end 24 h after login even if active.) | Owner did not understand the technical distinction; safe decision: keep current 24-hour behavior unchanged for now, and verify whether it inconveniences pilot garages before extending it. |
| **D4** | Is any **old installed copy** of the app, or any other program, still calling the old billing endpoints? | Traffic evidence was inconclusive (10% sampling, seven-day retention). On 2026-10-26 the owner explicitly directed removal anyway and accepted the possibility that old copies will receive 404s. Remove only the retired endpoints; keep active prepaid-credit routes untouched. |
| **D5** | Do you want **coupons** (discount codes)? There is no screen for them. | **NO** → P2.3 deletes the feature. |

**Recorded owner answers (updated 2026-10-26):** D1 = NO real customer data · D2 = UNKNOWN (Cloudflare billing permission unavailable) · D3 = preserve current behavior pending pilot evidence · D4 = older callers may exist, but the owner explicitly superseded the prior caution and directed removal despite inconclusive telemetry · D5 = NO coupons.

---

## 3. What the review found (evidence)

**Big picture:** the core is coherent and carefully tested (about 31,000 lines of app code, 19,000 lines of tests). The problems are (a) things that waste your free Firebase quota, (b) leftovers of the retired billing model that the **database rules still allow**, (c) dead code, (d) clutter. It is **not** corrupted.

| # | Finding | Where | Why it matters |
|---|---------|-------|----------------|
| F1 | Delegate dashboard re-fetches every **15 s** (≈5,760×/day if left open) | `src/hooks/useGarageSync.ts` (`window.setInterval(loadDashboard, 15000)`) | Each poll reads the delegate + a page of garages → can eat the whole daily read quota alone |
| F2 | Session heartbeat every **5 min**; each heartbeat = ~3 writes + ~4 reads on the Worker | `src/hooks/useGarageSession.ts`; `server/cloudflareWorker.ts` (`/api/auth/validate-or-refresh-session`) | One device kept open 24 h ≈ 864 writes/day. 9 garages × 2 devices visible 12 h/day ≈ 7,800 writes/day (~40% of the free 20,000); open 24 h ≈ 15,500 (~78%) |
| F3 | Each car costs ≈ **11–12 writes** (check-in ≈ 6, check-out ≈ 5–6) | `server/vehicleRoutes.ts` | Sets the real capacity of the free plan (see Appendix A). Not changed (financial logic). |
| F4 | `firestore.rules` still lets the **browser** write retired collections (`recharge_requests`, `topup_requests`, `referral_rewards`, `packages`) and many others, bypassing the Worker | `firestore.rules` | Contradicts README ("browser must not mutate"). The Worker route says 410 "retired" but the database rule says "allowed" |
| F5 | `admin_settings` readable by **any signed-in user** for retired keys `wallet_number`, `subscription_prices` | `firestore.rules` | Old wallet model leftover |
| F6 | The browser has **zero** direct Firestore writes in live code, yet it has a hidden **fallback** that writes session documents (`runTransaction`), plus dead methods that write (`updateSession`, `updateStaffSession`, `claimOrRefreshGarageSession`) | `src/services/authSessionService.ts`, `authService.ts`, `garageService.ts` | A second "authority" the code comments themselves say must not exist |
| F7 | Legacy plaintext/shared-salt PIN verification has been removed; remaining PIN lookup uses fixed public `PIN_LOOKUP_SALT` for deterministic indexed lookup hashes | `server/utils.ts` | Unique-salt scrypt protects stored verification hashes, but short numeric lookup hashes could be guessed if the private PIN database were exposed |
| F8 | ~25 unused files/functions (listed in Phase 2). Retired routes return 410 (harmless but clutter). Coupons feature has routes but no screen. | many | Confusing for the next developer/AI |
| F9 | 113 generated browser-baseline artifacts (~1.5 MB) and 6 generated authenticated-smoke artifacts | `docs/` | Generated clutter; capture tools now write to ignored temporary folders |
| F10 | AI Studio template leftovers: `metadata.json`, `firebase-blueprint.json`, `GEMINI_API_KEY` in `.env.example`, `https://aistudio.google.com` + localhost hard-coded in the production CORS allowlist | root, `server/cloudflareWorker.ts` | Cleanup / hardening |
| F11 | The GitHub repo is **public** and was edited by three AI agents | GitHub | Owner action in P4.4 |

**Good news (do not break these):** all retired billing routes are harmless tombstones (HTTP 410), not working code; duplicate-request protection (idempotency), PIN rate-limiting (Durable Object), and 19k lines of tests are solid.

**Not verified by me:** I did not run the app, tests, or emulators. Free-plan limits quoted (50,000 reads/day, 20,000 writes/day) are from my knowledge — **check the current Firebase pricing page**. I did not find the page size used by the delegate dashboard.

---

## 3.1 Current code-audit findings — provisional; audit continues

These findings were confirmed by reading current `main` source and relevant tests. No application code was changed during this inspection. Owner questions are recorded in Section 13; do not guess at business policy.

| ID | Confirmed finding | Evidence and impact | Owner decision needed? |
|---|---|---|---|
| A1 | Prepaid-credit payments are not included in headline cash/revenue formulas. | `server/financialReporting.ts` adds paid-credit purchase payments to `prepaidCreditPaymentsEgp`, but `cashCollectedTotal` only adds legacy recharge + wallet totals and `companyNetRevenue` only uses legacy recharge less commission/refund. A test expects a prepaid payment to appear separately while cash collected and net revenue remain zero. | Yes — define intended formulas. |
| A2 | Financial report date boundaries use UTC midnight rather than Cairo business-day boundaries. | `server/financialRoutes.ts` constructs boundaries using `T00:00:00.000Z`, while check-in/check-out and garage reports use `Africa/Cairo` date keys. Transactions around Cairo midnight can land in the wrong selected report day. | Yes — confirm Cairo-local report dates. |
| A3 | Subscriber active/expired status and counters are inconsistent with the actual subscription date range. | Some paths compare `YYYY-MM-DD` end dates as UTC-midnight instants; several add/update/summary paths ignore `startDate` and classify a future-start subscriber as active; missing/invalid end dates are treated as active. Maintained active/expired counters are updated only on subscriber mutations, and `isUsableMaintainedSummary` has no age/expiry check, so counts can remain stale when subscriptions naturally expire without a new write. Check-in eligibility separately compares Cairo date strings inclusively. | Yes — confirm the intended rule: active only when `startDate <= Cairo today <= endDate`, with end date inclusive for the whole Cairo day, and invalid dates treated as invalid/expired; then we can align all counters and their refresh strategy. |
| A4 | Legacy daily counters are wrong, and `todayRevenue` may carry yesterday's amount into a new day. | Check-in decision always returns `isNewDay: false` and `used: 0`; route therefore sets `todayCount` to 1 on every entry. It also updates `lastTransactionDate` without resetting `todayRevenue`, so a later check-out can add today's revenue to yesterday's. Newer `daily_stats`/maintained projections can disagree with legacy fields. | Yes — confirm whether legacy fields are still displayed; if retained, they must reflect the Cairo business day correctly. |
| A5 | Firestore rules let a delegate who created/referred a garage read that garage's subscriber documents, including personal details. | `firestore.rules` permits `isDelegateForGarage(garageId)` to read/list subscriber documents, and rules tests explicitly expect delegate reads to succeed. | Yes — confirm whether delegate access to subscriber names/phones/notes/dates is intended. |
| A6 | Several Admin summary/report endpoints and services appear disconnected from the live UI. | `getFinancialReport` exists but has no production screen caller in the inspected UI; `getAdminSummary` is exposed through `adminCoreService` but no caller was found in the inspected components/hooks; `/api/financial-summary`, `/api/admin/monthly-subscribers-summary`, and `/api/admin/subscribers` also have no caller in the inspected service/UI paths. Some of these endpoints retain legacy totals or capped, non-paginated queries. | Yes — which reports/summaries do you want visible in Admin? Keep and wire the required ones; remove the unused endpoints/helpers only after the final repo-wide call-site check. |
| A7 | PIN lookup still uses a fixed public salt for its deterministic lookup hash. | `server/utils.ts` uses `PIN_LOOKUP_SALT` for `computeLookupHash`. A database exposure could permit offline guessing of short numeric PINs against lookup hashes. | Yes — prioritize a lookup-hash redesign/migration before launch or schedule after pilot? |
| A8 | Launch-readiness evidence is incomplete despite passing automated gates. | The latest application-code release at audit start passed Production Gate and its deployed Worker artifact passed a live smoke check. All-role manual walkthroughs and owner-only usage/billing/privacy actions remain unconfirmed; release verification must be repeated after code fixes. | Yes — owner actions and guided role walkthrough remain. |
| A9 | Active monthly subscribers are rejected by the only vehicle check-in route; no separate subscriber vehicle check-in route was found in the inspected path. | `server/domain/vehicleCheckIn.ts` returns `MONTHLY_SUBSCRIBER_NOT_CHECKED_IN` for active subscribers and a route test expects failure. This may prevent tracking subscribers entering/exiting through the normal vehicle flow. | Yes — confirm whether active subscriber cars should be tracked without a regular credit debit. |
| A10 | Subscriber pricing/duration behavior is unclear and potentially inconsistent with the product contract. | Creating a subscriber does not debit credits; renewal always debits five paid credits only, while the UI offers one-week, two-week, and one-month renewals. The product contract says monthly subscribers have no separate subscriber charge, but the current behavior may imply a renewal charge. | Yes — confirm whether creation is free, whether all renewal durations cost five paid credits, and whether weekly durations should remain. |
| A11 | The Packages tab is gone, but backend credit-bundle templates remain. | Credit-grant route accepts optional `packageId` from the `packages` collection; direct amount grants also work. | Yes — keep admin-only templates or remove the remaining catalog/template path? |
| A12 | The garage report's "Today's revenue" value changes meaning depending on data source. | `src/components/garage/GarageReportsView.tsx` uses `dashboardSummary.netRevenue` when the maintained summary is fresh, but its fallback sums checkout amounts and ignores `delete_refund` logs. The same label can therefore show net-after-refunds or gross checkout revenue. | Yes — decide whether the label means gross check-out revenue or net after refunds. |
| A13 | The investment calculator's delegate-commission formula contradicts the approved financial model. | `src/components/admin/AdminPartnerDividendCard.tsx` models delegate commission as a percentage of revenue (default 0%), while `docs/PROJECT.md` defines a fixed 100 EGP commission exactly once per garage on its first successful paid credit grant. Other defaults (2 new garages/month, 400 credits/garage/month, 5,000 EGP operating costs, 25% investor ownership) also appear to be assumptions, not confirmed inputs. | Yes — confirm whether to align the calculator with the fixed commission rule and whether those defaults are realistic estimates. |
| A14 | Announcement management methods remain, but the Admin tab redirects away from the retired announcements tab and no management screen caller was found. | `src/components/admin/AdminDashboard.tsx` redirects saved `announcements` tabs to `catalog_settings`; `adminAnnouncementService` still has create/delete/toggle methods while the live app retains an announcement read/listener path. | Yes — restore an Admin management screen or remove the unused mutation methods/routes while keeping announcement display? |
| A15 | PIN length rules conflict across client and server, blocking garage creation and confusing the shared login flow. | `server/validation.ts` requires exactly 5 digits for new PINs, but `AdminAddGarageModal` requires 8 digits; `src/utils/index.ts` still sets `NEW_PIN_LENGTH = 8`; and some PIN generators still produce 8 digits. The server rejects an 8-digit new garage PIN, so garage creation can fail. `LoginView` permits 1–10 digits while server login accepts only 5- or 8-digit formats, so unsupported lengths can be submitted and rejected. The generator also uses `Math.random()` and its fallback is hard-coded to 8 digits. | The five-digit target was previously approved; confirm the safe transition for the existing 8-digit Admin PIN and constrain new PIN creation/login input accordingly. |
| A16 | Date/time and number presentation does not consistently follow the Cairo/English-digit UI contract. | `src/utils/index.ts` formats entry time with `Intl.DateTimeFormat('ar-EG')` without a fixed `Africa/Cairo` timezone or Latin-number option; `SubscriberModals.tsx` hard-codes duration labels using Arabic-Indic digits; some numeric fields do not explicitly set `dir="ltr"`. | Already decided by owner: use Cairo time and English digits/LTR numeric entry; schedule with the deferred UI cleanup. |
| A17 | The client-side legacy vehicle-cost fallback is unreachable. | `src/utils/index.ts` returns zero for any duration under the five-minute grace period before checking `diffMs <= 2000`; that later fallback can never run. The Worker also returns zero for missing/invalid entry time. The code comment claims old offline vehicles get charged at least one hour, but that behavior is not implemented. | Only if legacy/offline vehicle compatibility is still required; otherwise remove the dead branch. |
| A18 | Subscriber dates can be extended without the renewal debit, and renewal accepts arbitrary durations. | `POST /api/subscribers/update` accepts `startDate`/`endDate` changes without a credit debit. `POST /api/subscribers/renew` validates only that the dates are valid and ordered, then always debits five paid credits; it does not enforce the UI's 7/14/30-day choices. A caller can extend dates for free through edit or request a much longer period for five credits. | Yes — confirm the subscriber duration/price rule; then enforce it server-side and prevent edit from bypassing renewal. |
| A19 | A Cloudflare preview Worker remains, but its matching preview environment is not represented in the current repo. | The connected account still has `rq-hono-preview`; the repo has no `wrangler.preview.toml`, and the prior preview Firebase project was deleted. This may be intentional or orphaned; current use cannot be proven from source alone. | Yes — confirm whether the preview Worker is still used or can be retired after checking its bindings/traffic. |
| A22 | Delegate access exposes more garage data than a minimal referral summary, and one list route returns raw garage documents. | `server/financialRoutes.ts`'s delegate dashboard uses `sanitizeDelegateDoc`, which removes only `pin`, `ownerPin`, `adminPin`, `pinHash`, and `pinLookupHash`; it otherwise returns the full document. More importantly, `GET /api/garages` allows delegates and maps results to `{ id, ...doc.data() }` without sanitization. `firestore.rules` also permits delegates to read garage, vehicle, and subscriber documents. This can expose credit balances/contact details, individual plates/status, subscriber personal details, and any legacy sensitive fields still present on garage documents. | Yes — define exactly what delegates should see and whether the delegate list API should use a strict allowlist rather than return raw garage documents. |
| A23 | Check-out does not safely handle missing, invalid, null, or epoch-like entry times. | `calculateVehicleCost` returns `0` for absent/invalid `entryTime`, yet the route can still mark an `inside` vehicle as exited. `null` or `0` reaches `new Date(...)` as the Unix epoch and can produce an implausibly large charge, while the client `safeDate` helper treats epoch/invalid values as the current time and displays zero cost. No focused regression test for these corrupt-record cases was found in the inspected route test. | Yes — should check-out reject the record and require correction unless the entry timestamp is valid, rather than allow a zero-cost or potentially enormous charge? |

| A24 | Staff accounts for the same garage can read that garage's prepaid credit ledger. | `GET /api/garages/:id/credit-ledger` authorizes both `garage` and `staff` roles when scoped to the garage, even though the route comment describes Admin and garage owner access. The returned staff/owner shape includes credit bucket, amount, and balance-before/after details; a test only verifies that staff from another garage are blocked. | Yes — should staff see credit-balance history, or should this endpoint be restricted to Admin and garage owner? |

| A25 | The 100 EGP one-time delegate commission is credited only to `createdByDelegateId`, even when a different `referrerId` is present. | The first-paid-credit-grant transaction chooses the commission recipient from `createdByDelegateId`; it does not fall back to or compare `referrerId`. The product contract defines the commission amount/timing but not the recipient when those fields differ. | Yes — if the creator and referrer are different delegates, who should receive the one-time 100 EGP commission: creator, referrer, or another explicitly selected delegate? |

| A26 | The garage credit-recharge history silently shows at most the first 50 paid grants, with no pagination or warning that older records are omitted. | `adminBillingService.getGarageCreditLedger` requests `limit=50` and returns only `data`; `RechargeHistoryView` filters the returned page to paid grants and has no cursor/hasMore UI. As a garage receives more than 50 grants, older payments disappear from this screen even though they remain in the ledger. | Yes — is a latest-50 view sufficient, or should the history support loading all older paid grants with pagination? |

| A27 | Cloudflare Pages runs production deployments for documentation-only commits. | The connected `rq` Pages project has `path_includes: ["*"]` and no path exclusions. Its production deployment history shows the docs-only plan commits triggering builds/deployments; a new production build was active for the audit-plan-only commit while the previous deployment remained canonical. This adds avoidable production deployment churn for documentation changes. | Yes — should documentation-only commits avoid production frontend builds/deployments, with deploys triggered only by app/build/config changes? |

| A28 | The garage's new prepaid-credit grant flow does not trigger the existing recharge notification. | The dashboard notification listens to `subscribeToGarageRechargeLogs`, which filters legacy `activity_logs` for `actionType === 'recharge'` and falls back to legacy `lastRechargeDate`/`lastRechargeAmount`. The current credit-grant route writes `actionType: 'credit_grant'` and the credit ledger, without updating those legacy fields; the fallback filter also excludes the new event shape. The recharge history screen can still read paid grants from the ledger, so history and notifications behave differently. | Yes — should a successful Admin credit grant trigger a garage-side notification? If yes, wire the notification to the prepaid-credit ledger/event rather than legacy recharge fields. |

| A29 | The garage's daily transaction query hard-codes Cairo midnight as UTC+02:00, which is wrong during daylight-saving time. | `src/services/vehicleService.ts` builds `getCairoDayStartTimestamp()` using `${cairoDateStr}T00:00:00+02:00` even though `getCairoDateKey()` uses `Africa/Cairo`. During Cairo UTC+03:00 periods, the query starts one hour late and can omit early-morning check-outs from the daily report. No DST-specific test was found in the inspected test inventory. | Yes — may I replace the fixed offset with a DST-aware Cairo day-boundary calculation and add tests for both UTC+02:00 and UTC+03:00 dates? |
| A30 | The Admin summary endpoint can count pending garages as active, but the current UI appears not to use this summary. | `server/garageRoutes.ts` increments `activeGarages: 1` when creating a garage even when delegate-created garages receive `status: 'pending'`; `server/readRoutes.ts` fallback counts every non-trial garage as active without checking status. The endpoint's client helper had no caller in the inspected UI/hooks. | Yes — should this Admin summary be removed as unused, or retained with an explicit definition of an active garage (for example, approved and usable) and corrected counting? |

| A31 | Check-out calculates charges using the garage's current rates, not rates saved when the vehicle entered. | The check-in route stores `entryTime` and vehicle type but no hourly/overnight rate snapshot; the check-out route calls `calculateVehicleCost(vehicleData, garageData)` using the current garage document. Changing rates while a vehicle is inside can change its eventual bill. | Yes — should a vehicle keep the rate that was in effect at check-in, or should the latest rate apply at check-out? |
| A32 | The five-minute correction window and refund controls are enforced only by the UI, not by the server; a completed checkout can be deleted and compensated twice. | `CheckOutModal` shows delete/correction only for the first five minutes, but `/api/vehicles/delete` does not check entry age or require an Admin for cash refunds. The same garage/staff account can call it later. The route restores the original prepaid entry credit whenever `creditDebit` exists, regardless of whether the vehicle is still inside; for an exited vehicle it can also accept `refundAmount > 0` and subtract cash revenue up to `totalCost`. A manipulated request can therefore restore an entry credit and refund the checkout charge, or restore a credit without reversing checkout revenue. The normal UI sends `0`, but the API accepts a different request. | Yes — should the server enforce the five-minute correction window, who may issue cash refunds, and should refunding a completed checkout restore the prepaid entry credit or only reverse the parking charge? |

| A33 | System-config update accepts retired financial/maintenance settings that the read API and active app do not use. | `POST /api/admin/update-system-config` still accepts `delegateMonthlyCommission`, `referralFeePerRenewal`, `isMaintenanceMode`, and `maintenanceMessage`, but `GET /api/system-config` allowlists only `adminColor`; no active consumer for those global settings was found in the inspected runtime/UI. `delegateMonthlyCommission` also conflicts with the current fixed one-time 100 EGP commission rule. | Yes — should we remove these write-only/retired settings and keep only the active config fields? This matches the decision to remove logic that contradicts the current financial model. |
| A34 | The client still contains an activity-log write helper that always fails, and no active call site was found in the reviewed flows. | `adminActivityService.addActivityLog` posts to `/api/activity-logs/add`, but the Worker route deliberately always returns `SERVER_GENERATED_ONLY` with HTTP 403. Vehicle and credit events are written server-side; no caller was found in the main garage/vehicle/admin flows inspected. | Yes — after a final repository-wide call-site check, may we remove this unused client helper and its placeholder route, while keeping server-generated activity logs? |
| A35 | Regular entry debits paid credits before referral and trial credits, but the approved product contract does not define the bucket-consumption order. | `debitRegularEntry` spends `paid` first, then `referral`, then `trial`. That means a garage can consume paid credits while free trial/referral credits remain. The contract defines separate buckets but does not specify the priority. | Yes — which bucket should be consumed first for each regular vehicle entry: trial, referral, paid, or the current paid → referral → trial order? |
| A36 | There is no cash-refund workflow for an unused prepaid-credit purchase. | The credit ledger supports paid grants, debits, and correction restores; the vehicle refund endpoint can refund a checkout charge, but there is no route/event for returning money for an unused paid-credit grant. The project contract does not state whether paid-credit purchases are refundable. | Yes — are prepaid-credit purchases non-refundable, or should Admin be able to refund unused paid credits and record the cash refund in the ledger/report? |
| A37 | The referral reward is hard-coded to 20 credits but that amount is not stated in the current product contract. | `server/domain/prepaidCreditLedger.ts` fixes `REFERRAL_AWARD_AMOUNT = 20`, and the first-paid-grant route awards exactly 20 referral credits to the referring garage. `docs/PROJECT.md` defines the one-time delegate commission but does not define this referral-credit amount. | Yes — confirm that the referring garage should receive exactly 20 free credits after the referred garage's first confirmed paid grant. |

| A38 | The production Firestore REST adapter does not retry aborted/conflicting transactions. | `FirestoreRest.runTransaction` begins a transaction, runs the callback once, and commits once; it has no retry/backoff for Firestore `ABORTED`/409 conflicts. Check-in/out, credit grants, subscriber renewals, and maintained counters update shared documents, so concurrent staff operations can fail instead of retrying safely. The adapter test does not cover contention/retry. | Yes — may I add bounded retries for retryable transaction conflicts, with regression tests and idempotency preserved? |
| A39 | The production Firestore REST adapter conflates strict `update()` with `set(..., { merge: true })`. | `DocumentReference.update()` and `DocumentReference.set(..., { merge: true })` both become the same `method: 'update'`; the REST write includes no `currentDocument.exists: true` precondition. Firestore REST update/patch can create a missing document without that precondition, unlike the Admin SDK's strict `update()` semantics. For example, toggling a nonexistent announcement could create a partial document instead of returning not-found. Adapter tests do not cover this distinction. | Yes — may I make the adapter distinguish strict update from merge-set, enforce existence for `update()`, and add tests for missing-document behavior? |

| A40 | The live Admin delegate-finance screen still calculates sales/net revenue from legacy recharge logs, not the current prepaid-credit grants. | `AdminDelegateDetailsView` calls `getDelegateRecharges`, which queries `activity_logs` for `actionType === 'recharge'`; the current credit-grant route writes `actionType: 'credit_grant'` and `prepaid_credit_grant_paid` events instead. Therefore the delegate's sales card and company-net-revenue card omit current paid credit sales (often showing zero) even while the commission card shows the new 100 EGP commission. The net-revenue display also clamps negative values to zero, hiding a loss when commission exceeds the grant payment. | Yes — should I rebuild this screen around current paid-credit grants/commission events and show the true net result, including a negative result when costs exceed receipts? |
| A41 | Delegate dashboard polling merges the latest garage page into old state but never removes garages that disappeared from the server response. | In `useGarageSync`, after the first load, each poll uses `setAllGarages(previous => Map([...previous, ...data.garages]))`; this updates/adds rows but cannot remove a garage that was deleted or no longer referred to the delegate. Stale rows can remain visible until the delegate/session changes. | Yes — may I make refreshes remove stale rows while preserving separately loaded pagination pages? |
| A42 | Supervisor support remains in the frontend and PIN lookup even though the Worker rejects the supervisor role as retired. | `requireWorkerAuth` returns `ROLE_RETIRED` for `supervisor`, but `Supervisor` state/types, `AdminPeopleView` supervisor branches, and `checkPinAvailabilityAcrossAll` still reference the role/collection. This leaves dead UI and can reserve PINs for accounts that cannot log in. | Yes — should we remove the remaining supervisor UI/model/PIN lookup after a final call-site and data check? |
| A43 | Paid credit grants require a payment reference but do not prevent the same reference being used for another grant with a different idempotency key. | The credit-grant route validates `paymentReference` as non-empty and includes it in the request fingerprint, but it does not query for an existing ledger/event with the same reference. A repeated manual receipt reference can therefore create another grant if a new idempotency key is used. | Yes — should payment references be unique across paid grants, so reusing one is rejected unless an Admin explicitly records a correction? |

| A44 | Garage lock/suspend flags are enforced by the UI but not by the backend authorization path. | The Admin detail UI toggles both `isLocked` and `isSuspended`; `GarageDashboardView` displays a lock overlay, but `resolveWorkerSessionUser`/`requireWorkerAuth` do not check those fields and the garage update route does not invalidate active sessions when the flags change. Existing garage/staff sessions can continue calling scoped APIs directly while the UI appears locked. | Yes — should locking/suspending a garage immediately block all scoped API actions and revoke its active sessions? If yes, I can enforce this server-side. |
| A45 | Staff `permissions` and `role` fields are stored but do not affect server authorization. | `/api/staff/create` and `/api/staff/update` accept `permissions` and `role`, but `canManageGarageScopedData` authorizes all staff by role plus garage ID; route checks do not inspect the stored permission map. No active UI for configuring those permissions was found in the reviewed screens. | Yes — should staff have granular permissions, which actions should be restricted, or should the unused permission/role fields be removed to keep the model simple? |
| A46 | Delegate settlement records the amount/date but has no payment reference, method, or settlement note. | `/api/delegates/settle-account` creates a settlement record with `previousCycleTotal`, `settledByUid`, and timestamps, then clears the unsettled amount. It does not capture a bank-transfer reference, cash receipt, payment method, or note, so the record proves that the app marked the commission settled but not how the real-world payment was made. | Yes — is the existing settlement ID/date/amount sufficient, or should Admin record a payment method and receipt/reference before settling a delegate? |

**Reviewed against the approved product contract, not flagged as a defect:** the one-time 100 EGP delegate commission on a garage's first successful paid credit grant matches `docs/PROJECT.md`. It must not be changed unless the owner revises that contract.

**Do not implement owner-dependent behavior changes until the corresponding Section 13 questions are answered.** Continue the audit for additional confirmed defects, security issues, wiring gaps, and dead code before declaring the question list final.

## 4. Progress Tracker (every executor updates this)

Legend: `[ ]` not started · `[~]` in progress · `[x]` done+verified · `[!]` blocked · `[-]` skipped by owner decision

| ID | Task | Risk | Status | Date | Commit | Notes |
|----|------|------|--------|------|--------|-------|
| P0.1 | Branch, Node 22, `npm ci` | low | [x] | 2026-10-25 | 0f2b375 | Verified by Production Gate run #40188951017 on the unchanged application source tree: Node 22 setup and `npm ci --ignore-scripts --no-audit --no-fund` passed. No local checkout was created. |
| P0.2 | Baseline: lint + test + ci:check | low | [x] | 2026-10-25 | 8e5cd17 | Exact `npm run ci:check` passed in Phase 0 Baseline Verification run #40198933303 after `npm ci --ignore-scripts --no-audit --no-fund`. The full gate passed: clean install, active Worker secret scan, TypeScript check, Vitest suite, Firestore rules tests, production build, Worker artifact smoke test, maintainability check, and artifact verification. App source was unchanged. |
| P0.3 | Baseline size counts | low | [x] | 2026-10-25 | 8e5cd17 | Executed in run #40198933303. Corrected measured baseline: 30,526 non-test `.ts`/`.tsx` lines in `src` + `server`; 19,309 lines in test files under `src`, `server`, and `tools`; 498 tracked files (`git ls-files`); 595 files found excluding `node_modules` (includes untracked runner-generated files, so use tracked count for repo baseline). The plan's original ungrouped `find` expression reports 41,545 and overcounts due to `-o` precedence; do not use that as the non-test count. |
| P0.4 | Ask & record owner decisions D1–D5 | low | [x] | 2026-10-25 | pending | Owner answers recorded; D2 remains unknown due Cloudflare billing scope; D4 requires caller investigation |
| P1.1 | Heartbeat 5 min → 15 min | low | [x] | 2026-10-25 | ff70579 | Merged in PR #395 (merge `d700304`); Production Gate run #40199945696 passed. Heartbeat now 15 min; resume heartbeat after 10 min. No production deployment. |
| P1.2 | Delegate dashboard poll 15 s → 120 s, pause when hidden | low | [x] | 2026-10-25 | 5dcf0d4 | Merged in PR #397 (merge `28a0cca`); Production Gate run #40200933260 passed. Poll interval is 120 s; polling pauses while hidden. Deploy jobs skipped. |
| P1.3 | Delete dead garage live listeners | low | [x] | 2026-10-25 | caffcff | Removed both unused garage listener methods, their unused imports, and the obsolete test that depended on the removed delegate listener. PR #399 merged; Production Gate run #40201555729 passed. |
| P1.4 | Usage monitoring setup (OWNER ACTION) | low | [!] | 2026-10-25 | 67d2e48 | PR #411 merged. Blocked: this session has no authenticated Google Cloud CLI or Firebase/Google Cloud connector. Owner must bookmark Firebase Console → Firestore → Usage and create the low-threshold Cloud Billing budget alert after moving to the paid plan; no account settings were changed. |
| P2.1 | Delete dead files (+ their tests) | low | [x] | 2026-10-25 | 7dde9ad | PR #401 merged as 2af758a; Production Gate run #40207192163 passed. Removed 11 audit-listed dead files and retired their dependent test cases/imports. Deploy jobs skipped; no production deployment. |
| P2.2 | Delete dead functions/methods | med | [x] | 2026-10-25 | 098c68e | PR #403 merged as 210b54b; Production Gate run #40209268959 passed (typecheck, full tests, rules tests, build and artifact checks). Removed the planned helpers; review-only methods were left untouched. Deploy jobs skipped; no production deployment. |
| P2.3 | Remove coupons feature (D5) | low | [x] | 2026-10-25 | 575ab7e | Merged in PR #405; the retired coupon feature was removed. |
| P2.4 | Remove retired billing/trial/supervisor endpoint tombstones per owner direction (D4) | med | [x] | 2026-10-26 | 6046868 | PR #422 merged to `main` as `6046868d012da731e5cee8d1e47e418ffb550b5e`. Production Gate run #40272536511 passed typecheck, full test suite, Firestore rules emulator tests, production build, Worker artifact smoke, maintainability, and artifact checks. Active prepaid-credit grants/ledger and credit-bundle catalog remain untouched. Deployment jobs were skipped; no deployment is claimed. |
| P2.5 | Remove screenshot clutter from `docs/` | low | [x] | 2026-10-25 | f82b40c | Removed 113 baseline and 6 authenticated-smoke artifacts (~1.58 MB); capture outputs now default to ignored `tmp/` folders. Full Production Gate passed. Its PR deploy jobs were skipped, but separate post-merge automation unexpectedly deployed the Worker artifact and passed live smoke; this deployment was not requested. |
| P2.6 | Refresh retained template artifacts to current product model (owner direction) | low | [x] | 2026-10-26 | 3739700 | PR #419 merged; Production Gate run #40267974321 passed, including typecheck, full test suite, Firestore rules tests, production build, artifact smoke, maintainability, and production-artifact checks. Both files were retained and refreshed; no runtime source or stored data changed. |
| P3.1 | Remove browser session-write fallback | **high** | [x] | 2026-10-25 | 38d7439 | Worker is the only session authority; browser fallback transaction helpers and their tests removed. Focused lint/tests passed. |
| P3.2 | Lock Firestore rules (browser = read-only) | **high** | [x] | 2026-10-25 | 4bcca03 | Session, garage, staff, delegate, settings, package, retired billing, system-config, and daily-counter browser writes are denied; emulator matrix passes. |
| P3.3 | Close `admin_settings` wallet read | med | [x] | 2026-10-25 | 4bcca03 | Wallet/subscription settings are Admin-only; non-admin reads are denied and Admin reads remain covered. |
| P3.4 | Update rules tests; deploy rules (OWNER ACTION) | **high** | [x] | 2026-10-25 | 4bcca03 | Emulator/full gate passed. Preview project was deleted, so the owner explicitly authorized the direct path; Firebase CLI released the checked-in rules to production database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`, and the live read-back shows Worker/server-only mutations. |
| P4.1 | CORS allowlist cleanup | low | [x] | 2026-10-25 | 39b7a90 | Merged in PR #407. Default Worker CORS allows only `https://rq-acg.pages.dev`; local/custom origins remain configurable through `ALLOWED_ORIGINS`. Focused CORS tests, source-origin audit, and garage browser smoke passed. |
| P4.2 | Remove legacy PIN formats (needs D1 = NO) | **high** | [x] | 2026-10-25 | 729623f | Merged in PR #408. D1 = NO. Server accepts only modern per-account `$scrypt$` PINs; shared-salt legacy hashes and plaintext PINs are rejected. Legacy verifier helpers were removed; dependent fixtures now use modern hashes. Full suite passed: 138 files / 893 tests. |
| P4.3 | Check Worker plan / CPU (OWNER ACTION, D2) | med | [!] | 2026-10-26 | pending | Read-only Cloudflare API check confirms both `rq` and `rq-hono-preview` use the `standard` usage model, but this does not identify the account's Free/Paid subscription or CPU usage. Account billing usage remains HTTP 403 because the connected token lacks Billing Read. Owner must verify plan and CPU/usage in the Cloudflare dashboard or reconnect with Billing Read; no settings changed. |
| P4.4 | Make repo private + rotate secrets (OWNER ACTION) | med | [ ] | | | |
| P5.1 | Full validation suite | low | [ ] | | | |
| P5.2 | Manual walkthrough of all 4 roles | low | [ ] | | | |
| P5.3 | Firebase + Cloudflare launch checks | med | [ ] | | | |
| P5.4 | Staged pilot (1 → 3 → 9 garages) | med | [ ] | | | |

---
## 5. PHASE 0 — Safety net (no code changes)

**Goal:** know the starting point so we can prove nothing broke.

**P0.1** `git checkout -b fix/production-readiness`. Confirm `node -v` is 22.x (file `.node-version`). Run `npm ci`.

**P0.2** Run and record the result of each: `npm run lint` · `npm test` · `npm run ci:check`.
If any fail **before** we touch anything → STOP, record which tests fail, tell the owner. Do not "fix" them in this plan.

**P0.3** Record in the Execution Log:
```bash
find src server -name '*.ts' -o -name '*.tsx' | grep -v -E '\.test\.|__tests__' | xargs wc -l | tail -1
find src server tools -name '*.test.*' | xargs wc -l | tail -1
find . -path ./node_modules -prune -o -type f -print | wc -l
```
(For reference, my count: ~30,934 non-test lines, ~19,309 test lines, 538 files in the ZIP.)

**P0.4** Ask the owner D1–D5 (section 2) in plain language. Write the answers into section 2.

**Done when:** baseline recorded, decisions recorded.

---

## 6. PHASE 1 — Protect the free quota (do this first: biggest value)

### P1.1 Heartbeat: every 5 min → every 15 min

**File:** `src/hooks/useGarageSession.ts`
**Why:** each heartbeat makes the Worker write 3 documents (entity, session root, session index). 15 min is still far inside the 24-hour session limit. "Logged in on another device" is detected instantly by the entity listener in the same file, not by the heartbeat.

**BEFORE (delete):**
```ts
      // 5-minute heartbeat interval is safe with the 24-hour inactivity timeout and reduces Firebase Spark write quota
      heartbeatTimer = setInterval(sendHeartbeat, 300000);

      visibilityHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (Date.now() - lastHeartbeatTime > 180000) {
            sendHeartbeat().catch(() => {});
          }
        }
      };
```
**AFTER (replace with):**
```ts
      // Each heartbeat costs ~3 Firestore writes on the Worker. 15 minutes keeps the
      // session fresh (24-hour limit) while staying well inside the free write quota.
      const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
      const HEARTBEAT_RESUME_GAP_MS = 10 * 60 * 1000;
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

      visibilityHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (Date.now() - lastHeartbeatTime > HEARTBEAT_RESUME_GAP_MS) {
            sendHeartbeat().catch(() => {});
          }
        }
      };
```
**Verify:** `grep -rn "300000\|180000" src` → find any test asserting the old numbers and update only those numbers. `npm run lint && npm test`.

---

### P1.2 Delegate dashboard: poll every 15 s → every 120 s, only while visible

**File:** `src/hooks/useGarageSync.ts` (inside the delegate-dashboard `useEffect`, right after the `loadDashboard` function)

**BEFORE (delete):**
```ts
    void loadDashboard();
    const refresh = window.setInterval(loadDashboard, 15000);
    return () => {
      cancelled = true;
      if (delegateDashboardGenerationRef.current === requestGeneration) {
        delegateDashboardGenerationRef.current += 1;
      }
      window.clearInterval(refresh);
    };
```
**AFTER (replace with):**
```ts
    void loadDashboard();
    // Delegates do not need second-by-second numbers. Every refresh reads the delegate
    // record plus a page of garages, so poll slowly and only while the tab is visible.
    const DASHBOARD_REFRESH_MS = 120_000;
    const DASHBOARD_MIN_GAP_MS = 30_000;
    let lastDashboardLoadAt = Date.now();
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (Date.now() - lastDashboardLoadAt < DASHBOARD_MIN_GAP_MS) return;
      lastDashboardLoadAt = Date.now();
      void loadDashboard();
    };
    const refresh = window.setInterval(refreshIfVisible, DASHBOARD_REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      cancelled = true;
      if (delegateDashboardGenerationRef.current === requestGeneration) {
        delegateDashboardGenerationRef.current += 1;
      }
      window.clearInterval(refresh);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
```
**Verify:** `grep -rn "15000" src` → update any test that fakes the 15-second timer to use 120000. `npm run lint && npm test`.

---

### P1.3 Delete the unused "listen to ALL garages" listener

**File:** `src/services/garageService.ts`. My scan found **no caller anywhere** (not even tests). With many garages, every change to any garage document would be re-read by the admin screen.

**BEFORE (delete the whole property, from its first line through its closing `},`):**
```ts
  subscribeToGarages: (callback: (garages: Garage[]) => void) => {
    const trackerUnsub = listenerTracker.register('garages');
    let timeoutId: any = null;
    let latestGarages: Garage[] | null = null;
    let isFirst = true;

    const emit = () => {
      if (latestGarages) {
        callback(latestGarages);
      }
    };

    const q = query(collection(db, 'garages'));
    const unsub = onSnapshot(q, (snapshot) => {
      const rawGarages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Garage));
      latestGarages = sortGaragesNewestFirst(rawGarages);
      if (isFirst) {
        isFirst = false;
        emit();
      } else {
        // Throttle high-frequency updates (e.g. 10-30 transactions/sec across 1000 garages) to prevent UI thread lockup
        if (!timeoutId) {
          timeoutId = setTimeout(() => {
            timeoutId = null;
            emit();
          }, 2000);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'garages'));

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      unsub();
      trackerUnsub();
    };
  },
```
**AFTER:** nothing (the property is removed). Also delete the sibling `subscribeToDelegateGarages` (no production caller; 3 test references):
```ts
  subscribeToDelegateGarages: (delegateId: string, callback: (garages: Garage[]) => void) => {
    if (!delegateId) {
      callback([]);
      return () => {};
    }
    const trackerUnsub = listenerTracker.register(`delegates/${delegateId}/garages`);
    const q = query(
      collection(db, 'garages'),
      or(
        where('createdByDelegateId', '==', delegateId),
        where('referrerId', '==', delegateId)
      )
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const rawGarages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Garage));
      callback(sortGaragesNewestFirst(rawGarages));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'garages/delegate'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },
```
Delete the test cases that call `subscribeToDelegateGarages` (find with `grep -rn subscribeToDelegateGarages src`). Then let `npm run lint` tell you which imports are now unused (`or`, `sortGaragesNewestFirst`, …) and remove only those.
**Verify:** `grep -rn "subscribeToGarages\|subscribeToDelegateGarages" src server tools` → no results. `npm run lint && npm test`.

---

### P1.4 Usage monitoring (OWNER ACTION — requires owner access)

1. Firebase Console → your project → **Firestore → Usage** tab. Bookmark it.
2. Google Cloud Console → Billing → **Budgets & alerts** (needed once you switch to the paid plan): create an alert at a low amount (e.g. $5) so a bug cannot surprise you.
3. During the pilot (P5.4) write down the day's peak **reads** and **writes** in the Execution Log.

**Phase 1 done when:** P1.1–P1.3 `[x]`, `npm run lint && npm test && npm run ci:check` pass.

---

## 7. PHASE 2 — Delete dead code and clutter

> Rule for every deletion: **(1)** run the `grep` shown → confirm nothing in production code uses it; **(2)** delete; **(3)** run `npm run lint` (it will reveal now-unused imports — remove only those); **(4)** `npm test`.

### P2.1 Dead FILES (never imported by the running app)

I built the import graph from the two real entry points (`src/main.tsx` and `server/cloudflareWorker.ts`). These files are not reachable:

| Delete this file | Lines | Also edit |
|---|---|---|
| `src/constants/packages.ts` (`BALANCE_PRESET_AMOUNTS`, old wallet presets) | 1 | nothing |
| `src/utils/adminTranslationsBase.ts` (empty object) | 7 | nothing |
| `src/utils/adminTranslationsExtended.ts` (empty object) | 7 | nothing |
| `src/hooks/useSystemSubscribersFlatFee.ts` (old per-package commission hooks) | 39 | `src/hooks/useSystemConfig.test.tsx`: remove the import (`useSystemDelegateCommissions`, `useSystemReferralFee`) and only the test case(s) using them |
| `src/components/AnimatedCounter.tsx` + `src/components/AnimatedCounter.test.tsx` | 178 + test | nothing |
| `src/components/auth/AdminLoginView.tsx` | 176 | `src/__tests__/modularizedComponents.test.tsx`: remove only the cases for these 3 components |
| `src/components/auth/DelegateLoginView.tsx` | 109 | (same test file) |
| `src/components/ui/NumericKeypad.tsx` (only used by the two login views above) | 57 | (same test file) |
| `server/summaryTelemetry.ts` + `server/summaryTelemetry.test.ts` (nobody calls `recordSummaryRead`) | 57 + test | nothing |

The real login screen is `src/components/auth/LoginView.tsx` (used by `src/components/app/AppRoutes.tsx`) — **keep it**.

**KEEP these even though the graph flags them** (they are not dead): `server.ts` and `server/nodeAdapter.ts` (the local dev server, `npm run dev`), `vite.config.ts`, `src/vite-env.d.ts`, `src/test/setup.ts`, `server/api.ts` (tiny import point used by tests), `server/pinRotation.ts` (tiny, tests only).

**Verify (all must return nothing):**
```bash
grep -rn "AdminLoginView\|DelegateLoginView\|NumericKeypad\|AnimatedCounter\|summaryTelemetry\|useSystemSubscribersFlatFee\|adminTranslationsBase\|adminTranslationsExtended\|constants/packages" src server tools
```

---

### P2.2 Dead FUNCTIONS (no caller in production code or tests)

Delete each; then remove imports that lint reports as unused.

**a) `src/services/authService.ts` — two methods that write to the database from the browser and have no caller:**
```ts
  updateSession: async (collectionName: string, id: string, _meta?: any) => {
    if (!id) return;
    try {
      await setDoc(doc(db, collectionName, id), { lastActive: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error(`[AuthService] Error updating ${collectionName} session:`, e);
    }
  },
```
```ts
  updateStaffSession: async (id: string, _meta?: any) => {
    if (!id) return;
    try {
      await setDoc(doc(db, 'staff_sessions', id), { lastActive: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error('[AuthService] Error updating staff session:', e);
    }
  }
```
Also in the same file delete (no callers): `claimOrRefreshDelegateSession` (a one-line wrapper) and `releaseAdminSessionOnServer`.

**b) `src/services/garageService.ts` — browser write to the garage document, no caller:**
```ts
  claimOrRefreshGarageSession: async (
    garageId: string,
    sessionId: string,
    _serverTimeOffset = 0
  ) => {
    const garageRef = doc(db, 'garages', garageId);
    const sessionRef = doc(db, 'garage_sessions', garageId);

    return withRetry(() => runTransaction(db, async (transaction) => {
      const garageSnap = await transaction.get(garageRef);
      if (!garageSnap.exists()) throw new Error('GARAGE_NOT_FOUND');

      const data = garageSnap.data();

      transaction.update(garageRef, {
        currentSessionId: sessionId,
        lastActive: serverTimestamp(),
      });
      transaction.set(sessionRef, {
        garageId,
        sessionId,
        uid: auth.currentUser?.uid || null,
        lastActive: serverTimestamp(),
      }, { merge: true });

      return { ...data, id: garageSnap.id, currentSessionId: sessionId };
    }));
  },
```

**c) `src/services/authSessionService.ts` — no caller:**
```ts
export const updateSessionHeartbeat = async (garageId: string): Promise<void> => {
  const sid = getCanonicalSessionId();
  await refreshEntitySession({
    role: 'garage',
    entityId: garageId,
    sessionId: sid,
    uid: garageId
  });
};
```
Also delete (zero uses): `HEARTBEAT_TIMEOUT_MS`, `getOrCreateDeviceId`.

**d) Others with zero uses anywhere** — open the file, delete the whole function/property:
`src/services/delegateService.ts`: `getDelegateByPhone`, `subscribeToDelegate` · `src/utils/delegateCommissionCalculations.ts`: `filterApprovedRequests` · `src/utils/index.ts`: `createAsyncLock`.

**e) DO NOT delete automatically — "REVIEW" list.** These have **no production caller** but **do** have tests. They might be a screen that is missing or wired under another name. For each, the executor must (1) search the Admin UI for a button/screen that should use it, (2) report to the owner in plain words: "No screen uses X. Delete it? yes/no". Record the owner's answer in the Execution Log.
`adminActivityService.addActivityLog`, `getPaginatedActivityLogs` · `adminAnnouncementService.createAnnouncement`, `deleteAnnouncement`, `toggleAnnouncementActive` · `adminBillingService.getFinancialReport` · `adminCoreService.getAdminSummary`, `subscribeToGarageStaff` · `adminPackageService.addPackage`, `deletePackage` · `vehicleService.getTodayTransactionsOnce` · `authService.releaseDelegateSession` · `utils/delegateCommissionCalculations.filterRequestsByMonth` · `utils/index.formatPlateLetters` · `domain/auth/sessionPolicy.getSessionConflictCode`.
> Special note for the owner: the Admin dashboard has an "announcements" tab and a "packages" tab, yet the functions that **create/delete** announcements and packages are not called by any screen. Please check by hand that you can add an announcement and a package in the Admin screen (P5.2). If you can't, that is a real bug to report, not code to delete.

**Verify:** `grep -rn "updateSessionHeartbeat\|claimOrRefreshGarageSession\|authService.updateSession\|updateStaffSession\|getDelegateByPhone\|createAsyncLock\|filterApprovedRequests" src server` → nothing. `npm run lint && npm test`.

---

### P2.3 Remove the coupons feature (needs D5 = NO)

No screen uses coupons; the server routes accept any JSON body and write it straight to the database (`{ ...body }`), which is also a safety smell.

**1. Delete the file** `src/services/adminCouponService.ts`.

**2. `src/services/adminService.ts`**
BEFORE:
```ts
import { adminCouponService } from './adminCouponService';
```
→ delete that line. BEFORE:
```ts
  ...adminCouponService,
```
→ delete that line.

**3. `server/garageRoutes.ts` — delete this entire block** (from the comment through the end of the delete route):
```ts
// Admin Coupons Routes
app.post('/api/admin/coupons/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const couponData = { ...body, usedCount: 0, createdAt: new Date() };
    const docRef = await getAdminDb().collection('coupons').add(couponData);
    return c.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error('[Worker Coupons] Error in create:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/admin/coupons/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id, ...data } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await getAdminDb().collection('coupons').doc(id).update(data);
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Coupons] Error in update:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/admin/coupons/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await getAdminDb().collection('coupons').doc(id).delete();
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Coupons] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});
```
**AFTER:** nothing.

**4. `src/types.ts`** — delete this interface only if `grep -rn "Coupon" src server` shows no other use after steps 1–3 (note `adminSubscriberService.ts` also mentions "coupon": read that line first; remove only coupon-specific code):
```ts
export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  isActive: boolean;
  createdAt?: any;
}
```
**5. Tests** — remove only the coupon-related cases in: `src/__tests__/workerParityRoutes.test.ts`, `src/__tests__/workerRouteExtraction.test.ts`, `src/services/adminServiceContract.test.ts`.

**Verify:** `grep -rni "coupon" src server tools` → nothing (or only a comment). `npm run lint && npm test`.

---

### P2.4 Remove retired-route tombstones — owner-approved breaking change

**Owner decision (2026-10-26):** despite inconclusive old-client telemetry, the owner explicitly directed removal. Available telemetry was sampled at 10% and retained for seven days, so it could not establish whether every older installed copy had stopped calling the retired routes. Treat removal as a deliberate breaking change: old copies may receive 404 responses. Do not expand this task to unrelated routes or data.

Removed from the Worker route registry by deleting the handlers:
- Legacy recharge requests and history: `/api/recharge-requests/*`, `/api/transactions/approve-recharge-request`, `/api/transactions/reject-recharge-request`
- Retired owner wallet top-up: `/api/transactions/admin-topup-balance`
- Old time-based trial decision: `/api/garages/trial-decision`
- Retired supervisor create/update/delete endpoints
- Old fair-use extension endpoints
- Legacy garage recharge, self-subscribe and referral-reward endpoints
- Retired `section=requests` handling on delegate dashboard/detail reads; other supported sections remain

**Must remain active:** `/api/garages/:id/credit-grants`, `/api/garages/:id/credit-ledger`, `/api/admin/packages/*` (current credit-bundle catalog), `/api/subscribers/*`, `/api/vehicles/*`, `/api/delegates/*`, `/api/staff/*`. This task must not change prepaid-credit grant/consumption logic, Firebase data, or production settings.

**Tests updated:** removed tests that required tombstone responses; preserved delegate pagination coverage and now assert unsupported `section=requests` is rejected as an invalid section without querying legacy request data. Route inventory expectation updated from 87 to 69 registrations.

**Verification:** GitHub Production Gate must pass typecheck, full test suite, Firestore rules tests, production build, Worker artifact smoke test, maintainability and artifact checks before this task is marked complete. No local tests are claimed. Review the diff for unintended changes and verify the active credit-bundle catalog and prepaid-credit routes remain.

---

### P2.5 Remove screenshot clutter from `docs/` — completed

The generated browser baseline and authenticated smoke-test outputs were removed from the documentation tree: 113 baseline artifacts and 6 smoke-test artifacts (about 1.58 MB). The two existing capture tools now write by default under ignored `tmp/` directories. The existing testing guides were updated to the new output locations; the human-written test guidance and measurement reports remain.

**Verification:** GitHub's full Production Gate passed on the change, including typecheck, full tests, Firestore rules tests, production build, Worker artifact smoke test, maintainability, and production-artifact verification. Deployment jobs were skipped. No application behavior or production data was changed.

---

### P2.6 Refresh retained template files to the current product model — complete by owner direction

The owner approved **retaining and updating**, rather than deleting, `metadata.json` and `firebase-blueprint.json`. This disposition replaces the original deletion proposal for these two files. Do not delete them under P2.6. Any later deletion is a new task requiring owner direction and a reliable tracked-source/configuration reference scan; incomplete or empty code-search results are not proof that files are unused.

1. `.env.example` — remove only the obsolete three-line Gemini example; leave all other environment examples unchanged. **Completed in PR #418.**
2. `metadata.json` — remove the obsolete Gemini capability declaration. **Completed in PR #419.**
3. `firebase-blueprint.json` — refresh it to describe the current product and architecture, and clearly identify it as documentation-only and non-authoritative for production schema, security rules, or data changes. **Completed in PR #419.**
4. **Verification:** PR #418 and PR #419 Production Gates passed. Their separate post-merge workflows (#40267081564 and #40268449931) deployed the reused Worker artifact and passed live smoke checks. No application source, Firestore rules, or stored data changed in these PRs. P4.1 handled the CORS allowlist separately; no CORS change is part of P2.6.

**Phase 2 done when:** P2.1–P2.6 `[x]` (REVIEW items answered by the owner), and `npm run lint && npm test && npm run ci:check` pass. In the report, state: files deleted, lines removed (re-run P0.3 commands).

---
## 8. PHASE 3 — Fix the wiring: the Worker is the only writer

**The contradiction being fixed:** `README.md` and `docs/PROJECT.md` say the Worker owns all writes and the browser must not mutate. But `firestore.rules` still lets the browser write many collections, and the browser code still has a hidden session-write fallback. In the live code the browser makes **no** direct Firestore writes at all (I searched for every `setDoc/addDoc/updateDoc/deleteDoc/writeBatch`; the only remaining ones are the fallback and the dead methods removed in P2.2). So closing these doors should not change what users see.

> **HIGH RISK phase.** Do it on its own branch. Test on the **preview** Firebase project before production. If the UI fixtures smoke test (P3.4) fails, revert the phase and report.

### P3.1 Remove the browser session-write fallback

**File:** `src/services/authSessionService.ts` (inside the function that claims a session, after the Worker validation attempts).

**BEFORE (delete):**
```ts
  if (serverConfirmedInvalid) {
    throw new Error('SESSION_INVALID');
  }

  const entityColl = ENTITY_COLLECTIONS[role];
  const secColl = SECURITY_COLLECTIONS[role];
  const entityDocId = getEntityDocumentId(role, entityId);

  const entityRef = doc(db, entityColl, entityDocId);
  const securitySessionRef = doc(db, secColl, uid);

  await runTransaction(db, async (transaction) => {
    await claimSessionInTransaction(transaction, { entityRef, securitySessionRef, role, sessionId });
  });

  recentClaims.set(claimKey, Date.now());
  notifyWorkerSessionReady();
};
```
**AFTER (replace with):**
```ts
  // The Worker is the only session authority. If it could not confirm the session
  // (offline or server error) fail closed; the browser never writes session records.
  throw new Error(serverConfirmedInvalid ? 'SESSION_INVALID' : 'SESSION_SERVER_UNAVAILABLE');
};
```
Then:
1. Run `grep -rn "SESSION_INVALID" src` and check how callers handle a failed claim. `SESSION_SERVER_UNAVAILABLE` must end in the same "could not sign in" path as any other claim failure (generic error toast / logout). If a caller only handles specific codes and would hang or loop on an unknown one → STOP and report.
2. After the edit `src/domain/auth/sessionTransactions.ts` (`claimSessionInTransaction`, `releaseSessionInTransaction`) should have no production caller. Check with `grep -rn "sessionTransactions\|claimSessionInTransaction\|releaseSessionInTransaction" src`. If only tests remain → delete the file **and** those tests. If the constant `SESSION_TIMEOUT_MS` (defined in that file) is still imported elsewhere, move just that constant to the file that uses it (or to `src/domain/auth/sessionPolicy.ts`) before deleting.
3. Let `npm run lint` list the now-unused imports (`runTransaction`, `doc`, `ENTITY_COLLECTIONS`, `SECURITY_COLLECTIONS`, `getEntityDocumentId`, …) and remove only those.

**Verify:** `npm run lint && npm test`; `npm run ui-fixtures:browser-smoke:garage` (and `:admin`, `:delegate`) — login must still work in all three.

---

### P3.2 Lock `firestore.rules`: the browser can read, but not write

Keep every **read** rule exactly as is. Change only the **write** rules below. (Match by text; whitespace may differ slightly.)

**A) Session collections — 4 blocks** (`admin_sessions`, `delegate_sessions`, `staff_sessions` use `sessionUid`; `garage_sessions` uses `sessionDocId`).
BEFORE (example, `admin_sessions`):
```
      allow create: if false;
      allow update: if isSignedIn() && sessionUid == request.auth.uid && isSessionUpdateValid();
      allow delete: if isSignedIn() && (sessionUid == request.auth.uid || isAdmin());
```
AFTER:
```
      allow create, update, delete: if false; // Server-only: written by the Worker (Admin SDK)
```
(For `garage_sessions` the BEFORE lines use `sessionDocId == request.auth.uid`; same AFTER.)

**B) Retired billing collections** — replace the **whole block** of each:

BEFORE `recharge_requests` (garage could create a "pending" request straight in the database, bypassing the Worker's 410):
```
    match /recharge_requests/{requestId} {
      allow get: if isValidId(requestId) && (
        isAdmin() || isSupervisor() ||
        (isGarageSession(resource.data.garageId)) ||
        (isDelegate() && resource.data.delegateId == getDelegateIdFromSession())
      );
      allow list: if isAdmin() || isSupervisor();
      allow create: if isGarageSession(incoming().garageId) &&
                    incoming().status == 'pending' &&
                    incoming().keys().hasAll(['garageId', 'packageId', 'createdAt']) &&
                    !('amount' in incoming()) &&
                    !('revenueAmount' in incoming());
      allow update, delete: if false; // Server-only
    }
```
AFTER:
```
    match /recharge_requests/{requestId} {
      // Retired billing model: history is kept for the Admin only; nothing can be written from a browser.
      allow read: if isAdmin();
      allow write: if false;
    }
```
BEFORE `referral_rewards` → AFTER:
```
    match /referral_rewards/{rewardId} {
      allow read: if isAdmin();
      allow write: if false; // Retired referral-days model
    }
```
BEFORE `topup_requests` (garage session could create; admin/garage could update) → AFTER:
```
    match /topup_requests/{requestId} {
      allow read: if isAdmin();
      allow write: if false; // Retired wallet top-up model
    }
```
BEFORE `packages` (only the write line changes):
```
      allow create, update: if isAdmin() && isValidPackage(request.resource.data);
      allow delete: if isAdmin();
```
AFTER (package changes go through `/api/admin/packages/*`, which validates `credit_bundle` only):
```
      allow create, update, delete: if false; // Worker only: /api/admin/packages/*
```

**C) Other collections the browser never writes** (change only the write lines):

| Collection | BEFORE (write line) | AFTER |
|---|---|---|
| `garages/{garageId}` | the whole `allow update: if isValidId(garageId) && isSignedIn() && ( … )` expression (admin / owner / session heartbeat / delegate `lastActive`) | `allow update: if false; // Garage documents are written only by the Worker` |
| `staff/{staffId}` | `allow update: if isValidId(staffId) && ( ((isAdmin() \|\| isGarageOwner(existing().garageId)) && isAllowedStaffProfileUpdate()) \|\| (isStaffSession(staffId) && isAllowedHeartbeatUpdate()) );` | `allow update: if false;` |
| `delegates/{delegateId}` | `allow create: if isAdmin() && isValidDelegate(incoming()) && …;` + `allow update: …;` + `allow delete: if isAdmin() && isValidId(delegateId);` | `allow create, update, delete: if false; // Worker only: /api/delegates/*` |
| `settings/{docId}` | `allow write: if isAdmin() && isValidId(docId);` | `allow write: if false;` |
| `system_config/{configId}` | `allow create, update: if isAdmin() && isValidId(configId);` | `allow create, update: if false; // Worker only: /api/admin/update-system-config` |
| `login_requests/{requestId}` (zero uses in app) | the whole block | `match /login_requests/{requestId} { allow read, write: if false; }` |
| `garages/{garageId}/daily_counts/{dateId}` (only the server cleanup touches it) | `allow create: …;` and `allow update: …;` (long conditions) | `allow create, update: if false;` (keep the existing read rules) |

**D) Clean up helper functions** that are now unused. For each name below run a search **inside `firestore.rules`**; if it appears only on its own `function …` line, delete the function: `isSessionUpdateValid`, `isAllowedHeartbeatUpdate`, `isAllowedGarageOwnerUpdate`, `isAllowedStaffProfileUpdate`, `isValidTopupRequest`, `isValidDelegate`. **Keep** `isValidPackage` (still used by the `packages` read rule) and everything `isSupervisor`-related (removing the supervisor role is Phase 6).

---

### P3.3 Close the old wallet read in `admin_settings`

BEFORE:
```
    match /admin_settings/{settingId} {
      allow get: if isSignedIn() && (
        isAdmin() || settingId in ['wallet_number', 'subscription_prices']
      );
      allow write: if false; // Server-only Admin SDK
    }
```
AFTER:
```
    match /admin_settings/{settingId} {
      allow get: if isSignedIn() && isAdmin();
      allow write: if false; // Server-only Admin SDK
    }
```
**Check first:** `grep -rn "admin_settings" src` — the only browser reads should be Admin screens (`adminCoreService.ts` listens to `admin_settings/auth_pin`). If a non-admin screen reads it → STOP and report.

---

### P3.4 Update the rules tests, prove it works, then deploy

1. **Edit `tools/firestore-rules-security.test.mjs`:** every test that expected a browser write to **succeed** in a collection changed in P3.2 must now expect **failure**. Add one `assertFails` write test for each collection in P3.2 B and C. Do not delete read tests.
2. Run `npm run test:rules` (needs Java + the Firebase emulator on the executor's machine). Must pass.
3. Run the three UI fixture smoke tests: `npm run ui-fixtures:browser-smoke:garage`, `…:admin`, `…:delegate`. Must pass.
4. **OWNER ACTION — deploy order:**
   a. Deploy rules to the **preview** Firebase project first (config in `firebase-applet-preview-config.json`; the repo already has a preview deploy workflow). Do the manual walkthrough (P5.2) there.
   b. Only if the walkthrough passes, deploy to production: `firebase deploy --only firestore:rules` (project in `.firebaserc`).
   c. If anything breaks in production, redeploy the previous rules file from git (`git checkout <previous-commit> -- firestore.rules`, then deploy). Write the previous commit hash in the Execution Log **before** deploying.

**Phase 3 done when:** P3.1–P3.4 `[x]`, `npm run lint && npm test && npm run test:rules && npm run ci:check` pass, smoke tests pass.

---

## 9. PHASE 4 — Security and configuration cleanup

### P4.1 CORS allowlist: production origin only — COMPLETED ON MAIN

**File:** `server/cloudflareWorker.ts`, function `isAllowedWorkerOrigin`.
BEFORE:
```ts
  return new Set([
    'https://rq-acg.pages.dev',
    'https://aistudio.google.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ]).has(normalized);
```
AFTER:
```ts
  return new Set(['https://rq-acg.pages.dev']).has(normalized);
```
The Worker already accepts any origin listed in the `ALLOWED_ORIGINS` setting (the line above it), so a custom domain or local development origin is added **there**, not in code. Then: `grep -rn "localhost:5173\|aistudio" src server tools` and update `src/__tests__/corsSecurity.test.ts` expectations (aistudio/localhost are no longer allowed by default). Run `npm run dev` and `npm run ui-fixtures:browser-smoke:garage` to confirm local development still works; if local origins are now blocked, set `ALLOWED_ORIGINS` for local runs (e.g. in the local env file the dev server reads) rather than re-adding them to code.
**Verify:** `npm test` (CORS tests).

---

### P4.2 Remove old PIN formats — COMPLETED ON MAIN (D1 = NO)

COMPLETED: the current `main` verifier accepts only modern unique-salt scrypt; legacy plaintext/shared-salt verification was removed and auth fixtures/tests were updated (Execution Log #14). The snippets below are historical patch context only—do not reapply. The owner confirmed there is no real customer data.

**File:** `server/utils.ts` — function `verifySingleFieldValue`.
BEFORE:
```ts
  // Format 1: Unique-salt $scrypt$... (Modern)
  if (strVal.startsWith('$scrypt$')) {
    if (verifyScryptHash(inputCleanPin, strVal)) {
      return { matches: true, isLegacy: false };
    }
  }

  // Format 2: Old 64-character single-salt hex hash (Legacy)
  if (isHashedPin(strVal)) {
    const inputLegacyHash = legacyHashPin(inputCleanPin);
    if (safeCompare(inputLegacyHash, strVal)) {
      return { matches: true, isLegacy: true };
    }
  }

  // Format 3: Plaintext PIN string (Legacy)
  const cleanStored = cleanPin(strVal);
  if (cleanStored && safeCompare(cleanStored, inputCleanPin)) {
    return { matches: true, isLegacy: true };
  }

  return { matches: false, isLegacy: false };
```
AFTER:
```ts
  // Only the modern per-account-salt scrypt format is accepted.
  if (strVal.startsWith('$scrypt$') && verifyScryptHash(inputCleanPin, strVal)) {
    return { matches: true, isLegacy: false };
  }

  return { matches: false, isLegacy: false };
```
Also delete from `server/utils.ts`:
```ts
const LEGACY_PIN_SALT = 'ark_garage_secure_pin_salt_2026';
```
```ts
// Legacy single-salt hash calculation for backward compatibility
export function legacyHashPin(cleanPinStr: string): string {
  if (!cleanPinStr) return '';
  return crypto.scryptSync(cleanPinStr, LEGACY_PIN_SALT, 32).toString('hex');
}
```
`isHashedPin`: delete only if `grep -rn "isHashedPin" src server` shows no other use. Leave `migratePinToHash` and the `isLegacy` field in place (harmless; cleanup is Phase 6).
**Tests:** find with `grep -rln "legacy\|plaintext\|isLegacy" server src --include=*.test.ts`. Delete only the cases that prove old-format PINs still log in; keep every other login/PIN/rate-limit test.
**Verify:** `npm test`.

> **Not fixed here (owner should know):** the PIN "lookup" hash uses a fixed constant (`PIN_LOOKUP_SALT`) that is visible in the repo, and a PIN of a few digits is easy to guess offline if the database were ever leaked. Fixing it needs a data migration and a design decision, so it is on the post-launch backlog (Phase 6). Mitigations now: keep the repo private (P4.4) and keep the existing PIN rate limiter.

---

### P4.3 Check the Cloudflare Worker plan (OWNER ACTION, D2)

PIN checks use `crypto.scryptSync` (CPU-heavy). Cloudflare's **Free** Workers plan has a very small CPU limit per request. I could not test this.
1. Cloudflare dashboard → Workers & Pages → `rq` → check the plan and the **Metrics / Errors** (look for "exceeded CPU" or error code 1102).
2. Log in with a PIN 20 times (garage, staff, admin, delegate).
3. If errors appear and the plan is Free → switch the account to **Workers Paid** (about $5/month at the time of writing; check current price). No code change is needed.
Record the result in the Execution Log.

### P4.4 Make the repo private and rotate secrets (OWNER ACTION)

1. GitHub → repo `RQ-` → Settings → General → Danger Zone → **Change visibility → Private**. (If Cloudflare Pages stops deploying, re-authorise its GitHub connection.)
2. Three different AI tools have had access to this project while it was built. At launch, **replace** the secrets: create a **new** Firebase service-account key and delete the old one (Google Cloud → IAM → Service Accounts → Keys); set a **new** random `BACKEND_OPERATOR_TOKEN`; update both in Cloudflare (`wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON`, `wrangler secret put BACKEND_OPERATOR_TOKEN`). Never paste secrets into a chat with an AI.
3. Confirm no `.env` file or key file is tracked: `git ls-files | grep -i -E "\.env|serviceAccount|private"` → only `.env.example`.

---

## 10. PHASE 5 — Prove it works, then launch gradually

### P5.1 Full validation (executor)
```bash
npm ci
npm run lint
npm test
npm run test:rules
npm run ci:check
git diff --check
```
All must pass. Paste the totals (tests passed/failed) in the log.

### P5.2 Manual walkthrough (OWNER with the executor's checklist — preview project unavailable)

The previously configured preview Firebase project was deleted (Execution Log #12). Do not assume a preview environment exists. Before any live walkthrough, ask the owner to confirm whether to use the production project with synthetic test accounts/data; never use real customer data or run destructive tests.
Everything must look and behave **exactly as before** (Arabic, RTL, same screens).
- **Garage owner:** log in with PIN → check a car **in** → see it in "inside" list → check it **out** (credits drop correctly) → open today's report → add / renew a monthly subscriber → open credit history.
- **Staff:** log in → check in / out → cannot reach owner-only screens.
- **Admin:** log in → create a garage → grant credits (credit grant) → view the credit ledger → **add a package** and **add/remove an announcement** (see note in P2.2e) → edit system settings → view reports.
- **Delegate:** log in → dashboard loads with garages → wait 2–3 minutes: it refreshes by itself (new 120-second rhythm) → commission screen.
- **Second device:** log into the same garage on a second phone → the first phone is signed out immediately (not after 15 minutes).
- Leave a garage screen open for 30 minutes: still logged in, nothing breaks.
Record pass/fail per line in the Execution Log.

### P5.3 Launch checks (OWNER ACTION)
- Firestore **indexes** deployed: `firebase deploy --only firestore:indexes` (the app has a slower fallback if an index is missing).
- Firestore **rules** deployed (P3.4).
- Cloudflare Pages build variable `VITE_BACKEND_API_URL` points at the Worker; Worker `ALLOWED_ORIGINS` contains your real site address (and any custom domain, **exactly**, with `https://`).
- Read `docs/OPERATIONS.md` (rollback + backup). Note: the free Firebase plan has no scheduled backups; decide how you will export data once you are on the paid plan.
- Keep the previous working commit hash written down for rollback.

### P5.4 Staged pilot (OWNER + executor)
| Stage | Garages | Duration | Go to next stage only if |
|---|---|---|---|
| 1 | 1 | 3 days | no errors reported; Firestore peak **writes < 12,000/day** and **reads < 30,000/day** (60% of the free limits) |
| 2 | 3 | 3 days | same thresholds, scaled (see Appendix A) |
| 3 | 7–9 | ongoing | same; **switch to the paid Firebase plan before you reach 70% of any limit, and before garage #10** |

On the paid plan (called "Blaze") you still get the same free daily amounts; you simply are not cut off when you pass them. Set the budget alert (P1.4).
**If reads are too high at stage 1** (contingency, not done unless needed): the "today's transactions" live listener in `src/hooks/useGarageSync.ts` loads up to 200 records every time a device opens; the fix is to attach it only when the daily-report screen is open. Report numbers to the owner first; do not change it blindly.

---

## 11. PHASE 6 — Post-launch backlog (**do NOT do before launch**)

These are real improvements but they are risky or large, and the app works without them.
1. Split the largest files (`server/cloudflareWorker.ts` 1,542 lines; `server/garageRoutes.ts` 1,446; `server/vehicleRoutes.ts` 926; `src/components/garage/SubscribersView.tsx` 673) into smaller modules. Tests exist; do it one file at a time.
2. Rename the "Recharge…" components/labels that now mean "credit" (`RechargeHistoryView`, `RechargeNotificationModal`, `GarageSubscriptionCard`, …). Naming only; UI text stays.
3. Remove the retired **supervisor** role completely (types, rules, `supervisor_sessions`, `isSupervisor()`).
4. Remove `migratePinToHash` and the `isLegacy` plumbing after P4.2.
5. Fix the PIN lookup design (fixed salt; PIN identifies the account) — needs an owner design decision and data migration.
6. For 1,000 garages: server-paginate every Admin list; replace the 200-record live listeners with paged Worker reads; re-measure cost per garage before raising prices or volume.
7. Decide D3 (24-hour session ending even when active) and fix the heartbeat if tablets must stay logged in longer.
8. Tooling trim: decide which of `tools/*benchmark*` and `tools/ten-garage-*` are worth keeping.

---

## Appendix A — Free-plan budget (my estimate; verify the limits on Firebase's pricing page)

Assumptions: free plan ≈ **20,000 writes/day** and **50,000 reads/day**; 9 garages; 2 devices per garage; devices visible 12 h/day; one car = check-in (≈6 writes) + check-out (≈5.5 writes) ≈ **11.5 writes**.

| Item | Before this plan | After this plan |
|---|---|---|
| Heartbeat writes per device (12 h visible) | every 5 min → 144 beats × 3 writes = **432** | every 15 min → 48 beats × 3 writes = **144** |
| Heartbeat writes, 18 devices | **7,776** | **2,592** |
| Left for cars (20,000 − heartbeats) | 12,224 | 17,408 |
| Cars per day, **all garages** | ≈ 1,060 | ≈ 1,510 |
| Cars per garage per day (÷9) | ≈ **118** | ≈ **168** |
| …with a 30% safety margin | ≈ 83 | ≈ **118** |
| Delegate tab open 12 h | 2,880 polls (×(1 + page of garages) reads) | 360 polls |

So the free plan comfortably fits **small garages (up to ~100 cars/day each)** for 7–9 garages; a busy garage (300+ cars/day) needs the paid plan almost immediately. Reads from live listeners (vehicles inside, today's records, subscribers) are **not** counted above; measure them in the pilot.

## Appendix B — How the dead-code list was produced (so it can be re-checked)
1. Import graph from `src/main.tsx` and `server/cloudflareWorker.ts` (static `import`, `export … from`, dynamic `import()`); files not reachable from either were listed, then checked for references from tests, tools, `server.ts`.
2. For every exported function/service method in `src/services`, `src/hooks`, `src/utils`, `src/domain`: counted whole-word uses in non-test source (excluding its own definition). Zero → "dead"; zero in production but present in tests → "REVIEW".
3. Retired API routes: listed every `app.get/post` in `server/`, read each handler; `grep` of `src/` for each retired path found no caller.
4. Rules vs. code: listed every `allow create|update|delete|write` in `firestore.rules`, then searched `src/` for every browser Firestore write call.
Limits: dynamic string-built names would be missed; that is why every deletion has a `grep` check, a lint run and the full test suite.

---

## 12. Execution Log (every executor appends one row per task — do not leave blank when done)

| # | Date | Task ID | What was done (1–2 lines) | Files changed (+/−) | Commands run and result | Commit | Problems / questions for owner |
|---|------|---------|---------------------------|---------------------|-------------------------|--------|-------------------------------|
| 1 | 2026-10-25 | P0.4 | Recorded owner decisions: no real customer data; Cloudflare billing tier unknown because Billing Read is not authorized; keep current session behavior pending pilot feedback; investigate old billing endpoint callers before removing 410 compatibility routes; remove coupons. | plan updated | Cloudflare account and Worker list read successfully; subscription query returned 403 due missing Billing Read permission | pending | Need authorized billing visibility for D2; do not remove legacy billing tombstones until caller safety is established. |
| 2 | 2026-10-25 | P0.1/P0.2 | Baseline application validation and exact CI command verified. | workflow only | Run #40188951017 passed baseline Production Gate steps on app source commit `0f2b3759379a22f04572cd192474cc77e018873a`; run #40198933303 then passed exact `npm run ci:check` on PR #391. | 8e5cd17 | Application source unchanged; no production deployment was performed by this verification. |
| 3 | 2026-10-25 | P0.3 | Recorded measured source/test/file counts and documented the original `find` precedence issue. | workflow + plan updated | Run #40198933303: corrected non-test TS/TSX lines 30,526; test-file lines 19,309; tracked files 498; broad find excluding `node_modules` 595. The plan's ungrouped expression returned 41,545 and is not a valid non-test count. | 8e5cd17 | Use tracked files and corrected grouped source count as the baseline. |
| 4 | 2026-10-25 | P0.2/P0.3 | Phase 0 baseline evidence consolidated in canonical plan; marked Phase 0 complete. | `docs/UI_PERFORMANCE_PLAN.md` updated | Exact `npm run ci:check` passed; all baseline metrics recorded from workflow run #40198933303. | pending | Temporary verification workflow was removed in PR #394 (`a4b68ac`); no application code changed. | |
| 5 | 2026-10-25 | P1.1 | Reduced session heartbeat from 5 to 15 minutes and changed the visible-tab resume threshold to 10 minutes; updated the interval regression test. | `src/hooks/useGarageSession.ts`, `src/hooks/useGarageSession.test.tsx` | Production Gate run #40199945696 passed (typecheck, full suite, build/artifact checks); PR #395 merged to `main`. | ff70579 | No owner action needed for this task; no production deployment. |
| 6 | 2026-10-25 | P1.2 | Reduced delegate dashboard polling from 15 seconds to 120 seconds, paused periodic polling while the document is hidden, and added regression coverage for interval and visibility behavior. | `src/hooks/useGarageSync.ts`, `src/hooks/useGarageSync.test.tsx` | Production Gate run #40200933260 passed (typecheck, full suite, Firestore rules, production build and artifact checks); PR #397 merged to `main`. Deploy jobs skipped; no production deployment. | 5dcf0d4 | No owner action needed for this task; no production deployment. |
| 7 | 2026-10-25 | P1.3 | Removed the unused `subscribeToGarages` and `subscribeToDelegateGarages` methods and their now-unused imports; removed the obsolete test that only exercised the deleted delegate listener. | `src/services/garageService.ts`, `src/__tests__/delegateScopeIsolation.test.ts` (deleted) | Production Gate run #40201555729 passed; PR #399 merged to `main` as `e466f2a073ed0b6e8ebe9a3c0b302adeda28b351`. Deployment jobs skipped; no production deployment. | caffcff | No owner action needed for code cleanup; usage monitoring setup is the next owner action. |
| 8 | 2026-10-25 | P2.1 | Removed audit-listed dead files and only the obsolete tests/imports that depended on deleted code. The first run caught two unused imports; they were removed and the corrected commit passed the full Production Gate. | 11 files deleted; 2 test files adjusted | Initial run #40207028434 failed typecheck on unused `act` and `SystemConfig`; corrected commit passed Production Gate run #40207192163. PR #401 merged to `main` as `2af758a73db7eca5d03461a3d7aa43d13fe44bb9`; deployment jobs skipped. | 7dde9ad | No production deployment. P1.4 Firebase Usage monitoring owner action remains pending. |
| 9 | 2026-10-25 | P2.2 | Removed the plan-listed unused session/auth/garage/delegate/utility helpers from their defining modules. Left all review-only methods—including `releaseDelegateSession`, announcement methods and package methods—untouched. | 6 source files updated; no UI, financial transaction, or production deployment changes intended | First run #40209265263 was cancelled after follow-up import cleanup; final Production Gate run #40209268959 passed, including TypeScript, full tests, Firestore rules tests, production build and artifact checks. PR #403 merged to `main` as `210b54b5e83ef944c4471bdad8485a23b4ccddbe`; deployment jobs skipped. | 098c68e | P1.4 Firebase Usage monitoring owner action remains pending. GitHub code search was incomplete, so passing typecheck/tests were used as merge gate; do not treat the search command as independently verified. |
| 10 | 2026-10-25 | P3.1 | Removed the browser Firestore session-claim fallback and its transaction helpers; moved the retained session timeout constant to session policy; outage and invalid-session paths now fail closed. | `src/services/authSessionService.ts`, `src/services/authSessionService.test.ts`, `src/domain/auth/sessionPolicy.ts`; 2 helper files deleted | `npm run lint` passed; focused Vitest run passed: 3 files, 20 tests; `git diff --check` passed. | 38d7439 | No UI or business-rule changes. Rules remain to be hardened and deployed in P3.2–P3.4. |
| 11 | 2026-10-25 | P3.2/P3.3 | Locked the browser Firestore surface to reads plus Worker/Admin SDK writes, retired legacy billing writes, removed the old wallet settings read for non-admins, and deleted helpers proven unused by the new rules. | `firestore.rules`, `tools/firestore-rules-security.test.mjs` | `npm run test:rules` passed; emulator matrix passed after updating expected browser writes and seeding the valid server-owned package fixture; `git diff --check` passed. | 4bcca03 | P3.4 remains: preview walkthrough, then production rules deploy, then full UI/CI validation. |
| 12 | 2026-10-25 | P3.4 | Full production gate passed. Preview project was deleted, so the owner authorized the documented direct production path. Rules were released to the exact named production database and verified by live read-back. | `firestore.rules` | `npm run ci:check` passed all checks. `npx firebase-tools deploy --only firestore:rules --project gen-lang-client-0091669619 --config firebase.json --non-interactive` succeeded; database list confirmed `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`; live rules show server-only session, garage, staff, package, and vehicle mutations. | pending | Proceed with the Cloudflare Pages/Worker release after the verified commits are merged to `main`. |
| 13 | 2026-10-25 | P4.1 | Removed hard-coded AI Studio and localhost CORS fallback origins; the production Pages origin remains the only built-in default, while `ALLOWED_ORIGINS` remains the explicit override for authorized environments. | `server/cloudflareWorker.ts`, `src/__tests__/corsSecurity.test.ts` | Focused CORS suite: 3/3 passed. Source audit found no hard-coded `localhost:5173` or `aistudio` in production source. `npm run ui-fixtures:browser-smoke:garage` passed against Auth/Firestore emulators; authenticated garage dashboard marker and 7 Firestore listeners verified. | pending | Run full `npm run ci:check`, then merge through the normal Production Gate/Cloudflare workflow. |
| 14 | 2026-10-25 | P4.2 | Removed plaintext and shared-salt PIN acceptance from `server/utils.ts`; modern unique-salt scrypt verification remains unchanged. Deleted only tests that required obsolete legacy acceptance and migrated remaining auth fixtures to modern hashes. | `server/utils.ts`, `src/__tests__/serverAuthHardening.test.ts`, `src/__tests__/workerPinRateLimiter.test.ts` | Focused PIN suite: 21/21 passed. Full suite: 138 files / 893 tests passed. No production database migration was run; this is safe under recorded D1 = NO (pre-launch test data only). | pending | Run full `npm run ci:check`, then merge through the normal Production Gate/Cloudflare workflow. |
| 15 | 2026-10-25 | P1.4 | Checked session access for the Firebase Usage and Cloud Billing owner action; no Google Cloud CLI authentication or connector was available, so the console-only action remains blocked. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only integration check; no Firebase or Cloud Billing settings changed. | 67d2e48 | PR #411 merged; owner still needs to bookmark Firestore Usage and set the budget alert after moving to the paid plan. |
| 16 | 2026-10-25 | P2.4 | Searched current client source and Cloudflare production Worker telemetry for retired billing/trial/supervisor routes. No sampled calls matched during the retained seven-day window; tombstones were preserved. | `docs/UI_PERFORMANCE_PLAN.md` updated; routes unchanged | Read-only aggregate queries only; logs use 10% sampling and seven-day retention. PR #412's Production Gate passed. | f26b3dc | PR #412 merged; evidence cannot rule out older clients or requests outside the retained window. |

| 17 | 2026-10-25 | P2.5 | Removed generated browser-baseline and authenticated-smoke output from `docs/`, redirected the capture tools to ignored temporary folders, and updated their testing guides. | 119 generated artifacts deleted; `.gitignore`, 2 capture tools, 2 testing guides updated | GitHub Production Gate passed: typecheck, full test suite, Firestore rules tests, production build, Worker artifact smoke, maintainability, and production-artifact checks. The PR gate's deploy jobs were skipped; separate post-merge automation nevertheless deployed the Worker artifact and passed live smoke. A local `git diff --check` was unavailable because no local checkout exists in this session. | f82b40c | The Worker deployment was not requested and was triggered by repository automation. No rollback or further production changes were made. Remote `main` was verified; no local checkout was available to synchronize. |
| 18 | 2026-10-26 | Continuity protocol | Made durable progress updates mandatory for every project session, clarified that `tokens ending` adds a handoff rather than initiating continuity, and changed the start prompt to resume from the current plan instead of Phase 0. | `AGENTS.md`, `docs/UI_PERFORMANCE_PLAN.md` | `git diff --check` and `npm run ci:check` passed locally; no application source was changed. | N/A — process-rule update | Documentation-only; no application code or deployment workflow changed. |

| 23 | 2026-10-26 | P4.3 | Read-only Cloudflare check confirmed `rq` and `rq-hono-preview` both report `usage_model: standard`; this is not evidence of Free/Paid account subscription or CPU usage. Billing usage endpoint returned HTTP 403 due missing Billing Read scope. | `docs/UI_PERFORMANCE_PLAN.md` updated | GET usage-model succeeded for both scripts; GET account billing usage blocked by permission. No Cloudflare settings changed. | recorded | Owner must check subscription/CPU in dashboard or provide a Cloudflare connection with Billing Read. P4.4 remains owner-only; then Phase 5 validation. |

## 13. Owner Q&A / decisions log (executor asks, owner answers; keep a record)

**Open questions from the current code audit (not yet final; more audit work remains):**

| ID | Question for the owner | Why it matters |
|---|---|---|
| AQ1 | Should `cashCollectedTotal` include prepaid-credit purchase payments? Separately, should `companyNetRevenue` recognize paid credits when purchased or only when paid credits are consumed? If recognized on consumption, should only paid-bucket entries count as revenue (not referral/trial credits), with commissions/refunds handled separately? | The current report only totals legacy recharge/wallet events for cash/net revenue; it tracks paid-credit payments and consumption separately but does not connect them to the headline totals. |
| AQ2 | Should financial report start/end filters use Cairo-local calendar days, and should the selected end date be inclusive? | Current API uses UTC midnight and an exclusive end boundary; this can omit early Cairo-day transactions if the caller supplies ordinary date-picker dates. |
| AQ3 | Should a subscriber be active only when `startDate <= Cairo today <= endDate`, with the end date valid for the whole Cairo calendar day? Should missing/invalid dates be treated as invalid/expired, and should counts refresh automatically as dates pass? | Some paths ignore `startDate`, parse date-only end dates as UTC instants, treat invalid/missing end dates as active, and trust maintained counters indefinitely unless a mutation marks them stale. |
| AQ4 | Is the old garage `todayCount` / API `dailyCount` still displayed or needed? If yes, should it count actual entries today; if not, may we retire it and rely on maintained daily stats? | The old field is set to 1 on each check-in, and daily revenue can carry over from yesterday. |
| AQ5 | What information should a delegate be allowed to see for garages they referred/created: basic garage/referral summary only, garage contact/credit-balance fields, individual vehicle plates/status, and/or subscriber names, phones, notes, and dates? | The delegate dashboard API returns nearly the full garage document except PIN fields, and Firestore rules allow direct reads of garage, vehicle, and subscriber documents. |
| AQ6 | Do you want a financial report visible and usable in the Admin screen? If yes, keep and wire it correctly; if not, retire the unused service/route after final caller checks. If kept, should `currentUnsettledByDelegate` mean all outstanding commissions as of the end date or only commissions earned during the selected period? | A service exists but no production screen caller was found; its field names/formulas need a clear contract. |
| AQ7 | Do you authorize making the GitHub repository private and reviewing/rotating any credentials that may have appeared in public history? Separately, should we prioritize redesigning the fixed-salt PIN lookup hash before launch? | The repo is public and the lookup salt is in source; these are separate security tasks. |
| AQ8 | Can you check the Cloudflare dashboard for the `rq` Worker plan and CPU/errors, including repeated PIN login tests, or provide a connection with Billing Read access? | Current connection cannot verify Free/Paid status or billing usage. |
| AQ9 | Can you check Firestore Usage and configure a budget/usage alert, or provide authorized access so the launch budget can be verified? | Owner-only quota/cost check remains unverified. |
| AQ10 | Since the preview Firebase project was deleted, do you want the final manual walkthrough run against the existing production project using synthetic test accounts/data? | Automated tests do not prove all four roles and end-to-end money/credit flows work live. |
| AQ11 | Should active monthly subscriber vehicles be allowed to check in/out without consuming a regular credit? | The only inspected check-in route rejects active subscribers and no separate subscriber vehicle flow was found. |
| AQ12 | What are the intended subscriber pricing/duration rules? Currently adding a subscriber costs zero credits, while every renewal costs five paid credits regardless of whether the duration is one week, two weeks, or one month. Should the weekly/biweekly/monthly choices remain? | The product contract describes monthly subscribers with no separate subscriber charge, while renewal currently debits paid credits. |
| AQ13 | Should the remaining credit-bundle template catalog stay in the backend while the Packages tab stays removed, or should we remove the template path too? | Credit grants work with a direct amount, but the optional template path remains. |
| AQ14 | Should "Today's revenue" mean gross vehicle checkout charges, or net revenue after refunds? | The garage report currently uses different formulas for the fresh-summary and fallback paths. |
| AQ15 | Should the investment calculator use the approved fixed 100 EGP one-time delegate commission per garage, rather than a percentage of revenue? Are the defaults of 2 new garages/month, 400 credits/garage/month, 5,000 EGP operating costs, and 25% investor ownership approved estimates? | The calculator's assumptions currently do not match the approved commission rule and may be mistaken for actual forecasts. |
| AQ16 | Do you want to manage announcements from the Admin dashboard? If yes, should we restore a management screen; if no, may we remove the uncalled create/delete/toggle methods and routes while keeping announcements visible to garages? | The Admin announcements tab redirects to settings, and the mutation methods have no visible management screen caller. |
| AQ17 | Is your current Admin PIN still eight digits? We should make new PIN creation five digits and constrain login to valid formats, but keep eight-digit login temporarily if needed until you successfully change the existing Admin PIN, to avoid locking you out. | New PIN creation currently conflicts with server validation, and the shared login screen allows lengths the server rejects. |
| AQ18 | Do you still need the legacy/offline vehicle fallback when `entryTime` is missing, or may we remove the unreachable client branch and treat missing server entry time as invalid/zero-cost? | The fallback is dead code and does not work as its comment claims. |
| AQ19 | Should the server allow only approved subscriber durations and require extensions through renewal? If multiple durations are allowed, should the renewal cost vary by duration or always be 5 paid credits? | Current API accepts arbitrary date ranges; editing dates bypasses the renewal debit, and renewals can request much longer periods for the same fixed five-credit cost. |
| AQ20 | Is there an automated Firestore backup/export plan, and has restoring from it been tested? If not, should we set this up before any real customer data is entered? | No backup/restore configuration is represented in the repo; the Cloud/Firebase console configuration is not visible to this audit. |
| AQ21 | Do you still need the `rq-hono-preview` Worker? The preview Firebase project was deleted and no preview Worker config is in the repo. If you are unsure, can we inspect its bindings/traffic before deciding? | It may be a useful preview environment or an orphaned resource; deleting it without checking could break an external workflow. |
| AQ23 | Should check-out be blocked unless an active vehicle has a valid entry timestamp? | Missing/invalid timestamps currently permit a zero-cost exit, while `null` may be interpreted as the Unix epoch and produce an enormous charge. |
| AQ24 | Should staff logged into a garage be allowed to view that garage's credit ledger and balance history, or should it be limited to the Admin and garage owner? | The API currently authorizes same-garage staff to read credit ledger entries, despite the route comment describing Admin/owner access. |
| AQ25 | If the garage's `createdByDelegateId` and `referrerId` point to different delegates, who should receive the one-time 100 EGP commission on the first paid credit grant? | The current transaction awards it only to `createdByDelegateId`; the written product contract does not clarify this conflict case. |
| AQ26 | Should the garage's credit-recharge history show only the latest 50 paid grants, or should the user be able to load older entries too? | The current history view requests 50 entries and has no pagination or warning that older records are omitted. |
| AQ27 | Should a documentation-only change to the plan file trigger a production frontend deployment, or should Cloudflare Pages deploy only when application/build/config files change? | The Pages project currently includes all paths and excludes none; documentation-only main commits trigger production builds. |
| AQ28 | When Admin adds prepaid credits after confirming payment, should the garage owner/staff receive the existing recharge notification? | The current notification watches legacy recharge logs/fields, while the new credit-grant route writes `credit_grant` and the credit ledger only. |
| AQ29 | May I make the daily transaction query use true `Africa/Cairo` day boundaries (including DST) instead of a fixed `+02:00` offset? | The fixed offset can omit the first hour of Cairo-local days while DST is active. |
| AQ30 | Should the unused Admin summary endpoint be removed, or should we retain it and define/correct what counts as an active garage? | Its maintained counter increments every new garage as active, and its fallback ignores pending status; no current UI caller was found in the inspected paths. |
| AQ31 | If hourly/overnight rates change while a vehicle is parked, should the bill use the rate at check-in or the rate at check-out? | The vehicle record does not store rate-at-entry; the server uses current garage rates at checkout. |
| AQ32 | Should the server enforce the five-minute correction window, who may issue cash refunds, and should refunding an exited vehicle also restore its entry credit? | The API can delete an exited vehicle after the UI's five-minute window, restore its prepaid entry credit regardless of status, and also refund checkout revenue. |
| AQ33 | May we remove the write-only global `delegateMonthlyCommission`, `referralFeePerRenewal`, and maintenance settings, leaving only active system-config fields? | The read endpoint returns only `adminColor`; these other accepted fields have no active consumer found and some contradict the current fixed commission model. |
| AQ34 | After a final call-site check, may we delete the unused `addActivityLog` client helper and the route that always returns 403? | Current activity events are server-generated, and the reviewed frontend flows do not call the helper. |
| AQ35 | Which credit bucket should be consumed first: trial, referral, or paid? | The current order is paid → referral → trial, so paid credits are consumed while free credits remain. |
| AQ36 | Are paid prepaid-credit purchases non-refundable, or should Admin be able to refund unused paid credits in cash? | There is no paid-credit purchase refund route/event; only checkout refunds and entry-credit correction restores exist. |
| AQ37 | Is the referral reward exactly 20 credits for the referring garage after the referred garage's first confirmed paid credit grant? | The amount is hard-coded in code but not written into the current product contract. |
| AQ38 | May I add bounded retries for Firestore transaction conflicts, so simultaneous check-ins/credit operations retry instead of failing? | The production REST adapter runs each transaction callback and commit only once; the adapter has no conflict-retry test. |
| AQ39 | May I fix the Firestore adapter so `.update()` fails for a missing document while `.set(..., { merge: true })` can still create it? | Both operations currently use the same REST write path without an existence precondition, which can create incomplete records where the Admin SDK would return not-found. |
| AQ40 | Should the Admin delegate-finance screen be rebuilt to count current prepaid-credit payments and show true net revenue (including negative margins), instead of legacy recharge totals? | The current screen queries `actionType === 'recharge'`, while the active grant flow writes `credit_grant`/prepaid-credit events; the net card clamps losses to zero. |
| AQ41 | May I fix delegate dashboard polling so it removes deleted/unlinked garages from the visible list rather than only adding/updating rows? | Polling merges the new first page into previous state and never removes rows absent from the response. |
| AQ42 | Should the retired Supervisor role be removed from remaining frontend UI/types and PIN-availability checks? | The backend rejects Supervisor login, but frontend branches and PIN lookup still retain it. |
| AQ43 | Should each payment reference be unique across paid credit grants, preventing accidental duplicate grants from the same receipt? | The server requires a reference but does not reject an existing reference when a different idempotency key is used. |
| AQ44 | Should locking/suspending a garage immediately block all scoped API actions and revoke existing sessions? | The UI shows a lock overlay, but the backend authorization path does not check `isLocked`/`isSuspended` or invalidate sessions when they change. |
| AQ45 | Do staff need granular permissions? If yes, which actions should be restricted; if not, may I remove the stored but unenforced permission/role fields? | The API stores `permissions`, but server authorization ignores them and no active configuration UI was found. |
| AQ46 | Should a delegate settlement require a payment method and receipt/reference, or is recording the settled amount/date enough? | Settlement records currently lack proof/reference fields for the manual payment. |



| Date | Question from executor | Owner's answer |
|------|------------------------|----------------|
| 2026-10-25 | Does production Firebase have real customer data? | No, there is no real customer data. |
| 2026-10-25 | Which Cloudflare Worker plan is active? | Owner does not know; authorized Cloudflare connection could list Worker scripts but subscription details returned 403 due missing Billing Read scope. |
| 2026-10-25 | Should garage tablets remain logged in beyond 24 hours? | Owner did not understand the technical distinction; keep existing behavior for now and reassess from pilot evidence. |
| 2026-10-25 | Are old app copies still calling retired billing endpoints? | Owner initially believed they may be; on 2026-10-26 explicitly directed removal despite inconclusive telemetry, accepting that old copies may receive 404s. |
| 2026-10-25 | Should discount coupons exist? | No; remove the unused coupon feature as proposed. |

## 14. Final sign-off (fill in at the very end)

- Phases 0–5 all `[x]` or `[-]` with reasons: ☐
- Lint / tests / rules tests / ci:check all green on the final commit: ☐ (commit: ________)
- Manual walkthrough passed on production: ☐
- Repo private + secrets rotated: ☐
- Pilot stage reached: ____ garages · peak writes/day: ____ · peak reads/day: ____
- Executor's closing note (what was NOT done and why):

| 19 | 2026-10-26 | P2.6 | Removed the obsolete Gemini API key example from `.env.example`. Initially retained both JSON files because a reliable repository-wide reference scan could not be completed. | `.env.example`, `docs/UI_PERFORMANCE_PLAN.md` updated | GitHub code-search responses were incomplete; they were not treated as proof that the files were unused. PR #418's post-merge workflow #40267081564 deployed the reused Worker artifact and passed live smoke checks. | b51c1009 | Owner subsequently directed that both JSON files be updated rather than deleted; see log entry 20. |
| 20 | 2026-10-26 | P2.6 | Per owner direction, updated `metadata.json` to remove the obsolete Gemini capability declaration and refreshed `firebase-blueprint.json` to describe the current Cloudflare Worker + Firebase architecture, prepaid-credit model, active concepts, and authoritative sources. The blueprint explicitly states it is documentation-only and must not drive production schema changes. | `metadata.json`, `firebase-blueprint.json`, `docs/UI_PERFORMANCE_PLAN.md` | PR #419 merged. Production Gate run #40267974321 passed: typecheck, full test suite, Firestore rules tests, production build, Worker artifact smoke, maintainability, and production-artifact checks. The PR's deploy jobs were skipped; separate post-merge workflow #40268449931 deployed the reused Worker artifact and passed live smoke checks. No application source, Firestore rules, or stored data changed. | 3739700 | P2.6 complete by owner-approved disposition; no repository-wide reference scan was required because both files were retained and updated rather than deleted. P1.4 and P2.4 remain blockers to Phase 2 completion. |
| 21 | 2026-10-26 | P2.4 | Owner explicitly directed removal of retired billing/trial/supervisor route tombstones despite inconclusive old-client telemetry. Removed only retired handlers and their obsolete tests; retained delegate pagination coverage and changed unsupported request sections to the standard invalid-section response. Updated route inventory from 87 to 69. | `server/financialRoutes.ts`, `server/garageRoutes.ts`, `server/readRoutes.ts`, related Worker tests | PR #422 merged as `6046868d012da731e5cee8d1e47e418ffb550b5e`. Production Gate run #40272536511 passed typecheck, full tests, Firestore rules emulator tests, production build, Worker artifact smoke, maintainability, and artifact verification. Deploy jobs skipped; no deployment claimed. | 6046868 | Old installed clients may receive 404s from the deliberately removed routes; telemetry was inconclusive. Active prepaid-credit routes/catalog were preserved. |


| 22 | 2026-10-26 | P2.4 verification | Reconciled the plan with the merged PR and completed Production Gate. | `docs/UI_PERFORMANCE_PLAN.md` | Run #40272536511 passed all required verification steps. Deployment jobs were skipped, so this entry does not claim a production deployment. | pending | Next eligible planned task is P4.3 (owner-only Cloudflare plan/CPU check) or P4.4 (owner-only repository privacy/secrets rotation); Phase 2 is not fully complete because P1.4 remains blocked. |
| 37 | 2026-10-26 | Production code audit — lock enforcement, staff permissions, and settlement evidence | Traced Admin garage lock UI against Worker auth resolution and staff CRUD authorization; lock/suspend flags are not enforced by request authorization, and staff permission fields are stored but ignored. Confirmed settlement records have no payment reference/method. Added A44–A46 and AQ44–AQ46. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Continue reviewing the final route/test matrix and deployment evidence before the complete questionnaire. |
| 36 | 2026-10-26 | Production code audit — delegate finance and remaining account/data flows | Traced Admin delegate details to legacy recharge queries, delegate dashboard polling state, retired Supervisor references, and paid-grant reference validation. Added A40–A43 and AQ40–AQ43; clarified AQ19 to include fixed renewal cost regardless of accepted date range. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Continue the audit of remaining financial flows and launch evidence before finalizing the consolidated questionnaire. |
| 35 | 2026-10-26 | Production Firestore adapter audit | Reviewed the production Worker adapter and its tests. Confirmed no transaction conflict retry and that strict `update()` shares the same REST write mode as merge-set without an existence precondition. Added provisional findings A38–A39 and questions AQ38–AQ39. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Continue auditing remaining server-adapter semantics and app flows before finalizing the questionnaire. |
| 34 | 2026-10-26 | Production code audit — credit policy, delegate sanitization, and retired config | Refined delegate data-exposure finding to include raw `/api/garages` responses; traced delete/refund flow and confirmed it can restore the prepaid entry credit regardless of vehicle status while also refunding checkout revenue. Confirmed paid→referral→trial debit priority, hard-coded 20-credit referral award, write-only system-config fields, and an activity-log helper whose route always returns 403. Added A33–A37 and AQ33–AQ37. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue reviewing remaining feature wiring and final launch evidence before finalizing the consolidated questionnaire. |
| 33 | 2026-10-26 | Production code audit — rate snapshots and server-side correction/refund policy | Traced vehicle entry/exit and delete/refund routes. Rates are not snapshotted at entry; the correction window is UI-only; the API accepts a caller-supplied refund amount for eligible exited vehicles without a separate role approval. Added provisional findings A31–A32 and questions AQ31–AQ32. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue checking the remaining vehicle/credit and role paths before finalizing the questionnaire. |
| 32 | 2026-10-26 | Production code audit — subscriber counters, daily boundaries, and unused summary routes | Traced subscriber add/renew/update and read-summary logic: future start dates and naturally expiring records are not consistently reflected in active counters. Confirmed `vehicleService.getCairoDayStartTimestamp` hard-codes `+02:00`, and found an unused Admin summary helper whose active count treats pending garages as active. Expanded A3/AQ3 and A6; added A29–A30 and AQ29–AQ30. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue reviewing the remaining financial and operational flows before finalizing the questionnaire. |
| 31 | 2026-10-26 | Production code audit — recharge notification wiring | Traced `useGarageDashboardLiveData` → `subscribeToGarageRechargeLogs` → `GarageDashboardView` notification handling and compared it with the current credit-grant route. New paid grants are recorded as `credit_grant`/ledger entries but are not included in the legacy recharge listener or fallback fields. Added provisional finding A28 and owner question AQ28. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no app code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue checking other active UI/backend flows and deployment verification before finalizing the questionnaire. |
| 30 | 2026-10-26 | Production deployment wiring audit | Read Cloudflare Pages project and deployment metadata. Confirmed `rq` production Pages is Git-connected to `main`, runs `npm run build:web`, includes all paths, and is triggering production builds for docs-only plan commits. Added provisional finding A27 and owner question AQ27. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only Cloudflare configuration inspection; no Cloudflare settings changed. At inspection, the latest docs-only deployment was building and the prior deployment remained canonical. | pending | Recheck the latest Pages deployment status and continue reviewing the remaining launch/reliability items before finalizing the questionnaire. |
| 29 | 2026-10-26 | Production code audit — history completeness | Confirmed the garage recharge-history screen fetches only 50 ledger entries and does not paginate; refined checkout timestamp finding to cover null/epoch values where client and server calculations diverge. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue reviewing remaining endpoints and role workflows before finalizing the owner questionnaire. |
| 28 | 2026-10-26 | Production code audit — checkout timestamp and commission recipient | Refined the checkout timestamp finding after tracing JavaScript date parsing and added a question about commission recipient when creator/referrer differ. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no app code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue reviewing other financial and role-specific flows before finalizing the owner questionnaire. |
| 27 | 2026-10-26 | Production code audit — credit ledger access | Traced `/api/garages/:id/credit-ledger` authorization and its route test. Same-garage staff are allowed to read ledger amounts and balance-before/after fields; cross-garage staff are denied. Added provisional finding A24 and owner question AQ24. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source/test inspection; no application code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue checking remaining endpoints and role-specific visibility before finalizing the question list. |
| 26 | 2026-10-26 | Production code audit — PIN and delegate exposure follow-up | Confirmed shared LoginView permits 1–10 digits while server login accepts only 5 or 8, and confirmed delegate dashboard responses retain all garage fields except PIN-related fields while Firestore rules permit garage/vehicle/subscriber reads. Refined A15/A22 and owner questions AQ5/AQ17. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source inspection; no application code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue reviewing other role flows, data exposure, and calculations before finalizing the question list. |
| 25 | 2026-10-26 | Production code audit — continued | Traced Firestore delegate read rules, vehicle checkout cost handling, and existing route tests. Added provisional findings A22–A23 and owner question AQ23; broadened AQ5 to cover direct vehicle-record reads as well as subscriber personal details. | `docs/UI_PERFORMANCE_PLAN.md` updated | Read-only source/test inspection; no application code changed and no tests executed by this audit session. | pending | Audit remains in progress; continue reviewing remaining route/UI wiring, role access, calculations, and launch evidence before finalizing the complete question list. |
| 24 | 2026-10-26 | Production code audit — initial findings | Inspected current-main vehicle check-in/check-out, prepaid-credit ledger, financial report logic/tests, subscriber date handling, Firestore access rules/tests, PIN verification, investment calculator, and release workflows. Recorded provisional findings A1–A19 and owner questions AQ1–AQ21; audit is not yet complete. | `docs/UI_PERFORMANCE_PLAN.md` only; no application code changed | Read-only source inspection; no tests were run by this audit session. The latest app release had passing automated gates and a live smoke check; verify again after fixes. | documented in plan | Do not change business/reporting/privacy behavior until the owner answers the linked questions. Continue auditing remaining UI, routes, calculations, dead code, and launch evidence; then finalize the question list. |
