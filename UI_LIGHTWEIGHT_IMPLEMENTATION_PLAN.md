# Lightweight UI Implementation Plan

_Last updated: 2026-10-19._

## Owner intent

Keep RQ looking and behaving exactly as it does today while making the implementation lighter where the code is doing unnecessary work. This is an internal modernization plan, not a redesign.

The Egyptian license-plate identity, colors, spacing, dimensions, typography, themes, Arabic/English behavior, RTL/LTR behavior, animations, navigation, authorization, prepaid-credit model, financial semantics, and Firebase/server boundaries are protected product behavior.

## The rule for every change

A change is acceptable only if it changes the implementation without changing the rendered result or user behavior. The desired outcome is the same garage building with lighter machinery inside the walls.

Before editing, record the current behavior and identify the exact code path. After editing, compare the before and after using the narrowest relevant tests, build output, DOM/layout assertions, and screenshots where the affected surface is visual. If the result is not equivalent, revert the change.

Do not change CSS values, Tailwind classes, component dimensions, colors, typography, layout structure, animation timing, route behavior, Firebase data access contracts, or business logic merely to make code look cleaner.

## Current evidence from the 2026-10-19 audit

The repository is clean on `main` at `7c40d6fd01f59ed80cb4e8014e9d8400c53a9145`, matching `origin/main`. No production UI or data was changed during the audit.

The current web build transformed 2,230 modules and emitted these notable chunks:

| Artifact | Raw | Gzip |
| --- | ---: | ---: |
| Firebase chunk | 544.48 KB | 125.59 KB |
| Vendor chunk | 353.48 KB | 109.81 KB |
| Admin dashboard route | 176.12 KB | 36.97 KB |
| Garage dashboard route | 104.07 KB | 25.60 KB |
| Main entry | 137.87 KB | 39.66 KB |
| Shared dependency chunk | 152.12 KB | 46.81 KB |
| CSS | 285.51 KB | 24.28 KB |

These are build facts, not proof that each chunk is a problem. The next change must establish whether a candidate is loaded or executed on the affected route and whether the improvement is worth the risk.

The source audit found the following investigation candidates:

- `GarageDashboardView` owns a full-dashboard 60-second state ticker, several subscriptions/effects, recharge-notification processing, and vehicle sorting/slicing. The ticker and derived work must be measured before any change; `FlipNumber`, `BorderShimmer`, and the grid are not presumed to be bottlenecks.
- `useGarageDashboardLiveData` already shares recharge and subscriber snapshots with overlays. Any change must preserve listener counts, cleanup, limits, and the no-duplicate-listener behavior covered by tests.
- `AdminDashboard` and `AdminNavigationAndViews` contain many feature views and several derived garage lists. Route-level lazy loading already exists for some screens, so the next step is dependency and render evidence rather than another broad lazy-loading rewrite.
- `AnimatedCounter`, `FlipNumber`, and motion-based drawers/modals perform visible work by design. Do not replace or simplify them without a measured target and screenshot/accessibility proof.
- The app already uses lazy route chunks, so “make everything lazy” is not an adequate plan. Inspect the actual import graph and first-route network waterfall first.

## Small, ordered work items

### 1. Establish a lightweight audit record

Add or maintain a small reproducible audit command that reports build chunk sizes, route imports, and selected runtime signals. Prefer existing project commands and focused scripts. Do not build a large authenticated matrix unless a later change genuinely requires it.

The record should cover the public login, garage dashboard, admin dashboard, and delegate dashboard where access is available through existing local fixtures. It should measure only what is needed for the selected candidate: loaded JavaScript, route timing, DOM nodes, listener/subscription counts, long tasks, and relevant render activity.

### 2. Candidate A: remove demonstrably unnecessary dashboard work

Start with the lowest-risk candidate in `GarageDashboardView`: determine whether the 60-second ticker causes a visible or useful update. If it is unused or broader than necessary, replace it with the smallest scoped mechanism that preserves all displayed time/countdown behavior. If it is needed, leave it unchanged.

Also inspect sorting, filtering, and derived values for repeated work. A memoization or ownership change is allowed only when it preserves ordering, empty states, loading states, RTL/LTR behavior, and live updates.

### 3. Candidate B: reduce feature code loaded before it is used

Use the production build graph and route waterfall to identify admin/report/export/modal code that is loaded before the user opens it. Extract only a clearly isolated feature at its point of use. Preserve loading fallbacks, error recovery, keyboard focus, route state, and visual output.

Do not change the shared `ThemeContext`, Firebase initialization, authentication flow, or server contracts as part of this item.

### 4. Candidate C: prevent proven repeated renders or listeners

Use React/render and listener evidence to identify one repeated parent render, duplicate subscription, or listener that survives longer than its surface. Add stable callbacks, memoized derived data, or lifecycle cleanup only where the evidence identifies that exact issue.

