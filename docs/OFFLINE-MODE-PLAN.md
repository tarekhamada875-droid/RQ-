# Offline Mode for Garages — Plan of Record

**Status:** Design approved by owner (2026-11-14). Build not started — awaiting owner's GO.
Implementation may be delegated to another AI by owner decision (2026-11-14, credit budget);
the execution rules in §9 keep any implementer inside the approved design. The assistant who
wrote this plan remains available for between-step review of diffs.

**The one-line version:** "WhatsApp, but for cars." When internet dies, the garage keeps
working; each action shows a little clock ("saved, waiting"); when internet returns,
everything delivers itself — once, never twice — and the money settles in one stamped call.

---

## 1. The story (why this exists)

Today, when a garage loses internet, `App.tsx` blocks the entire app behind
`OfflineView` (the full-screen "مفيش اتصال بالإنترنت" red wall) after 2 seconds.
The garage stops working: cars during the outage are turned away, credits are never
earned, reports have holes. The owner's admin and delegates are unaffected by this
decision — they keep today's behavior exactly.

The approved feature makes garages offline-capable while keeping the server as the
only bank. Owner approved the simplified "WhatsApp-for-cars" shape after iterating
through: per-car stamped replay (rejected as over-complicated) → count-only settlement
(broken: numbers can't settle lists) → final split: **money = one number, cars = receipts**.

## 2. Scope rules (agreed)

- **Garages only.** Admin and delegate code paths are untouched; they keep the current
  online-required behavior including the existing offline wall.
- **The server is the only bank.** Credits are charged by the server, never invented
  on the phone. The phone keeps a local tally + receipts; the server settles them.
- **No feature flag (owner decision, 2026-11-14).** No dark launch, no per-garage pilot
  switch. Safety comes from the step order — the pocket limit is live before the
  settlement endpoint can move money — plus tests in every PR. The production off
  switch is a revert PR (minutes, not milliseconds); after a revert, garages return to
  today's wall and phones with pending notebooks hold their data until the fix lands.
- **Free plan stays the plan.** No feature may multiply reads/writes. Offline hours
  cost zero billed reads (phone serves from its own cache).

## 3. Design decisions (owner-approved)

1. **Ghost spinner on reconnect.** When internet returns, a spinner covers the garage's
   screen; nothing can be touched until the settlement handshake finishes; then the
   server's numbers win and the app continues. No background sync while working.
2. **Money = one line, not per-car replay.** The phone reports one number:
   "offline session used N credits." The fee is flat — every regular (non-subscriber)
   check-in costs exactly 1 credit (`debitRegularEntry` enforces `amount === 1`),
   so the number is literally a tally count of regular cars.
3. **Cars = receipts, not totals.** Offline check-ins/check-outs are written as normal
   vehicle/activity records so reports, plate history, and post-reconnect check-outs
   all work. A total number cannot settle a list — receipts can.
4. **Never below zero — by construction.** Offline work is capped by the last-known
   balance ("money in their pocket"). When the pocket is empty, a calm full-screen
   message pauses work until internet returns. The server's `INSUFFICIENT_CREDITS`
   refusal can therefore never trigger at settlement. The edge case is deleted,
   not handled.
5. **Exactly-once settlement.** The settlement call carries one idempotency stamp.
   The Worker already has the idempotency vault (`server/idempotency.ts`,
   `checkIdempotencyInTransaction` / `storeIdempotencyInTransaction`, used by the
   check-in route). A retry after a mid-call drop returns the cached result —
   the same stamp can never charge twice. All-or-nothing per session.
6. **Same car = same paper.** Offline receipt documents use deterministic IDs
   (garage + plate + entry-minute — same trick as `materializeCreditLedgerEntry`'s
   entryId). Two phones recording the same car collapse into one document.
   Double-counting is structurally impossible, not "carefully prevented."
7. **Subscriber claims re-verified at settlement.** The phone may be stale about who
   is a subscriber; the settlement re-checks each subscriber receipt against the real
   subscription dates (the check-in route already does this authoritative lookup
   online: `today >= startDate && today <= endDate`). A lapsed subscription cannot
   ride free.
8. **Rollout (no flag).** Owner decision 2026-11-14: no dark-launch flag, no per-garage
   pilot. Steps ship to all garages as they merge. Safety = step order (the pocket
   limit ships before the settlement endpoint exists) + regression tests in every PR
   + revert-as-kill-switch (a revert PR restores today's behavior in minutes).

## 4. Existing machinery we build on (verified in code, 2026-11-14)

| Piece | Where | Note |
| --- | --- | --- |
| Persistent on-device cache (IndexedDB, multi-tab) | `src/firebase.ts` (`persistentLocalCache` + `persistentMultipleTabManager`, PR-E) | Already ON, with graceful memory fallback. Client-side writes queue automatically offline and self-sync — the "notebook" is Google's, not ours. |
| Online-status hook (2s grace) | `src/hooks/useOnlineStatus.ts` | Returns `isOnline`, `showOfflineScreen`. |
| The red wall | `src/components/layout/OfflineView.tsx`, mounted at `App.tsx` (`if (showOfflineScreen) return <OfflineView />`) | Blocks everyone today; becomes garages-exempt in step 1. |
| Check-in goes through the Worker | `src/services/vehicleService.ts` → `POST /api/vehicles/check-in` | Accepts caller-provided `idempotencyKey` — retries reuse the same key. |
| Check-in transaction (~5 writes) | `server/vehicleRoutes.ts` | subscriber authoritative lookup; debit only if `prepaidCreditsEnabled && !isSubscriberAuthoritative`; writes credit_ledger + vehicle + garage + dailyStats + idempotency stamp. |
| Flat fee, no negatives, deterministic ledger IDs | `server/domain/prepaidCreditLedger.ts` | `debitRegularEntry` hard-locks 1 credit; balance never goes below zero; `materializeCreditLedgerEntry` builds deterministic entryIds. |
| Existing test coverage to extend | `server/prepaidCreditLedger.test.ts`, `server/idempotencyTransaction.test.ts`, `server/honoApi.contract.test.ts`, `src/hooks/useGarageApp.test.tsx`, `src/hooks/navigationUiContext.test.tsx` | |

## 5. Build steps (each step = one PR through the normal flow: branch → PR → auto-merge → verify green → delete branch)

### Step 1 — Take the wall down (garages only)
- `App.tsx` / `useGarageApp`: role-aware gate. Admin/delegate keep
  `OfflineView` exactly as today. Garages get a slim RTL banner instead:
  "لا يوجد إنترنت — كل شيء محفوظ على الجهاز وسيتحدث تلقائياً" (working offline — saved on device, will sync).
- Garage lists are served from the persistent cache (already on). No write changes yet.
- **Accept:** garage with internet off sees banner + cached data, not the wall; admin/delegate behavior byte-identical.

### Step 2 — The little clock (offline check-in / check-out)
- Offline check-in stops calling the Worker and instead:
  - writes the vehicle doc via the Firestore client (auto-queued by the persistent cache),
  - writes the check-out/status change the same way when the car leaves,
  - increments the local tally (+1 per regular car; subscriber detection from cached subscriber list),
  - shows the row/state with a small clock marker: "محفوظ — في انتظار المزامنة".
- Deterministic receipt doc IDs (see §3.6); align the ID scheme with the existing
  vehicle doc scheme and duplicate-plate rules during implementation (open detail, §8).
- **Accept:** airplane-mode: check in N cars → rows appear instantly with clocks; app killed and reopened → queue survives.

### Step 3 — The pocket limit (offline allowance)
- Phone stores last-known balance (already present in the cached garage doc).
- Offline regular check-ins allowed up to that balance. When empty:
  calm full-screen "الرصيد المسبق انتهى — سيستمر العمل عند عودة الإنترنت" (prepaid offline credits used up — work continues when internet returns).
- No negatives can exist anywhere: phone never exceeds the allowance; server never
  refuses a settlement debit.
- **Accept:** spend past the cap offline → clean pause screen; reconnect → allowance refreshes, work resumes.

### Step 4 — The one phone call (settlement)
- On reconnect: ghost spinner (blocks input) → `POST /api/vehicles/offline-settlement`
  (new Worker route) with `{ sessionId, tally, counts }`:
  - idempotency vault check (same stamp → cached result, no double charge),
  - one ledger entry, new kind `offline_settlement_debit` (added to `CreditEntryKind`),
  - garage balance debit in one transaction with the stamp,
  - daily stats updated from receipt data (attributed by each receipt's own timestamp —
    handles garages working past Cairo midnight),
  - subscriber receipts re-verified against subscription dates; lapsed claims converted
    to regular debits before the balance settles.
- Car receipts themselves sync via the Firestore queue in parallel (Google's machinery).
- Spinner ends only when both sides confirm; server's numbers win on the phone.
- **Accept:** settle once → balance, ledger line, stats, receipts all correct; retry after mid-call drop → "already done," nothing double.

### Step 5 — The proof (final gate before the full feature is considered done)
- Airplane-mode E2E: 10 cars offline → reconnect → all land once, balance correct, reports complete.
- Kill the app mid-queue and mid-settlement → reopen → no loss, no double.
- Two phones, same car → one receipt (deterministic ID collapse).
- Lapsed subscriber offline → settlement charges correctly.
- No-IDB browser (private mode) → app detects and says offline mode is unavailable rather than silently failing.
- No feature flag anywhere in the code; the production off switch is a revert PR.

## 6. Cost model (verified against free tier)

- Online car in/out today: ~5 writes (unchanged by this feature).
- Offline car receipt: 1 write each (no per-car money entry, no per-car stamp).
- Settlement: ~4 writes per offline period (ledger + garage + stamp + stats).
- Offline hours: zero billed reads (served from on-device cache).
- Firestore free tier: 20,000 writes/day → ceiling ≈ 4,000 settled cars/day across
  all garages combined. Far above current volume. Lever if ever needed later:
  fold money-side writes into one daily entry per garage (not needed now).

## 7. What we deliberately do NOT build

- No custom sync engine for car receipts (Google's persistent cache does it).
- No per-car offline money transactions (one tally line instead).
- No negative-balance handling (the pocket limit deletes the case).
- No conflict-resolution engine (deterministic IDs collapse duplicates).
- No changes to admin, delegate, auth, or top-up flows.

## 8. Open details to pin during implementation

- Offline receipt doc-ID scheme vs. the existing vehicle doc IDs and the Worker's
  duplicate-plate check-in behavior (must compose, not fight).
- Exact daily-stats recomputation rules at settlement (revenue/counters by receipt timestamp).
- UX copy review with owner (Arabic strings above are drafts).

## 9. Execution handoff — hard rules for any implementer (AI or human)

This doc is a **contract**, not a suggestion. The approved design is fixed.

1. **First, read** `README.md`, `AGENTS.md`, `docs/PROJECT.md`, `docs/SECURITY.md`
   (per the AGENTS.md owner test-and-handoff cycle), then this doc end to end.
2. **One step = one PR = one bounded change.** Steps in order (1→6), never parallel,
   never combined. After each squash merge: fresh branch from updated `main` —
   never push to a merged branch.
3. **No redesign, no scope additions, no "improvements."** §7 (what we deliberately
   do NOT build) is a fence — do not cross it, do not replace its decisions with
   alternatives. If any part of this doc seems wrong or impossible to implement,
   STOP and ask the owner instead of improvising.
4. **Merges follow the normal automated gates** (AGENTS.md: the owner is not a manual
   test gate). But each step's report must state plainly which doc sections were
   implemented and list ANY deviation from the doc. Deviations require owner approval
   BEFORE the PR is opened.
5. **Money is frozen.** Step 4 (settlement) implements §3 exactly: one idempotency
   stamp, all-or-nothing, one ledger line, never-below-zero by construction,
   subscriber re-check. The independent review of the step-4 diff by the plan's
   author (or owner) is required before that PR merges.
6. **Scope fences:** no changes to admin, delegate, auth, or top-up code paths;
   Arabic RTL UI only; no new documentation files — update this doc instead.
7. **Tests are part of each step:** extend the files listed in §4, add the step's
   regression test, `npm run ci:check` must pass.
8. **No flag, ever.** Do not add feature flags, per-garage gates, or pilot switches
   (owner decision 2026-11-14). If production misbehaves, the kill switch is a
   revert PR, not a toggle.
9. **Report like AGENTS.md says:** short, plain language, verified final states only —
   never claim merged/deployed before checks prove it.
