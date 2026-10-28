# RQ app-wide workflow audit — 2026-10-22

## Executive summary

This is a **read-only audit** of the app at commit `690907b` on `main`. The working tree was clean before the audit. No source code, production data, deployment, PR, or commit was changed.

The review traced shared authentication/session behavior and the Admin, Garage owner, Delegate, and Staff journeys. It found several confirmed workflow and state-consistency defects, plus risks that need targeted tests or a product decision. The important conclusion is that some apparent Admin problems are actually caused by **shared state/session code**: fixing only the Admin screen would leave the same behavior in other roles, and could create new regressions.

The right order is to establish reliable session/role ownership and prevent old asynchronous work from updating a new role’s screen; then repair role-specific workflows; then complete language coverage and address optional service/security contracts. Each bounded change should have cross-role tests before merge. This audit does not restart the skipped broad Reliability/Scale or legacy-data-cleanup workstreams and does not recommend speculative performance optimization.

The owner clarified that one Admin credential/operator may use multiple devices. **No single-device restriction is needed or recommended.**

## What I found, in plain language

### A. Shared foundations — fix these before screen-level polish

1. **A fast logout followed by login can overlap the old session release with the new login.** Logout clears the screen immediately, while server release and Firebase sign-out continue asynchronously. A quick login reuses the same browser session identifier. The release path performs several server writes, so an old release may race a fresh claim. The exact impact is not proven in production, but the ordering window is real. Use a guarded release/claim sequence and make server release conditional/atomic for the exact session. Preserve remote-kick behavior, which intentionally does not release a record.
   - Evidence: `src/hooks/useGarageSession.ts:109-138`; `src/hooks/useAdminAndGarageManagement.ts:84-126`; `src/services/authSessionService.ts:136-145`; `server/cloudflareWorker.ts:999-1025`.

2. **Old role data can remain visible after logout or switching garages/roles.** The hook clears the saved identity but not all in-memory vehicles, today’s transactions, staff, and paginated Admin/Delegate lists. The next screen can render old data while new subscriptions/pages load; some Admin cursors can remain stale longer. Make data explicitly belong to `(role, entity, session)`, clear it before showing the next protected view, and ignore late results from the previous owner.
   - Evidence: `src/hooks/useGarageApp.ts:68-74`; `src/hooks/useGarageSession.ts:109-123`; `src/hooks/useGarageSync.ts:75-103,114-166`; `src/store/appStore.ts`.

3. **A throttled vehicle update can fire after its listener was removed.** Unsubscribing the Firestore listener does not cancel the pending trailing timer in the throttle helper. A late callback from Garage A could replace the list after switching to Garage B. Add cancellation or an effect-local “still current” guard, together with the owner-reset above.
   - Evidence: `src/hooks/useGarageSync.ts:75-88`; `src/utils/index.ts:424-450`.

4. **Session readiness has mixed failure behavior.** The Worker is authoritative, but the client can attempt a legacy Firestore transaction fallback after server claim/validation errors. Current Firestore rules appear to block that fallback, so a bypass was not demonstrated; it is still a second, inconsistent authority path. Separately, an unclassified initial claim failure can mark the session “ready,” allowing a protected shell to render. Make initial protected readiness wait for confirmation; distinguish a definite invalid session from a temporary network failure; remove or test-gate the browser-write fallback. Do not log users out just because an established session has a temporary network outage.
   - Evidence: `src/services/authSessionService.ts:89-133`; `src/hooks/useGarageSession.ts:293-315`; Worker role/session enforcement in `server/cloudflareWorker.ts:504-520`.

5. **An authoritative “session is invalid” refresh result is not acted on immediately.** The service logs `valid:false` but returns no result to the coordinator, which updates its local “last heartbeat” timestamp anyway. This can leave a stale screen until a later protected API request forces logout. Return a clear valid/invalid/transient result and log out only on a confirmed invalid result.
   - Evidence: `src/services/authService.ts:86-102`; `src/services/authSessionService.ts:147-165`; `src/hooks/useGarageSession.ts:317-343`.

6. **Malformed saved login data can leave a protected screen spinning indefinitely.** A bad but non-empty localStorage value can be treated as “still hydrating” even when parsing produced no usable identity. Validate persisted objects and recover to login rather than waiting forever.
   - Evidence: `src/hooks/useGarageSession.ts:257-279`; `src/utils/index.ts:291-300`; `src/App.tsx:77-80`.

