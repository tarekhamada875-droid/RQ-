# RQ — LAST PLAN BEFORE PRODUCTION

**Status:** Draft from the owner’s questionnaire answers. Implementation is blocked until the decision items in Section 4 are resolved and the approved product contract is updated.

**Purpose:** Turn the owner’s answers into one clear, ordered implementation plan for RQ. This is a plan, not a code change or permission to deploy, delete production data, copy real customer data into test systems, or expose secrets.

**Source:** Owner answers in `anwers.txt`, matched against Questions 1–91 of the deduplicated owner questionnaire. All numbered questions have a response, including questions the owner asked to remove. The answer file itself is not committed to this repository.

## 1. Plain-language summary

RQ should keep its current Arabic, right-to-left experience and existing overall design. The owner wants all major workflows to work—not one selected “first” workflow. Staff and garage owners need vehicle operations; monthly subscribers, Admin credit grants, garage settings, and financial visibility must follow the final role rules. The app must not say an action succeeded until the trusted backend confirms it, and a retry must not create a second record or charge.

The intended credit path is external wallet payment, a WhatsApp report, Admin verification, and an Admin-only manual credit grant in RQ. The owner does not want an in-app payment checkout or Delegate credit approvals. The answers also describe a 50–2,000 EGP range for each Admin grant operation, a 500 EGP threshold for a one-time 100 EGP delegate commission, and 20 referral credits for the referring garage. The exact meaning of per-vehicle and subscriber pricing still needs reconciliation before it can safely be coded.

The owner does not want a customer pilot. RQ must pass the production checks before serving its first real garage. This does not mean the service can be assumed error-free or that a support/incident plan is unnecessary.

## 2. Current product and code baseline

The repository’s existing documented architecture is Cloudflare Pages → Cloudflare Worker using Hono → Firebase Authentication and Firestore. The Worker is the authority for identity, permissions, garage scope, subscriber eligibility, balances, and financial changes. Multi-record business changes use Firestore transactions and retried requests use idempotency keys.

Relevant current implementation points include:

- `server/domain/vehicleCheckIn.ts` — rejects a second active vehicle record, blocks check-in for a garage that is locked/suspended, and returns a specific result for a monthly subscriber rather than checking it into the ordinary vehicle list.
- `server/domain/vehicleCheckOut.ts` — validates checkout of a known active vehicle and validates the amount supplied by the trusted server-side flow.
- `server/domain/subscriberLifecycle.ts` — validates date ranges and rejects invalid dates; it does not automatically delete an invalid subscription record.
- `server/domain/prepaidCreditLedger.ts` — separates paid, referral, and trial balances; regular entry debits are currently one credit, referral awards are 20 credits, and subscriber renewal debits are represented separately.
- `server/financialReporting.ts` — reports cash and credit activity as distinct measures and calculates financial totals from events and ledger data.
- `server/domain/authorization.ts`, `server/garageRoutes.ts`, `server/subscriberRoutes.ts`, `server/vehicleRoutes.ts` — server-side role, garage-scope, and operation rules.
- `src/components/admin/`, `src/components/garage/`, `src/components/delegate/`, and `src/components/app/` — current role-specific screens and navigation.

These files are starting points for review, not proof that every new owner decision is already implemented. Existing product/security documents remain the current contract until the conflicts below are resolved. Do not silently make the code or documents choose between conflicting answers.

## 3. Captured owner decisions

The entries below preserve the answers as provided. A letter followed by “Other” includes the owner’s written instruction. “Keep current” means do not redesign or rearrange the screen without following Question 90’s review preference.

