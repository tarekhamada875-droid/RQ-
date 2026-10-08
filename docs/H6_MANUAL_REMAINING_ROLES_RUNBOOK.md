# H6 Manual Runbook — Remaining Role Checks

**Prepared:** 2026-10-08 for the next manual acceptance session
**Scope:** Staff, Supervisor, and Garage Owner only, on the isolated pre-production preview
**Authority:** This is a quick field checklist subordinate to [`H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md`](H6_CONTROLLED_ACCEPTANCE_RUNBOOK.md). If there is a conflict, follow the controlled runbook and the latest status in [`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`](../RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md).

## Goal for the session

Work only the remaining role blockers. Reuse the recorded bounded Admin PASS and prior Delegate evidence; do **not** repeat those flows without a change that invalidates them. A blocked precondition is a valid stopping point—record it as **BLOCKED**, rather than creating an account, changing policy, or performing a risky write just to keep going.

This guide cannot guarantee completion in one session or prove the app is bug-free. H6 stays **OPEN/BLOCKED** until its required matrix is reconciled; H7 stays **HOLD/NO-GO** while required gates remain open.

## Current known state — do not overwrite with older notes

- **Staff:** one synthetic `Mobile QA Staff` row was later found in `QA Garage Beta`; its PIN was masked. Transport reconciliation is **PARTIAL**. Staff login and operational access are **OPEN/BLOCKED**. No usable Staff credential or confirmed active-trial test context is recorded.
- **Supervisor:** the global-versus-assigned-garage read policy has no recorded owner decision. Source evidence shows a global garage-list read but narrower Hono detail/summary denial. Do not open or inspect an unfiltered garage list before policy and data-scope are resolved.
- **Garage Owner:** one live synthetic hourly check-in for `H6 Owner Listener 20261008` using the prior synthetic plate was attempted once and is **OPEN/UNVERIFIED**. Do not repeat it. The fixture later disappeared from a fresh Admin list after deletion UI progress reached 50%; cleanup is **PARTIAL**, not confirmed job completion.
- **Already covered:** Admin has a bounded login/dashboard/read-only-navigation/logout PASS. Delegate login/session evidence exists for its documented synthetic fixtures. Keep these scoped; don't replay them just to create fresh evidence.
- **Automation:** the optional Playwright smoke covers only the unauthenticated shell and read-only Worker health/version calls. It is not a role test and closes no role cell.

## Stop rules — apply to every section

1. Use only the exact migration Pages preview and isolated `rq-hono-preview` Worker. Never use production, `main`, live Firestore rules, real users, or real financial data.
2. Verify that the Pages deployment is the candidate being tested and its API origin is the isolated preview Worker. If the deployment identity or pairing cannot be verified, stop and mark the Pages-to-Worker gate **BLOCKED**.
3. Use a fresh private browser context per role. Never ask the user to send a PIN/token or write one into notes, screenshots, reports, browser state files, or chat. Enter credentials privately in the app.
4. Do not create or delete accounts, reset PINs, alter timeouts/permissions, or create a fixture unless its identity, scope, authorization, no-financial side effects, and supported cleanup path are established first.
5. If a write spins, times out, returns an unclear result, or conflicts with the expected screen, stop. Do not click again, reload to replay it, change the payload, or infer success. Record **OPEN/UNVERIFIED** and use only approved read-only reconciliation.
6. If any screen reveals an unexpected/unassigned record or real/personal information, do not inspect, copy, or screenshot it. Stop that case, log out if safe, and mark it **BLOCKED**.
7. No payment, recharge, wallet/balance change, transfer/settlement, package/subscription purchase/renewal, or financial reward flow. Cancel before confirming any action that would perform one.

## 0. Preflight — do this once

1. **Read the current state.** Re-read the handoff and the current H6 matrix. Confirm the active branch, current HEAD, worktree, and exact-head GitHub Actions status. Do not assume the recorded SHA is still HEAD.
2. **Verify deployment pairing.** In the Cloudflare Pages deployment view, confirm the stable migration preview serves the candidate commit. Confirm its API origin is exactly `https://rq-hono-preview.tarekhamada875.workers.dev`; the production Worker is out of scope. If either identity is unavailable, stop.
3. **Check the endpoints without credentials.** The documented opt-in smoke may be run from the repository root:

   ```sh
   RQ_E2E_BASE_URL=https://migration-unified-hono.rq-acg.pages.dev npm run test:e2e:preview
   ```

   This checks the generic login shell and GET-only `/api/health` and `/api/version` calls to the isolated Worker. A pass is a **smoke only**, not a role-acceptance result or proof that Pages serves the candidate commit.
4. **Start a fresh private browser context** at `https://migration-unified-hono.rq-acg.pages.dev`. Confirm the generic login screen appears. Do not reuse stored sessions.
5. Create a private run note with date and a safe alias such as `H6-20261009-<run-id>`. Record only synthetic aliases; never record PINs, tokens, raw session IDs, phone numbers, plates, or payloads.
6. Before each role, confirm the account is synthetic, its garage scope is known, and the intended scenario/cleanup path is safe. If not, mark the scenario **BLOCKED** and move on.

