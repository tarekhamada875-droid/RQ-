# RQ — Production Fix Plan (Executor File)

> **STATUS: PHASE 2 IN PROGRESS — P2.1 complete and verified; P1.4 usage-monitoring owner action remains pending** &nbsp;|&nbsp; Last updated by: ChatGPT &nbsp;|&nbsp; Date: 2026-10-25
>
> This file is a **work order and a live progress sheet**. The AI that executes it (ChatGPT) must keep it updated as it works. See "Executor Contract" below.

Project: `tarekhamada875-droid/RQ-` (Arabic-only garage-management PWA)
Stack: React 19 + Vite (Cloudflare Pages) → Hono Worker (Cloudflare) → Firebase Auth + Firestore
Reviewed by: Claude, from the ZIP of the `main` branch (538 files). **I read the code; I did not run the app or its tests.** Every "before" snippet below was copied from the real files. Line numbers may drift, so always match by text, not by line number.

---

## 0. For the owner (plain words)

You do not need to understand the code. Do these three things:

1. Give this file to ChatGPT together with the project (a ZIP, or open it in Codex / Claude Code / Cursor so it can edit the real repo).
2. Paste this message to ChatGPT:

   > Open `docs/UI_PERFORMANCE_PLAN.md`. You are the executor. Read the "Executor Contract" first and obey it exactly. Start at Phase 0. Do one task at a time. After each task, update the Progress Tracker and the Execution Log in that same file. Stop at the end of each phase and show me the updated tracker. If anything does not match the file, stop and ask me; do not improvise.

3. Answer the 5 decisions in section 2 (ChatGPT will ask you). A "default" is given for each.

Things only **you** can do (ChatGPT cannot): they are marked **OWNER ACTION**.

---

## 1. Executor Contract (rules ChatGPT must follow)

1. **Work in order.** Phase 0 → 1 → 2 → 3 → 4 → 5. Do not skip ahead. Phase 6 is a backlog: **do not do it.**
2. **One branch per phase** (`fix/phase-1-quota`, `fix/phase-2-dead-code`, …), **one commit per task**, commit message `P<phase>.<task>: <what>`.
3. **Match by text, not line numbers.** If a "BEFORE" snippet does not exist exactly as written, **STOP**, mark the task `[!]`, write what you found in the Execution Log, and ask the owner. Never guess or "adapt".
4. **Verify every task.** Each task lists verification commands. A task is `[x]` only when they pass. Paste a short result (pass/fail + counts) in the Execution Log.
5. **At the end of every phase run:** `npm run lint` · `npm test` · `npm run ci:check`. Phase 3 also: `npm run test:rules`. All must pass before the next phase.
6. **Do NOT change:** any Arabic text, layout, RTL behaviour, colours, or screens; financial transaction logic (`server/domain/*`, check-in/check-out/refund transactions, credit grants, idempotency, reports); package versions; add no new dependencies; no refactors that are not listed here.
7. **Tests:** delete a test only when this file says so (because it tests code being deleted). Never weaken or skip a test to make it pass. If a test fails for an unlisted reason, **STOP and report**.
8. **Never** run anything against the production Firebase project. Use the emulators / fixtures that the repo already provides. Never print or commit secrets.
9. **Update this file after every task** (this is mandatory):
   - In the Progress Tracker (section 4): change `[ ]` to `[x]`, fill **Date**, **Commit** (short hash), **Notes**.
   - Add a row to the Execution Log (section 12).
   - Update the top line `STATUS:` (e.g. `PHASE 2 IN PROGRESS`).
   - Status marks: `[ ]` not started · `[~]` in progress · `[x]` done and verified · `[!]` blocked (write why) · `[-]` skipped by owner decision (write which decision).
10. **Report format at the end of each phase** (3–6 lines): what changed, files deleted (count), lines removed, test results, anything the owner must decide.

---

## 2. Owner decisions (ChatGPT must ask these in Phase 0 and record the answers)