| Questions | Recorded answer |
|---|---|
| 1–10 | **1A** keep the simple garage-management promise; **2D** “everything” (no single first workflow chosen); **3A** no offline writes, explain failure, keep safe typed text, retry without duplication; **4D** no product-imposed device-count limit; **5A** prevent a second active record for the same plate; **6B** matching plates identify/merge the customer; **7A** correct active plates with an audit trail, with a shared allowance of three mistakes per garage per day; **8A** use trusted server time, stored in UTC and shown in Cairo time where shown; **9A** keep vehicles active overnight until checkout; **10B** selected “ordinary credit on every check-in,” with a note that subscription/renewal costs five credits. The conflict is open in Section 4. |
| 11–19 | **11A** one named vehicle per subscriber; **12A** dates inclusive in Cairo; **13A** only offered duration choices; **14A** five credits for each approved renewal regardless of duration; **15C** automatically delete records with missing/invalid subscription dates; **16A** Staff cannot edit subscription dates; **17A** per-garage rates; **18B** latest approved rate at checkout; **19A** a locked garage may check out existing vehicles but may not start new check-ins. |
| 20–28 | **20A** external wallet → WhatsApp report → Admin verifies and manually grants credits; only Admin grants credits inside RQ; no in-app payment or Delegate credit approval. **21A** cash collected means confirmed external payments matched to paid grants; exclude free credits. **22B** call all credit grants revenue. **23A** trial/referral credits are not cash revenue. **24B** payment references need only be unique within a garage. **25A** 100 EGP commission with a 500 EGP minimum qualifying payment. **26D** if referrer and creator differ, the referring garage owner gets 20 referral credits and the creating Delegate gets 100 EGP after the new garage’s first qualifying payment. **27A** award 20 referral credits once after that qualifying payment. **28C** delete everything, including the deletion audit, when a garage is deleted. |
| 29–37 | **29D** Owner manages Staff, garage settings, subscribers, and financial visibility; Staff handles ordinary vehicle operations only and must not check monthly subscribers into the ordinary list. If Staff tries, show that it is a monthly subscriber and block the ordinary check-in. **30D** Staff sees only the balance and low-balance alerts, not ledger history. **31D** Delegates see only a garage balance. **32D** Delegates do not see plates. **33D** when Staff is removed, revoke sessions promptly, invalidate the session index, block future login, and delete the user and all history. **34B** changing a PIN leaves existing sessions active until expiry. **35A** five-digit PINs. **36A** make the repository private before real customer data or secrets are present. **37A** retain only a tightly bounded PIN-lookup mechanism and harden its verification, rate limits, and error messages. |
| 38–46 | **38A** Worker is authoritative; no Delegate credit grants; browser writes must not bypass the approved backend. **39A** bounded retries then a clear conflict/retry response, retaining the same operation key. **40A** missing update target means not-found, not accidental creation. **41A** keep financial dispute/replay records at least 13 months and keep personal details for a shorter appropriate period. **42A** backups and a successful non-production restore test before the first real customer. **43A** sessions last at most 24 hours. **44A–45A** slow/pause unnecessary hidden-page checks and listeners, clear stale private state on account/role changes, and refresh safely after failed writes. **46B** use Firebase free quota without a monthly budget. |
| 47–56 | **47D** owner states Cloudflare is Free; verify it in the account rather than assuming. **48B** use production credentials/data in Preview. **49C** prefer fixing forward rather than testing rollback. **50C** no routine secret inventory or rotation requested. **51C** log sensitive values in Preview only. **52B** no promised uptime/response target or custom domain; keep the current Pages URL. **53C** delete hidden/retired features and historical data immediately. **54A** owner decides product behavior; technical maintainer implements consistently. **55A** require typecheck/lint, full tests, Firestore-rules tests, production build, Worker smoke, maintainability checks, a four-role walkthrough, and live checks before release. **56B** copy production data into test fixtures. The Preview, logging, and test-data selections conflict with the repository’s existing security rules and are not safe to implement as written; see Section 4. |
| 57–69 | **57** delete this question; **58D** no alerts; **59A** wrong-charge investigation details are Admin-only; **60D** no numeric recovery targets; **61D** no customer pilot—launch only when the app is ready for production; **62A** Garage Owner is the customer/payer. **63D** custom: 1 EGP = 1 credit per car checked in, five credits per monthly subscriber, and Admin grants must be 50–2,000 EGP per operation (e.g. 3,000 requires 2,000 then 1,000). **64A** per-garage monthly pricing. **65D** stop new check-ins when credits run out, allow cars already inside to check out, then lock the garage; show “رصيدك خلص” with the owner’s wallet number prominently. The wallet number was not supplied. **66D** Admin or Delegates onboard garages. **67–69** delete these questions. |
| 70–91 | **70A–72A** keep current look, menu, and role home screens; **73D** keep current first-screen priorities; **74A–75A** keep current information density and Arabic labels; **76A** confirm actions that are hard to undo; **77A** keep current loading indicators; **78B** after a successful action, return to the main screen without an additional success message; **79A–80A** keep current empty-list and search behavior; **81D** keep current vehicle result details; **82A–83A** keep current forms and required-field markings; **84B** label amounts with EGP or credits and explain what the number means; **85A** keep current color design; **86D–87A** keep current supported devices and current button/text sizes; **88B** use consistent names, colors, and placement for similar actions; **89D** do not show time in the user-facing interface; **90C** explain proposed layout/workflow changes in plain language and ask before making them; obvious spelling fixes may be made without asking; **91C** some words, numbers, or instructions are confusing, but no specific example was supplied. |

