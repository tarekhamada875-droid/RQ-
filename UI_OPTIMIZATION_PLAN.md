# UI Optimization Plan

## Purpose

Make RQ lighter and more responsive without changing the approved visual appearance, layout, spacing, colors, typography, behavior, or prepaid-credit business model.

This is a performance and maintainability plan, not a redesign. The next agent must not begin by rewriting the theme system or changing the grid, colors, component dimensions, or visual language.

## Current assessment

The proposal that prompted this plan correctly identifies UI optimization as worth investigating, but it overstates the likely benefit of CSS variables and GPU terminology. The current application already avoids expensive blur filters in `BorderShimmer`, and the existing `tools/performance-benchmark.ts` measures server-side report aggregation rather than browser rendering. A browser-based baseline is required before claiming improvement.

Likely higher-value areas are initial JavaScript cost, Firebase/Admin bundle loading, repeated React renders, long data-driven lists, open modal/dashboard trees, and continuously active animations. `FlipNumber` and the CSS grid are not assumed to be bottlenecks.

## Non-negotiable constraints

- Preserve screenshots and behavior across light/dark themes, Arabic/English, RTL/LTR, mobile, tablet, laptop, narrow-height, and large-font/accessibility settings.
- Preserve the current prepaid-credit model, subscriber lifecycle, authorization, payment confirmation, ledger, reporting, and server/API boundaries.
- Do not change Firestore data, indexes, routes, stored records, or financial semantics.
- Do not replace the existing theme class system wholesale. CSS custom properties may be introduced incrementally and only after visual equivalence is proven.
- Preserve the current grid dimensions, gradients, background positioning, card geometry, and animation appearance unless an approved visual change is explicitly requested.
- Do not add broad `will-change`, GPU-forcing transforms, blur filters, or animation layers without profiling evidence.
- Do not claim a performance win from a Node benchmark that does not measure browser rendering.

## Phase 0: establish evidence

Before changing production UI code, record a reproducible baseline for representative routes:

- Garage dashboard with normal activity and an active shimmer.
- Admin dashboard with garage list, summary, and open modals.
- Delegate dashboard with garage list.
- Recharge/history and financial-report surfaces.
- Light and dark themes, Arabic and English, mobile and desktop viewports.

Capture:

- Screenshot baselines and visual diffs.
- Initial load and route transition timings.
- JavaScript transfer and parse/execute cost.
- Long tasks, interaction latency, layout shifts, and memory.
- DOM node count and React render counts for large lists.
- Theme-switch cost and scroll performance with shimmer active.
- Reduced-motion behavior.

Record the commands, browser/device assumptions, route fixtures, and result files in the PR. If a browser profiling harness is needed, add a small focused tool rather than modifying the existing financial benchmark to produce unrelated measurements.

## Phase 1: low-risk optimizations

Prioritize changes that preserve the rendered result:

1. Lazy-load Admin-only screens, report/export views, history views, and modal-heavy features at the point of use.
2. Check root imports for Firebase, report/export libraries, and animation libraries that are not needed on every route.
3. Use React Profiler evidence to isolate unnecessary parent re-renders; add stable callbacks, memoized derived data, and `memo` only where measurements support them.
4. Virtualize genuinely long vehicle, activity, subscriber, garage, or event lists while preserving row height, keyboard behavior, focus, RTL, loading, and empty states.
5. Pause off-screen `BorderShimmer` animations with visibility detection and honor `prefers-reduced-motion`; preserve the on-screen active appearance.
6. Remove duplicate or unreachable CSS only after screenshot comparison confirms no visual change.

## Phase 2: carefully evaluated shared primitives

### Theme

The current `ThemeContext` also owns Admin language state and performs transition suppression, persistence, and browser theme-color updates. Do not reduce it to a theme-only context without relocating and testing language behavior. If tokens are introduced, keep `.light`/`.dark` compatibility during migration and migrate one primitive at a time.

### FlipNumber

Only refactor `FlipNumber` if profiling or accessibility testing demonstrates a real issue. Preserve all supported sizes, breakpoints, font scaling, digit padding, separator position, colors, and RTL/LTR behavior. Use screenshot tests before and after.

### BorderShimmer

The current implementation uses SVG strokes and intentionally avoids expensive blur filters. Profile active and inactive cases first. Prefer visibility gating and reduced-motion support over replacing it with unproven GPU or CSS effects.

## Acceptance criteria

A change is acceptable only when:

- Visual regression diffs are empty or explicitly reviewed and approved.
- All supported themes, languages, directions, and viewports remain correct.
- Accessibility and reduced-motion checks pass.
- The measured target improves, or the change is clearly justified as maintainability work with no regression.
- `npm run lint`, focused tests, `git diff --check`, and `npm run ci:check` pass.
- The PR describes the before/after measurements and names the exact route and fixture used.
- The protected PR gate and post-merge production verification pass.

## Suggested first ticket

**UI-OPT-01 — Browser performance baseline and visual regression harness.**

Do not combine the baseline with a theme rewrite, grid redesign, `FlipNumber` rewrite, or broad CSS conversion. The first deliverable should be evidence and reusable screenshot/performance checks that let later agents make safe, measurable changes.

## Handoff to the next agent

Read this plan and `PROJECT_ENGINEERING_KNOWLEDGE.md` before editing. Start from synchronized `main`, verify the current live Worker identity, run the existing production checks, and establish the Phase 0 baseline. Stop and report the evidence if no measurable bottleneck is found; do not optimize by assumption.