| ID | Question | Default if owner says "I don't know" |
|----|----------|--------------------------------------|
| **D1** | Does the production Firebase database contain **real customers** (real garages with real PINs)? | **NO** (pre-launch, only test data). If YES → task P4.2 is skipped (`[-]`). |
| **D2** | Is the Cloudflare Worker `rq` on the **Free** plan or the **Paid** ($5/month) plan? | Owner does not know; ChatGPT inspected the connected account and found Worker `rq`, but the subscription endpoint returned 403 because the connection lacks Billing Read permission. Keep unknown; do not upgrade or change billing. Recheck through an authorized billing view (P4.3). |
| **D3** | Must a garage tablet stay logged in **more than 24 hours**? (Today a session appears to end 24 h after login even if active.) | Owner did not understand the technical distinction; safe decision: keep current 24-hour behavior unchanged for now, and verify whether it inconveniences pilot garages before extending it. |
| **D4** | Is any **old installed copy** of the app, or any other program, still calling the old billing endpoints? | Owner believes YES. Do **not** delete the 410 compatibility tombstones yet. First search code and available request/traffic logs for callers; remove only after evidence confirms it is safe. Update P2.4 accordingly. |
| **D5** | Do you want **coupons** (discount codes)? There is no screen for them. | **NO** → P2.3 deletes the feature. |

**Recorded owner answers (2026-10-25):** D1 = NO real customer data · D2 = UNKNOWN (Cloudflare billing permission unavailable) · D3 = preserve current behavior pending pilot evidence · D4 = likely YES, investigate before removing compatibility routes · D5 = NO coupons.

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
| F7 | Old PIN formats still accepted: **plain-text PIN** and a single hard-coded salt `ark_garage_secure_pin_salt_2026` | `server/utils.ts` | Weak; the repo is **public**, so the salt is public |
| F8 | ~25 unused files/functions (listed in Phase 2). Retired routes return 410 (harmless but clutter). Coupons feature has routes but no screen. | many | Confusing for the next developer/AI |
| F9 | `docs/ui-opt-01-baseline/` = 113 files / 1.7 MB of old screenshots, **English-language** screens of an Arabic-only app | `docs/` | Clutter; regenerated by tools |
| F10 | AI Studio template leftovers: `metadata.json`, `firebase-blueprint.json`, `GEMINI_API_KEY` in `.env.example`, `https://aistudio.google.com` + localhost hard-coded in the production CORS allowlist | root, `server/cloudflareWorker.ts` | Cleanup / hardening |
| F11 | The GitHub repo is **public** and was edited by three AI agents | GitHub | Owner action in P4.4 |

**Good news (do not break these):** all retired billing routes are harmless tombstones (HTTP 410), not working code; duplicate-request protection (idempotency), PIN rate-limiting (Durable Object), and 19k lines of tests are solid.

**Not verified by me:** I did not run the app, tests, or emulators. Free-plan limits quoted (50,000 reads/day, 20,000 writes/day) are from my knowledge — **check the current Firebase pricing page**. I did not find the page size used by the delegate dashboard.

---

## 4. Progress Tracker (ChatGPT updates this)

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
| P1.4 | Usage monitoring setup (OWNER ACTION) | low | [ ] | | | |
| P2.1 | Delete dead files (+ their tests) | low | [x] | 2026-10-25 | 7dde9ad | PR #401 merged as 2af758a; Production Gate run #40207192163 passed. Removed 11 audit-listed dead files and retired their dependent test cases/imports. Deploy jobs skipped; no production deployment. |
| P2.2 | Delete dead functions/methods | med | [ ] | | | |
| P2.3 | Remove coupons feature (D5) | low | [ ] | | | |
| P2.4 | Investigate old billing endpoint callers; remove tombstones only when safe (D4) | med | [ ] | | | Owner believes old copies may still call these routes; retain HTTP 410 compatibility until evidence says safe |
| P2.5 | Remove screenshot clutter from `docs/` | low | [ ] | | | |
| P2.6 | Remove AI Studio leftovers | low | [ ] | | | |
| P3.1 | Remove browser session-write fallback | **high** | [ ] | | | |
| P3.2 | Lock Firestore rules (browser = read-only) | **high** | [ ] | | | |
| P3.3 | Close `admin_settings` wallet read | med | [ ] | | | |
| P3.4 | Update rules tests; deploy rules (OWNER ACTION) | **high** | [ ] | | | |
| P4.1 | CORS allowlist cleanup | low | [ ] | | | |
| P4.2 | Remove legacy PIN formats (needs D1 = NO) | **high** | [ ] | | | |
| P4.3 | Check Worker plan / CPU (OWNER ACTION, D2) | med | [ ] | | | |
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

### P1.4 Usage monitoring (OWNER ACTION — ChatGPT cannot do this)

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