Additional screen notes from the owner: Home/dashboard, active-vehicle search, credit/payment reporting, and Staff/garage settings are for Admin only; vehicle check-in/out is for Garage Owners and Staff; customers/subscribers is for Garage Owners. These notes need to be reconciled with Question 29 and with the need for Garage Owners/Staff to find and check out vehicles already inside.

## 4. Decisions and safety blockers before implementation

The answers have been recorded, but the following items conflict with each other or with the repository’s existing product/security contract. The safe default is **do not guess**. Resolve these first, then update `docs/PROJECT.md` and this plan’s decision register before implementation begins.

| ID | Owner-answer conflict or missing detail | What must be resolved |
|---|---|---|
| B1 — pricing and subscriber charges | Q10B says every subscriber check-in uses an ordinary credit; the note and Q14 say a subscription/renewal costs five credits; Q63 says one credit per car and five credits per subscriber; Q64 says per-garage monthly pricing. The current `docs/PROJECT.md` says subscribers have no separate subscriber charge. | Confirm exactly what a garage pays for: a monthly fee, credits per ordinary vehicle visit, a five-credit monthly subscriber fee, or a combination. Confirm whether a covered subscriber visit consumes an ordinary vehicle credit. Do not implement a billing formula until this is explicit. |
| B2 — what “revenue” means | Q21A and Q23A exclude free credits from cash collected, but Q22B says every credit grant is revenue. | Keep “cash received,” “credits issued,” and “credits used” as separate quantities unless the owner confirms which one, if any, may be labelled revenue. Do not change official accounting labels by inference. |
| B3 — role and screen access | Q29 gives Owners staff/settings/subscriber management, while the screen notes say Staff/garage settings are Admin-only. The notes say active vehicle search is Admin-only, while Owners/Staff must perform vehicle operations and allow cars to check out. Delegates can onboard garages but should see only balances and no plates. | Approve one role-by-screen-and-action matrix, including how an Owner/Staff finds an active car for checkout without access to the Admin-only search/report screens, and the exact limits for Delegate onboarding. Until then keep current server permissions; do not rely on hiding a button as security. |
| B4 — data deletion versus retention | Q15C requests automatic deletion of invalid subscriber records; Q28C requests deletion of all garage data including deletion audit; Q33D requests deletion of Staff history; Q41A requires at least 13 months of financial dispute/replay records; Q53C requests immediate deletion of all historical data/features. Existing engineering rules require exact deletion scope, backup, and verification. | Decide whether historical financial evidence must survive account/staff deletion, whether personal identifiers can be removed while preserving non-identifying financial proof, and what “all historical data/features” refers to. No automatic or bulk production deletion may happen before exact scope, backup/restore, and post-delete verification are documented and explicitly approved. |
| B5 — Preview and test data | Q48B and Q56B select production credentials/data for Preview and copied production records in tests. Existing repository security rules require synthetic emulator fixtures and prohibit real customer records/secrets in tests. | Use synthetic test data and separate Preview credentials/data. Production credentials, real customer records, plates, PINs, payment data, and secrets must not be copied into Preview, tests, logs, or Git. If realistic test data is needed, first approve a safe synthetic/anonymized method; do not copy raw production data. |
| B6 — secrets and logs | Q50C requests no inventory/rotation; Q51C permits sensitive values in Preview logs. Existing security and operations rules prohibit committing secrets or recording PINs, tokens, plates, customer PII, payment details, or request bodies in logs. | Keep secrets out of source control and logs in every environment. No scheduled rotation is added unless later approved, but any exposed secret must still be restricted/rotated as part of incident response. Logs stay redacted, including in Preview. |
| B7 — operations owner and launch support | Q57 and Q67 were removed; Q58 says no alerts; Q60 sets no RPO/RTO; Q61 says no pilot. This leaves no named incident/support contact or response expectation. Q42 nevertheless requires a tested restore and Q55 requires release/live checks. | Before the first real garage, name who handles a serious service or data incident and how the owner can be reached. No uptime SLA, numeric RPO/RTO, pilot, or custom alerting is assumed. Minimum release health/version checks and the documented backup/restore gate remain required. |
| B8 — plate-correction limit | Q7A plus the note says “three mistakes daily per garage, including all roles.” | Confirm that this means at most three audited plate-correction attempts shared by all users of a garage per Cairo calendar day, and what should happen after the third. Until confirmed, keep existing correction limits. |
| B9 — exhausted-credit screen | Q65 requests a prominently displayed wallet number, but no number was provided. | Supply the exact business wallet number through an appropriate private configuration path before that screen is enabled. Do not guess, expose a personal number, or put a secret/payment identifier in source control. Confirm which roles may see it. |
| B10 — no pilot and no selected first workflow | Q2 answers “everything”; Q61 rejects a pilot. | The plan will sequence work by dependency and risk, not claim a product priority the owner did not choose. “No pilot” means no external pilot phase; synthetic-data verification and release gates still happen before the first real garage. |