7. **The shared logout-PIN attempt counter leaks between roles/accounts.** Failed attempts are saved globally in localStorage; closing the challenge after the attempt limit does not necessarily reset or scope that value. A later user/role in the same browser can inherit the exhausted counter. Keep the intended attempt limit, but scope it to the active challenge/session and define when it resets.
   - Evidence: `src/components/modals/LogoutConfirmModal.tsx:19-21,47-68,90-104`; logout cleanup at `src/hooks/useGarageSession.ts:109-123`.

### B. Role-specific workflow defects

#### Admin

- **Successful changes leave dashboard lists stale.** Approving/rejecting a garage, creating a garage/delegate, and editing a garage in a detail screen do not consistently reconcile the paged lists/counts. Refresh the affected collection only after success and reset its cursor; do not refresh or remove rows after a failed mutation.
- **Search and pending counts represent only loaded pages.** The UI can report no match or an understated pending count when the matching/request row is on a later page. Either use a scoped Worker search/count or clearly load the required pages. Tests should use more than 50 records.
- **A saved `trial_leads` tab can render an empty workspace.** Reset this retired tab value to Overview when reading browser state; do not touch user data.
- **The package validation dialog is not connected.** The dashboard mounts it, but the package view does not call the passed setter. Wire validation errors to it or remove the dead UI path.
- **The Supervisor flow contradicts itself.** The Worker rejects the retired role, while the client still accepts the PIN role result and maps it to Admin UI; a shared session effect then logs out any non-null Supervisor. Because this may be intentionally retired, first make the product policy explicit: keep it retired and consistently reject/remove its UI path, or restore it deliberately with scope tests. Do not delete preserved Supervisor records as part of this.
- **English/RTL is incomplete.** Overview, People, Active Sessions and some settings remain Arabic/RTL after English is selected. Translate UI chrome and localize direction; preserve user-entered Arabic names/content and intentionally LTR values.
- **Admin detail reads can race.** A slow garage/delegate detail request can finish after the selection changes and overwrite the new detail state. Add cancellation or a selected-ID/generation guard before writing state.

Evidence: `src/components/admin/AdminDashboard.tsx:78-90,150-229,243-265,372-414`; `src/components/admin/AdminNavigationAndViews.tsx:207-327`; `src/hooks/useGarageSync.ts:114-166,251-290`; `src/components/admin/AdminOverviewView.tsx:30-70`; `src/components/admin/AdminPeopleView.tsx`; `src/components/admin/AdminActiveSessionsView.tsx`.

#### Garage owner

- **The Packages menu has no rendered destination.** It sets `showPackages`, but the garage overlay never renders a package surface. Either restore the intended localized owner package view or remove the entry if packages are intentionally Admin-only. Do not remove the existing package data subscription until that decision is made.
- **Staff statistics/reports normally receive an empty staff list.** A staff-loading helper exists but has no call site in the owner workflow. Load the current garage’s staff after the owner session is ready, refresh on garage change, clear on logout, and never expose PINs.
- **Subscriber pagination can become inconsistent after changes to the newest page.** Live updates to page one preserve an old cursor for older pages. This is a bounded risk rather than a demonstrated production incident; test add/delete/renew between page loads before choosing a stable cursor/reset strategy.

Evidence: `src/components/garage/GarageDashboardView.tsx:250-259,411-435`; `src/components/garage/GarageDashboardOverlays.tsx:47-98`; `src/hooks/useGarageSync.ts:105-112`; `src/components/garage/SubscribersView.tsx:165-218`.

#### Delegate

- **A restored Delegate dashboard can request data before session claim completes.** Gate dashboard fetch/polling on `isSessionReady`; otherwise a pre-claim 401 can be mistaken for a real expired session and trigger logout.
- **Garage cards look clickable but have no open/detail action.** Either add a scoped, read-only detail flow or make them clearly non-interactive. Do not reuse Admin mutation screens.
- **Loading and failure can look like “no garages.”** Add distinct loading, empty, stale-data/error, and retry states.
- **Polling can overlap and preserve stale pagination/removed rows.** Use request generations or cancellation, update the paging metadata with accepted refreshes, and reconcile removals according to the Worker response contract. Prevent an older poll from overwriting a newer result.
- **Create retries have no client idempotency key.** The Worker supports optional idempotency for garage creation, but the Delegate client does not send one. Persist a key for one user intent across retries to prevent duplicate garage/ledger/activity effects after a lost response.
- **Delegate UI localization is Arabic/RTL only in the inspected view.** Apply the bilingual contract if Delegates are intended to use English; tests must cover both directions.