**e) DO NOT delete automatically — "REVIEW" list.** These have **no production caller** but **do** have tests. They might be a screen that is missing or wired under another name. For each, ChatGPT must (1) search the Admin UI for a button/screen that should use it, (2) report to the owner in plain words: "No screen uses X. Delete it? yes/no". Record the owner's answer in the Execution Log.
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

### P2.4 Remove the retired-route tombstones (needs D4 = NO)

The live app never calls these (I searched `src` for every path). They only answer "410 retired". Removing them shrinks the API surface.

**`server/financialRoutes.ts` — delete from the comment "Legacy recharge-request endpoints…" through the `admin-topup-balance` handler:**
```ts
// Legacy recharge-request endpoints remain authenticated for compatibility, but no longer
// inspect request payloads or access request records. New prepaid grants use their own routes.
const retiredRechargeRequest = (allowedRoles?: string[]) => async (c: any) => {
  const user = c.get('user');
  if (allowedRoles && !allowedRoles.includes(user?.role)) return c.json({ success: false, error: 'FORBIDDEN' }, 403);
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
};

const retireRechargeCreation = retiredRechargeRequest(['garage', 'delegate']);
const retireRechargeAdminAction = retiredRechargeRequest(['admin']);
const retireRechargeHistory = retiredRechargeRequest(['admin']);
const retireMyRechargeHistory = retiredRechargeRequest();
app.post('/api/recharge-requests/create', requireWorkerAuth, enforceWorkerFinancialRateLimit, retireRechargeCreation);
app.post('/api/recharge-requests', requireWorkerAuth, enforceWorkerFinancialRateLimit, retireRechargeCreation);
app.post('/api/recharge-requests/process', requireWorkerAuth, retireRechargeAdminAction);
app.post('/api/transactions/approve-recharge-request', requireWorkerAuth, retireRechargeAdminAction);
app.post('/api/recharge-requests/reject', requireWorkerAuth, retireRechargeAdminAction);
app.post('/api/transactions/reject-recharge-request', requireWorkerAuth, retireRechargeAdminAction);
app.get('/api/recharge-requests', requireWorkerAuth, retireRechargeHistory);
app.get('/api/recharge-requests/my', requireWorkerAuth, retireMyRechargeHistory);

// Retired owner-wallet endpoint remains an authenticated compatibility tombstone.
app.post('/api/transactions/admin-topup-balance', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
});
```
If `enforceWorkerFinancialRateLimit` is no longer used anywhere after this, leave it (lint will not complain about an exported/used-elsewhere symbol; only remove if lint flags it).

**`server/garageRoutes.ts` — delete these three blocks:**
```ts
// The old time-based trial decision workflow is retired. Trial eligibility is represented by server-owned credits.
app.post('/api/garages/trial-decision', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'TRIAL_DECISION_WORKFLOW_RETIRED' }, 410);
});
```
```ts
// Retired role endpoints remain as explicit, non-mutating tombstones for old clients.
app.post('/api/supervisors/create', requireWorkerAuth, (c) => c.json({ success: false, error: 'ROLE_RETIRED' }, 410));
app.post('/api/supervisors/update', requireWorkerAuth, (c) => c.json({ success: false, error: 'ROLE_RETIRED' }, 410));
app.post('/api/supervisors/delete', requireWorkerAuth, (c) => c.json({ success: false, error: 'ROLE_RETIRED' }, 410));
```
```ts
// Legacy Admin recharge is retired; prepaid credit grants remain available via /api/garages/:id/credit-grants.
app.post('/api/transactions/recharge-garage', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
});

// Retired owner self-subscribe and referral-day endpoints remain authenticated compatibility tombstones.
app.post('/api/transactions/garage-self-subscribe', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
});

app.post('/api/transactions/use-referral-reward', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
});
```
**Owner decision update (2026-10-25):** the owner believes old installed copies may still call these routes. Therefore **do not delete the tombstones in this task by default**. Search all current client code for calls and inspect available Cloudflare request/analytics logs for evidence of external callers. Record what can and cannot be established. Keep the explicit authenticated HTTP 410 responses until the owner can confirm the old copies are retired or available traffic evidence supports removal. If caller activity cannot be determined, mark this task `[!]` / blocked rather than guessing. Do not change the active prepaid-credit routes listed below.

**Tests:** keep existing 410 compatibility assertions while tombstones remain. Only change those tests if the owner later confirms removal is safe and the corresponding routes are actually deleted.