Other explicit choices that should be implemented once their dependent rules are approved:

- **Q24B:** payment-reference uniqueness is per garage, not global. This differs from the questionnaire’s earlier recorded global-uniqueness direction. Confirm the intended behavior for the same external transfer reference presented against two different garages before changing the existing duplicate guard; retries of the exact same request must remain idempotent.
- **Q34B and Q43A:** PIN change leaves existing sessions active until their 24-hour expiry; removal of Staff revokes sessions promptly. Add tests for both and document the security trade-off. If a PIN is suspected compromised, incident response must be able to revoke sessions immediately.
- **Q36A:** make the public repository private before real customer records or secrets are placed in the project; review repository history for accidentally committed secrets first. This plan does not change repository visibility.
- **Q37A:** keep any PIN lookup only as a bounded lookup aid, with protected lookup material, rate limiting, generic failures, and a stronger verification design. Never return or log a PIN.
- **Q46B / Q47D:** use the owner-stated free tiers only; verify Cloudflare plan/limits and Firebase quota in the actual accounts. There is no owner-approved monthly budget or uptime promise. Capacity and quota behavior must still be measured for the expected 7–9 garages, with no promise of literally unlimited devices.
- **Q49C:** fixing forward is preferred. Keep the existing guarded rollback procedure as a safety option; do not bypass release controls or claim a rollback was tested unless it was.
- **Q52B:** retain the current Pages URL; no custom domain or contractual uptime/response target is in scope.
- **Q65:** the Arabic exhausted-credit message is “رصيدك خلص”. Checkout of vehicles already inside must remain possible after new check-ins are stopped.
- **Q66D:** Admin or Delegate may onboard garages, but only Admin may verify external payment and grant credits.
- **Q89D:** hide time from user-facing screens as requested; retain accurate server timestamps internally for billing, dispute investigation, and audit. Confirm whether Admin-only reports are also meant to hide time before changing those screens.
- **Q90C / Q91C:** preserve current layout and wording by default. Ask for plain-language approval before layout or workflow changes. Q91 identifies confusing wording but gives no examples, so do not rewrite Arabic labels broadly; collect specific screen/word examples first.

## 5. Implementation plan and ordering

The owner has authorized implementation to begin. Requirements that are explicit and independent of unresolved decisions may be implemented as isolated, tested changes. **Do not implement a feature or behavior that depends on Blockers B1–B9 until they are resolved or explicitly deferred with an approved safe rule.** Keep each change bounded; do not treat this authorization as approval to guess about pricing, financial reporting, roles, deletion/retention, production data, or account configuration.

### Phase 0 — Resolve product rules and establish one contract