Evidence: `src/hooks/useGarageSync.ts:170-229`; `src/components/delegate/DelegateDashboardView.tsx:22-31,293-365`; `src/hooks/useAdminAndGarageManagement.ts:397-447`; `src/services/garageService.ts:155-175`; `server/garageRoutes.ts:129-167`.

#### Staff

- **Staff can claim a session before confirming the linked garage is usable.** If the garage document is missing or the client read fails, the handler can return to login without releasing the already-created Staff session; the next attempt can appear occupied. Validate the linked garage/status and release the exact Staff session on every post-claim failure. Add tests for missing garage, rejected read, pending/rejected garage, and retry success.
- **Owner/admin staff and PIN scope are already enforced server-side.** Preserve these boundaries; do not “fix” staff loading by weakening API/Firestore authorization.

Evidence: `src/hooks/useAdminAndGarageManagement.ts:202-220,253-264`; role policy in `server/domain/authorization.ts:78-85,109-129`.

### C. Cross-cutting contract issues — defer decisions, don’t bundle

- **System settings:** the current UI’s appearance update goes through the Worker service (not a direct Firestore write). However Firestore rules permit broader Admin writes than the Worker’s field validation. Before tightening rules, check every separate tool/client and deploy path; changing rules can break those callers. Add Worker tests for all supported fields and for rejected unknown fields first.
- **Coupons:** the Worker create/update routes accept broad fields, the TypeScript type and older test payload disagree, the current Admin UI has no coupon workflow, and the direct Firestore list path appears blocked by rules without a Worker list route. Do not spend time changing coupons until the owner confirms this is an active feature and chooses its canonical fields/read path.
- **Create idempotency:** Delegate/Admin creation can have ambiguous outcomes after network timeouts. The server has optional idempotency support for garage creation but the clients do not use it; add it only after preserving the existing uniqueness, authorization, and daily-limit rules.

### D. Recommended implementation sequence

1. **Define the state boundary:** establish the active owner key `(role, entity, session)`; on logout/owner change clear only transient role data/cursors before the next protected screen appears. Add late-response guards, including the throttled vehicle callback.
2. **Make session ordering explicit:** server claim succeeds → coordinator confirms readiness → protected data fetch begins. On logout, prevent a new claim from overlapping release. On a post-claim Staff validation failure, release the exact claimed session. Treat confirmed revocation differently from temporary network failure. Remove/gate client session-write fallbacks.
3. **Repair each role’s data flow:** Admin mutation list invalidation; Garage staff hydration and missing package surface; Delegate readiness/retry/detail/polling/idempotency; Staff linked-garage cleanup. Keep each role’s server authorization unchanged.
4. **Stabilize UI state and error feedback:** stale Admin tab fallback, loading/error/empty/retry distinction, shared logout-attempt scope, and out-of-order detail/list response handling.
5. **Complete bilingual behavior:** inventory every screen/modal/toast/loading state intended to support English; test Arabic/RTL and English/LTR through both role shells and shared overlays. Keep PINs, plates, IDs and numeric fields explicitly LTR where appropriate.
6. **Resolve policy-dependent items separately:** confirm Supervisor retirement, coupon status/schema, and whether system settings are Worker-only. No change to Admin multi-device use is proposed.
7. **Verify incrementally:** for each bounded change add focused tests, then cross-role regression tests, run relevant auth/session/rules tests, `npm run lint`, build/CI checks, and browser smoke against emulator fixtures. Merge only after checks pass. Do not claim zero failure gaps until all role scenarios have browser coverage; no live production test was part of this audit.

## Tests and scope

Focused source tests and lint batches reported by the audit reviewers passed, including session/API/authorization, role-specific dashboard, pagination, and Firestore-rules coverage. These were separate overlapping batches; their counts should not be summed. **A complete browser end-to-end run across every role and every failure scenario was not performed.** Production Firestore/Worker behavior and deployed artifact parity were not tested. Confirmed code paths are separated above from bounded risks and policy questions.