**Do NOT delete** (these are the real, active routes): `/api/garages/:id/credit-grants`, `/api/garages/:id/credit-ledger`, `/api/admin/packages/*`, `/api/garages/:id/extend-fair-use`, `/api/check-subscriber`, `/api/subscribers/*`, `/api/vehicles/*`, `/api/delegates/*`, `/api/staff/*`.

**Verify:** `grep -rn "recharge-requests\|admin-topup\|recharge-garage\|garage-self-subscribe\|trial-decision\|use-referral-reward\|supervisors/" src server tools` → only test files/docs mention at most. `npm run lint && npm test`.

---

### P2.5 Remove screenshot clutter from `docs/`

**Delete folders** `docs/ui-opt-01-baseline/` (113 files, 1.7 MB, includes **English** screenshots of an Arabic-only app) and `docs/ui-opt-01-fixture-smoke/` (6 files). They are regenerated by two tools; only the default output folder must move.

**`tools/browser-baseline.mjs`** BEFORE → AFTER (change only the folder string):
```js
// BEFORE
const outputDir = resolve(process.env.RQ_BASELINE_DIR || join(root, 'docs/ui-opt-01-baseline'));
// AFTER
const outputDir = resolve(process.env.RQ_BASELINE_DIR || join(root, 'tmp/ui-baseline'));
```
**`tools/ui-fixture-browser-smoke.mjs`**: replace the substring `'docs/ui-opt-01-fixture-smoke'` with `'tmp/ui-fixture-smoke'` (keep the rest of the line).