1. Review the blocker table with the owner using short plain-language choices.
2. Record the final answers and assumptions in this file; update `docs/PROJECT.md` with only the rules the owner has confirmed.
3. Reconcile role permissions, billing formula, subscriber charging, revenue terminology, payment-reference scope, deletion/retention, safe environments, and operations ownership.
4. Confirm the exact wallet-number display policy and whether the UI time-hiding rule applies to Admin.

**Exit check:** no implementation task depends on two different answers; `docs/PROJECT.md`, `docs/SECURITY.md`, and this plan agree.

### Phase 1 — Verify the current product paths and add focused tests

1. Map each approved user flow to the Pages screen, Worker route, domain decision, Firestore records, ledger/event, and response shown to the user.
2. Add or update synthetic-data tests for Admin, Delegate, Garage Owner, and Staff; include cross-garage attempts and direct-write denial.
3. Add tests for concurrent check-in/out, duplicate plates, stale sessions, safe retries after network failure, and wrong-role access before changing behavior.
4. Record what is already correct so later changes do not rebuild existing working flows.

**Exit check:** each approved requirement has a named server-side authority and regression test.

### Phase 2 — Vehicle, plate, rate, and subscriber rules

1. Implement the approved vehicle identity and duplicate-active-record behavior.
2. If B8 is confirmed, enforce the shared per-garage daily plate-correction limit and immutable audit record; never silently rewrite a completed transaction.
3. Use server timestamps as the source of truth, store UTC, apply approved Cairo calendar-date rules, keep overnight vehicles active, and use the confirmed rate rule at checkout.
4. Implement the approved subscriber eligibility, one-vehicle identity, inclusive dates, allowed durations, renewal debit, Staff denial message, and invalid-date handling.
5. Preserve checkout access for existing vehicles when the garage is locked or has no credits.

**Exit check:** backend and UI agree on every charge/eligibility result; retries and simultaneous devices cannot duplicate a vehicle or debit.

### Phase 3 — Credit grants, billing, referrals, and reports

1. Keep external wallet payment and WhatsApp reporting outside the app; provide an Admin-only manual grant path after the payment rules are approved.
2. Enforce the confirmed 50–2,000 EGP per-operation Admin grant range, exact amount/credit conversion, reason/reference capture, idempotency, and audit trail.
3. Implement approved per-garage payment-reference uniqueness and test both exact retries and attempted reuse.
4. Implement the approved first-qualifying-payment commission and referral award atomically: one 100 EGP commission to the creating Delegate and one 20-credit award to the referring garage owner when their roles differ; do not pay twice on retries or later grants.
5. Report actual cash collected separately from paid, trial, and referral credits issued/used. Use “revenue” only as approved in Phase 0.
6. Implement the exhausted-credit flow: block new check-ins, permit existing checkout, then lock the garage; show the approved Arabic notice and only the owner-approved wallet information.

**Exit check:** balances, ledger, events, referrals, commissions, and reports reconcile in automated tests; no browser or Delegate can change a balance.

### Phase 4 — Roles, privacy, sessions, and account removal

1. Implement the approved role-by-screen-and-action matrix on the Worker, not only in the UI.
2. Limit Staff to approved vehicle operations and the approved balance/low-credit view; block subscriber management/check-in as decided.
3. Limit Delegate visibility to approved onboarding/referral needs and balance; never expose plates or subscriber/customer PII.
4. Apply 24-hour session expiry, immediate revocation on Staff removal, and the approved PIN-change behavior. Test invalidation of session indexes and future login denial.
5. Implement the approved PIN protections, rate limits, generic error responses, and secret-free diagnostic traces.
6. Implement garage/user deletion only after Phase 0 decides exactly which personal and financial records are erased, retained, anonymized, or audited.

**Exit check:** four-role authorization matrix passes for both allowed and denied actions; historical attribution and retention follow one approved rule.

### Phase 5 — Data safety, environments, and operations

1. Configure safe Preview/test separation; use synthetic emulator data only and verify production credentials/customer records are not used there.
2. Keep secrets out of Git and logs; review repository history and make the repository private before any real customer data or secrets are stored.
3. Verify Firestore and Cloudflare account plans, quota limits, rate limits, and expected usage for 7–9 garages. Do not describe “no device limit” as infinite technical capacity.
4. Create backups/exports and complete a documented restore into non-production before the first real garage; prove counts and key records after restoration.
5. Define the minimum incident contact and owner-approved response path. Do not invent an SLA or numeric recovery target.
6. Keep logs free of credentials, PINs, tokens, full plates, customer PII, payment details, and request bodies in all environments.