## 1. Staff — attempt only if both prerequisites exist

### 1A. Read-only precheck

1. Through the supported Admin UI, open the documented synthetic `QA Garage Beta` details and its Staff panel.
2. Confirm whether the `Mobile QA Staff` row is still present. Do not reveal, copy, reset, or rotate its masked PIN. Do not create another Staff identity, replay the earlier Staff-create request, change the Staff timeout, or delete the row.
3. Through the supported UI, verify whether the garage is currently an active synthetic free-trial context. Do not buy a package, top up a balance, or change the trial to make it eligible.
4. Proceed only if **both** are true: (a) the trial context is active and synthetic; and (b) the operator already has an owner-authorized credential for this Staff identity available to enter privately. Otherwise record **BLOCKED — no usable Staff credential or valid trial context** and stop Staff testing.

### 1B. Login and scope — one attempt

1. Open a fresh private context at the verified Pages preview.
2. Enter the existing synthetic Staff credential privately through the supported login UI and submit **once**.
3. If the request is ambiguous or times out, do not retry; record **OPEN/UNVERIFIED** and stop.
4. On success, verify the visible identity is Staff and the dashboard is for `QA Garage Beta` only. Verify the visible garage scope against the UI, not a PIN or a local-storage label.
5. Confirm owner/admin/delegate/supervisor-only controls are absent or safely unavailable. Do not click submit on any destructive, financial, management, or cross-garage action.
6. Refresh once. Confirm the same Staff role and garage scope remain. Use Back after logout to confirm protected data is no longer visible.

### 1C. Operational access beyond the zero-balance gate — conditional

A dashboard/login alone does not prove operational access. Attempt one operational action **only** if an already-approved active-trial fixture, a fresh synthetic test item, and a safe supported cleanup path are available.

1. Choose one permitted non-financial Staff workflow from the existing matrix (for example, a single check-in using a new run-specific synthetic vehicle). Do not reuse the previous Owner test item or fixture.
2. Before submitting, inspect the UI. If it asks for payment, recharge, top-up, package purchase, balance change, or a monetary confirmation, cancel and mark that action **BLOCKED**.
3. Submit the eligible synthetic action exactly once. Verify the visible result is scoped to `QA Garage Beta`, has Staff attribution, and produces exactly one expected item. Record safe route/status/correlation metadata only if available through an approved source.
4. If the result is unclear, stop—no retry. If cleanup would require a financial write or its supported path is uncertain, do not start the mutation; if already started, leave it **OPEN** and report the exact synthetic alias for safe cleanup planning.
5. Check-out, correction/deletion, subscriber creation, and cross-garage denial are separate matrix cells. Do not infer them from one successful check-in; leave any untested cell **NOT RUN/BLOCKED**.
6. Log out through the supported UI. Confirm the generic login returns and protected Staff data is not visible after Back/refresh.

**Staff PASS bar:** role login/session, correct garage scope, persistence/logout, and at least the required safe operational action must have both visible and approved technical evidence. If only the login/read-only dashboard is verified, record **PARTIAL**, not operational PASS.

## 2. Supervisor — pause for the policy decision first

### 2A. Record the product policy

Before Supervisor garage-scope testing, the owner must explicitly select and record one policy:

- [ ] **Assigned-only:** Supervisor may see only explicitly assigned synthetic garages.
- [ ] **Global:** Supervisor may see the global set; the owner must specify which fields/data are permitted and confirm the pre-production dataset contains no real or out-of-scope records.

If neither decision is made—or if the safe data boundary is unknown—do not open the Supervisor garage list or probe the API. Record **OPEN/BLOCKED — policy/data scope not defined**. Do not change Worker, Firestore, or UI permissions to make a test pass.

### 2B. Restricted session and permitted view

Only after 2A is complete:

1. Use the existing synthetic `QA-Supervisor` identity in a fresh private context. Enter any authorized credential privately. If no valid credential is available, stop as **BLOCKED**; do not reset or create an identity as a workaround.
2. Submit once. On success, confirm the restricted Supervisor dashboard and the explicitly permitted People/Delegates view render.
3. Confirm only synthetic, in-policy rows are visible. Under **assigned-only**, verify the assigned garage is present and the unassigned synthetic garage is absent. Under **global**, inspect only data expressly covered by the owner's recorded scope.
4. **Do not open the current unfiltered `GET /api/garages` response or inspect raw garage documents.** If a visible list unexpectedly includes out-of-policy data, stop without reading its fields; record only the fact of the scope leak and its safe evidence reference.
5. Confirm admin-only navigation (garage creation/deletion, wallet, PIN rotation, global settings, package configuration, settlements, unrelated garage access) is hidden or disabled. Do not submit any management or financial action to test denial.
6. Use only existing technical authorization tests or an approved non-mutating test harness to verify backend denials. If that evidence is unavailable, mark the backend-denial cell **BLOCKED**; do not handcraft privileged requests.
7. Refresh, log out normally, press Back, and confirm the stale session cannot display protected data.