**`.gitignore`** — append:
```
# Generated UI baseline / smoke output
tmp/
```
**Keep** the other 5 files in `docs/` and `docs/testing/` (they are the project's real guidance: PROJECT, SECURITY, OPERATIONS, RELEASES, UI_PERFORMANCE_PLAN).

**Verify:** `grep -rn "ui-opt-01" . --include=*.ts --include=*.mjs --include=*.md --include=*.json -l | grep -v node_modules` → no results (update any doc link that still points to the deleted folders). `npm run ci:check`.

---

### P2.6 Remove AI Studio template leftovers

1. Run `grep -rn "metadata.json\|firebase-blueprint" . -I --exclude-dir=node_modules --exclude-dir=.git`. In my scan nothing referenced them. If still nothing: **delete** `metadata.json` and `firebase-blueprint.json`. If something references them → leave them and report.
2. `.env.example` — delete these three lines (the app has no AI feature):
```
# GEMINI_API_KEY: Required for Gemini AI API calls.
# AI Studio automatically injects this at runtime from user secrets.
GEMINI_API_KEY="MY_GEMINI_API_KEY"
```
3. The CORS list is handled in P4.1.

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

### P4.1 CORS allowlist: production origin only

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

### P4.2 Remove old PIN formats (only if D1 = NO; otherwise mark `[-]`)

Today the server also accepts (a) a 64-character hash made with one shared hard-coded salt and (b) a **plain-text** PIN. Good news: when someone logs in with an old format, the server upgrades it to the modern format (`migratePinToHash` in `server/cloudflareWorker.ts`). So if there are no real customers (D1 = NO), the old branches can simply go. If you ever restore old data, accounts with old-format PINs would stop logging in.

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

### P5.2 Manual walkthrough (OWNER with ChatGPT's checklist, on the **preview** project first)
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

### P5.4 Staged pilot (OWNER + ChatGPT)
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

## 12. Execution Log (ChatGPT appends one row per task — do not leave blank when done)

| # | Date | Task ID | What was done (1–2 lines) | Files changed (+/−) | Commands run and result | Commit | Problems / questions for owner |
|---|------|---------|---------------------------|---------------------|-------------------------|--------|-------------------------------|
| 1 | 2026-10-25 | P0.4 | Recorded owner decisions: no real customer data; Cloudflare billing tier unknown because Billing Read is not authorized; keep current session behavior pending pilot feedback; investigate old billing endpoint callers before removing 410 compatibility routes; remove coupons. | plan updated | Cloudflare account and Worker list read successfully; subscription query returned 403 due missing Billing Read permission | pending | Need authorized billing visibility for D2; do not remove legacy billing tombstones until caller safety is established. |
| 2 | 2026-10-25 | P0.1/P0.2 | Baseline application validation and exact CI command verified. | workflow only | Run #40188951017 passed baseline Production Gate steps on app source commit `0f2b3759379a22f04572cd192474cc77e018873a`; run #40198933303 then passed exact `npm run ci:check` on PR #391. | 8e5cd17 | Application source unchanged; no production deployment was performed by this verification. |
| 3 | 2026-10-25 | P0.3 | Recorded measured source/test/file counts and documented the original `find` precedence issue. | workflow + plan updated | Run #40198933303: corrected non-test TS/TSX lines 30,526; test-file lines 19,309; tracked files 498; broad find excluding `node_modules` 595. The plan's ungrouped expression returned 41,545 and is not a valid non-test count. | 8e5cd17 | Use tracked files and corrected grouped source count as the baseline. |
| 4 | 2026-10-25 | P0.2/P0.3 | Phase 0 baseline evidence consolidated in canonical plan; marked Phase 0 complete. | `docs/UI_PERFORMANCE_PLAN.md` updated | Exact `npm run ci:check` passed; all baseline metrics recorded from workflow run #40198933303. | pending | Temporary verification workflow should be removed after this evidence is merged; no application code changed. | |
| 5 | 2026-10-25 | P1.1 | Reduced session heartbeat from 5 to 15 minutes and changed the visible-tab resume threshold to 10 minutes; updated the interval regression test. | `src/hooks/useGarageSession.ts`, `src/hooks/useGarageSession.test.tsx` | Production Gate run #40199945696 passed (typecheck, full suite, build/artifact checks); PR #395 merged to `main`. | ff70579 | No owner action needed for this task; no production deployment. |
| 6 | 2026-10-25 | P1.2 | Reduced delegate dashboard polling from 15 seconds to 120 seconds, paused periodic polling while the document is hidden, and added regression coverage for interval and visibility behavior. | `src/hooks/useGarageSync.ts`, `src/hooks/useGarageSync.test.tsx` | Production Gate run #40200933260 passed (typecheck, full suite, Firestore rules, production build and artifact checks); PR #397 merged to `main`. Deploy jobs skipped; no production deployment. | 5dcf0d4 | No owner action needed for this task; no production deployment. |
| 7 | 2026-10-25 | P1.3 | Removed the unused `subscribeToGarages` and `subscribeToDelegateGarages` methods and their now-unused imports; removed the obsolete test that only exercised the deleted delegate listener. | `src/services/garageService.ts`, `src/__tests__/delegateScopeIsolation.test.ts` (deleted) | Production Gate run #40201555729 passed; PR #399 merged to `main` as `e466f2a073ed0b6e8ebe9a3c0b302adeda28b351`. Deployment jobs skipped; no production deployment. | caffcff | No owner action needed for code cleanup; usage monitoring setup is the next owner action. |
| 8 | 2026-10-25 | P2.1 | Removed audit-listed dead files and only the obsolete tests/imports that depended on deleted code. The first run caught two unused imports; they were removed and the corrected commit passed the full Production Gate. | 11 files deleted; 2 test files adjusted | Initial run #40207028434 failed typecheck on unused `act` and `SystemConfig`; corrected commit passed Production Gate run #40207192163. PR #401 merged to `main` as `2af758a73db7eca5d03461a3d7aa43d13fe44bb9`; deployment jobs skipped. | 7dde9ad | No production deployment. P1.4 Firebase Usage monitoring owner action remains pending. |

## 13. Owner Q&A / decisions log (ChatGPT asks, owner answers; keep a record)

| Date | Question from executor | Owner's answer |
|------|------------------------|----------------|
| 2026-10-25 | Does production Firebase have real customer data? | No, there is no real customer data. |
| 2026-10-25 | Which Cloudflare Worker plan is active? | Owner does not know; authorized Cloudflare connection could list Worker scripts but subscription details returned 403 due missing Billing Read scope. |
| 2026-10-25 | Should garage tablets remain logged in beyond 24 hours? | Owner did not understand the technical distinction; keep existing behavior for now and reassess from pilot evidence. |
| 2026-10-25 | Are old app copies still calling retired billing endpoints? | Owner believes they may be; investigate before deleting compatibility tombstones. |
| 2026-10-25 | Should discount coupons exist? | No; remove the unused coupon feature as proposed. |

## 14. Final sign-off (fill in at the very end)

- Phases 0–5 all `[x]` or `[-]` with reasons: ☐
- Lint / tests / rules tests / ci:check all green on the final commit: ☐ (commit: ________)
- Manual walkthrough passed on production: ☐
- Repo private + secrets rotated: ☐
- Pilot stage reached: ____ garages · peak writes/day: ____ · peak reads/day: ____
- Executor's closing note (what was NOT done and why):