**Exit check:** restore test succeeds, Preview is isolated, no sensitive data appears in tests/logs, and an incident contact is documented.

### Phase 6 — Preserve and verify the UI/UX

1. Keep the present Arabic/RTL look, menus, screen density, navigation, search, forms, home screens, empty states, and device support unless a specific approved change is needed.
2. Maintain the current user feedback after actions except where a confirmed backend rule requires a clear failure, denial, or retry message. Show success only after the Worker confirms the write.
3. Clearly label EGP versus credits. Keep colors and ensure status remains understandable from current labels/icons; do not rely on color alone if that would hide meaning.
4. Hide time in user-facing screens as decided, but preserve exact backend timestamps. Do not change Admin reports until the owner clarifies Q89’s scope.
5. Present proposed layout/workflow changes in plain language and ask first. Make only specific obvious spelling fixes without prior approval; Q91 needs examples before copy changes.

**Exit check:** no unapproved redesign; all roles can complete their approved tasks on current supported devices; financial and denial messages are accurate in Arabic.

### Phase 7 — Production readiness and first launch

1. Run the repository’s required `npm run ci:check` and `git diff --check` for every bounded change. The CI check includes typecheck, full tests, Firestore rules tests, production build, Worker-artifact smoke, maintainability checks, and artifact verification.
2. Complete the Q55 pre-release checks, synthetic-data four-role walkthrough, Worker health/version checks, Pages/Worker configuration verification, required Firestore indexes/rules, financial reconciliation, and backup-restore gate.
3. Do not run a customer pilot. Do not serve a real garage until the owner’s approved product rules and all critical financial/security/data gates pass.
4. Use focused pull requests and the protected Production Gate. Do not manually deploy an arbitrary artifact; retain the guarded rollback path even though fix-forward is preferred.
5. After first launch, verify live health/version and monitor real operations using only the approved, privacy-safe operational evidence.

**Final exit check:** no open decision affects money, access, retention, or checkout; all required automated checks pass; production configuration is verified; the first real garage can operate and retrieve its vehicles even during low-credit or connectivity failures.

## 6. Progress tracker

| Item | Status | Next action |
|---|---|---|
| Capture all 91 questionnaire answers | Complete | Owner answers recorded above; no question was silently omitted. |
| Existing-plate checkout prompt | Complete on feature branch | If a typed plate matches an active vehicle already loaded for this garage, open that vehicle’s checkout flow instead of only showing a duplicate-check-in error; focused test also asserts this still works when the garage is locked and all credit buckets are empty. |
| Resolve Section 4 blockers | **Blocked** | Owner chooses or clarifies the listed conflicts. |
| Update canonical product contract | Not started | Begin only after blocker decisions are recorded. |
| Phases 1–7 implementation | Not started | Start one bounded plan item at a time after Phase 0 exits. |
| Production launch | Not started | Only after Phase 7 acceptance checks; no pilot phase. |

## 7. Execution log

- **2026-10-28 — Safe implementation started at the owner’s request.** Implemented the isolated existing-plate checkout prompt in `src/hooks/useVehicleOperations.ts` and added `src/hooks/useVehicleOperations.existingVehicleCheckout.test.tsx`. Extended the focused test to assert that checkout remains available while the garage is locked and all credit buckets are empty. The focused test, TypeScript check, and full local `npm run ci:check` passed. No pricing, accounting, authorization policy, deletion/retention, production data, cloud account, or deployment behavior was changed. **Next:** push the test extension and confirm the remote PR gate; keep the PR in draft and do not deploy. Then continue only with requirements that do not depend on unresolved blockers, resolving Section 4 before implementing dependent behavior.
- **2026-10-27 — Plan drafted from the owner’s uploaded answers.** Matched all Questions 1–91, including custom notes and deleted-question requests. Inspected current product/security documents and the vehicle, subscriber, credit-ledger, financial-reporting, and authorization decision modules to identify conflicts and implementation touchpoints. No application code or production data was changed. **Next eligible task:** resolve Section 4 blockers, then update `docs/PROJECT.md` before implementation.