The existing listener cleanup tests and financial/authorization behavior are mandatory regression boundaries.

## Explicitly out of scope

- No redesign, theme rewrite, CSS-variable migration, grid change, color change, typography change, spacing change, or component resize.
- No rewrite of `FlipNumber`, `AnimatedCounter`, `BorderShimmer`, or motion effects by assumption.
- No broad `will-change`, GPU-forcing transforms, blur filters, animation replacement, or visual simplification.
- No Firestore schema, rules, indexes, stored-record, route, authorization, financial, credit, subscriber, or API changes.
- No production data changes and no deployment shortcut around the normal PR gate.
- No large authenticated screenshot harness unless a specific visual regression needs it.

## Acceptance checklist for every implementation PR

- The selected bottleneck is described with before evidence and a clear reason it matters.
- The code change is small, reversible, and limited to the selected candidate.
- Focused tests pass, including affected listener/data/interaction tests.
- `npm run lint`, `npm run maintainability:check`, `git diff --check`, and `npm run ci:check` pass.
- The affected route remains visually equivalent in light/dark, Arabic/English, RTL/LTR, mobile, and desktop cases as applicable.
- Loading, empty, error, focus, reduced-motion, and keyboard behavior remain correct.
- The before/after build or runtime measurement is recorded; expected benefits are not reported as measured gains.
- The change goes through a short-lived branch, reviewed PR, required Production Gate, merge, and post-merge live verification.

## Confirmed UI maintenance batch

The following user-reported issues were verified in source and are approved for the focused fix branch:

- **Checkout entry-error action:** `CheckOutModal` rendered the same “حذف السيارة (خطأ إدخال)” action twice and did not apply its five-minute correction window to either visible delete action. Keep one primary action and show it only for an eligible non-subscriber vehicle during the first five minutes after `entryTime`.
- **Garage credit information:** the main garage dashboard showed too much supporting credit detail beneath the balance. Keep the main credit card with only the total credit, move the paid/referral/trial breakdown and ledger details to the existing dedicated `RechargeHistoryView`, and expose that page from the garage side panel.

Acceptance for this batch is functional rather than a redesign: the checkout action count/timing must match the rule, and the credit page must preserve the existing ledger data, loading state, live-listener sharing, and light/dark styling.

The adjacent audit did not prove additional bugs. The 60-second dashboard ticker and recharge-notification freshness are investigation candidates only; do not change them until their exact user-visible dependency is measured.

## Completed ticker and notification audit

The focused audit proved two related issues in `GarageDashboardView`:

- `useServerTime` already updates the app clock every 60 seconds, so the dashboard’s second local ticker caused a redundant full-dashboard render. The redundant ticker was removed.
- Recharge freshness was calculated with `Date.now()` only when recharge data changed. Because the effect short-circuited for the same log, an unacknowledged notification could remain visible beyond the 15-minute window. The effect now follows the existing server clock, re-evaluates freshness, and closes the notification when it expires. The sound remains protected by the existing per-log local-storage guard.

The regression coverage confirms both shared-listener cleanup and expiry at the fifteen-minute boundary.

## Completed route/build graph audit

The garage route eagerly imported `GarageReportsView` through `GarageDashboardOverlays`, even though the reports surface is opened only from the side panel. The reports feature was moved behind the existing retryable lazy-import pattern and a local `Suspense` boundary; all other garage overlays and their props remain unchanged.

The production build provides a measurable result: the main `GarageDashboardView` chunk decreased from **104.07 KB raw / 25.60 KB gzip** to **96.52 KB raw / 23.82 KB gzip**, while the deferred `GarageReportsView` chunk is **8.51 KB raw / 3.00 KB gzip**. The report code is therefore no longer part of the initial garage route chunk and is requested only when the reports overlay is rendered.

## Completed repeated-render audit

`useServerTime` updates the application clock every minute, and `AppRoutes` previously passed that changing `now` prop into `GarageDashboardView` even when Staff Statistics was closed. That defeated the dashboard’s `memo` boundary and caused the full garage dashboard tree to receive a clock-driven render that only Staff Statistics needed. The route now passes the clock only while Staff Statistics is open.

Recharge notification freshness no longer depends on those parent clock renders. When an unacknowledged recharge is active, the dashboard schedules one targeted expiry timer for the remaining fifteen-minute window; the existing server-clock value is still used when Staff Statistics is open, and the listener ownership/cleanup remains unchanged. Focused listener tests cover both the shared subscription lifecycle and timer expiry.

## Completion

This lightweight UI plan is complete. The next workstream is the separate business-logic audit and repair plan: [`GARAGE_LOGIC_FIX_PLAN.md`](GARAGE_LOGIC_FIX_PLAN.md). That plan is not a visual redesign and requires confirmed bad logic to be deleted rather than archived or retained as a runtime compatibility path.