**Supervisor PASS bar:** the owner policy is recorded; the UI data scope matches it; the role/session and permitted reads work; denied actions are verified safely at both UI and technical layers; refresh/logout are safe. If the policy is undecided, keep this role **OPEN** even if login succeeds.

## 3. Garage Owner — listener evidence and cleanup without replay

### 3A. Reconcile the old attempt; do not repeat it

1. In the supported Admin list, perform one fresh read-only check for `H6 Owner Listener 20261008`.
2. If it is absent, record **fresh-list absence only**. Do not delete or recreate that same fixture. If it is present, do not delete it unless it is clearly a fixture created by the current run and its state is understood.
3. The earlier hourly check-in using the prior synthetic plate had no observed success response or listener update. Do **not** retry, refresh-and-resubmit, or probe the record directly in Firestore. Its outcome remains **OPEN/UNVERIFIED**.
4. The prior deletion UI reached 50% and the fixture later disappeared from the list. That is **PARTIAL cleanup evidence**, not proof of the background deletion job's completion. Do not run another delete merely to obtain a cleaner status.

### 3B. Owner session and mobile shell

1. Continue only with an existing authorized synthetic Garage Owner credential and a verified synthetic garage. If no usable credential/fixture is available, mark **BLOCKED**; do not reset PINs or create a new garage just to proceed.
2. In a fresh private context, log in once through the verified Pages preview. Confirm the Owner identity and exactly its own garage scope.
3. Reuse the prior desktop reload-persistence PASS unless a relevant code/deployment change invalidated it. Do not repeat login solely for new evidence.
4. If mobile coverage is still required and a session is safely available, use a real test phone or 390×844 portrait/touch viewport. Check dashboard fit, navigation/drawer, one non-mutating modal open/close, keyboard/loading behavior, and logout. Do not change language, package, trial, balance, or account settings to force a result.

### 3C. Live listener — only with an approved harmless synthetic event

The listener check is not safe to improvise. Continue only if the owner has approved a supported change that (a) touches a document/event the Owner listener actually subscribes to, (b) uses a new run-specific synthetic fixture, (c) has no financial/payment side effect, and (d) has a known supported cleanup path. If any condition is missing, leave the listener cell **OPEN/BLOCKED**.

If all conditions are met:

1. Write down the new synthetic fixture alias and the exact expected listener-visible change before acting. Never reuse the old fixture or its previous plate value.
2. Record the baseline view/count in the app. Use only the supported UI to submit the single approved synthetic change once.
3. Observe the visible response and the same subscribed view/count. A successful connection, a spinner ending, or HTTP 200 by itself is **not** listener delivery. The expected change must appear once in the correct Owner scope and persist after a safe refresh.
4. If there is no response, no event, duplicate state, unexpected scope, or timeout, stop. Do not repeat the action. Reconcile only by approved read-only correlation/operation metadata; if unavailable, mark **OPEN/UNVERIFIED**.
5. Log out through the supported UI.
6. Clean up only fixtures created by this run, through the supported UI. Wait for an explicit successful response or documented job-completion evidence, then confirm absence in a fresh list. The 30-second client wait does not prove an asynchronous deletion job completed. If only list absence is observable, record **PARTIAL cleanup** and stop—no second delete.

**Owner PASS bar:** use the prior scoped login/reload evidence where still valid. Mark listener delivery PASS only when the approved event visibly arrives once, is correctly scoped, persists, and has safe technical evidence. Preserve old ambiguous attempt and partial cleanup as such.

## 4. Financial and deferred cases — leave blocked

Do not perform payment, recharge submission/approval, wallet top-up, balance change, transfer/settlement, package/subscription purchase/renewal, or financial reward testing in this run. Keep those cells **OPEN/BLOCKED — no authorized isolated financial sandbox**. The same applies to any role action whose visible confirmation would create one of those changes.

Do not try to close the entire feature matrix by rushing through every screen. After Staff, Supervisor, and Owner blockers, list the remaining NOT RUN/BLOCKED cells from the integrated matrix (including relevant cross-garage, offline/retry, audit/history, subscriber/vehicle, and mobile/PWA cases) for a separate safe pass.

## 5. Closeout — copy this for each case

```text
Run alias/date:
Candidate commit:
Pages deployment identity / Worker version:
Role alias / synthetic fixture alias:
Scenario:
Precondition and policy (if Supervisor):
Visible action and result:
Safe technical evidence (route/status/correlation, if available):
Scope/persistence result:
Cleanup evidence:
Status: PASS / FAIL / BLOCKED / OPEN-UNVERIFIED / NOT RUN / N/A
Reason or defect severity:
Next bounded action:
```

Before stopping: log out of each successful role through the supported UI; verify current-run fixtures are either confirmed removed or explicitly **OPEN/PARTIAL**; do not include credentials or raw payloads; reconcile the matching rows in the existing role and integrated reports. A successful manual session does not by itself close technical authorization or data-scope evidence. If any required cell remains open, report H6 **OPEN/BLOCKED** and keep H7 **HOLD/NO-GO**.
