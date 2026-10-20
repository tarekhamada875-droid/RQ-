# UI-OPT-01 baseline: browser performance and visual regression

Date: 2026-10-19. This is a measurement-only change. No application UI, CSS, theme value, grid value, shared primitive, API route, Firestore data, index, rule, or financial behavior was changed.

## Reproduction

From a clean checkout of `main`, create the short-lived branch and install the existing lockfile dependencies:

```bash
npm install --ignore-scripts
npm run browser-baseline -- --update
npm run browser-baseline -- --compare
```

The harness is `tools/browser-baseline.mjs`. It starts the existing Vite/Node server, drives the locally served app through Chromium’s DevTools Protocol, and writes the matrix to `docs/ui-opt-01-baseline/`. `--update` writes PNG and JSON baselines; `--compare` captures a fresh run and compares its SHA-256 screenshot hash with the stored image. Exact hashes are intentionally strict under the same browser/rendering environment; timing or asynchronous-data changes can make a protected synthetic view differ and should be reviewed rather than silently accepted.

The probe does not call the production Worker and does not perform Firestore writes. The existing `tools/performance-benchmark.ts` was not modified or used because it measures server-side report aggregation, not browser rendering.

## Assumptions and fixtures

- Browser: Chromium `Chrome/154.0.8037.57`, headless, `--disable-gpu`, device scale factor 1.
- Server: the repository’s existing `npm run dev` on `127.0.0.1:4173`.
- Viewports: 390×844 mobile and 1440×900 desktop.
- Themes: `light` and `dark` through the existing `theme` local-storage setting.
- Languages/directions: `ar`/RTL and `en`/LTR. The harness sets the document direction only for the probe; it does not change application language or translation code.
- Cases: regular login, admin login, delegate login, garage dashboard, admin dashboard, delegate dashboard, and the garage entry used to represent recharge/history/financial surfaces. Each case is captured in every theme/language/viewport combination: 56 PNG baselines and 56 JSON measurement records.
- Protected views use synthetic local-storage view fixtures only. They are not authenticated production sessions and are not evidence of authenticated data rendering. The app’s existing session guard or local API failure can redirect a case or leave a fallback shell; those outcomes are retained in the JSON instead of being hidden.
- The baseline records `React` commit signals only when the React DevTools hook is available before app bootstrap. It does not instrument production React code.

## Captured measurements

For each case the JSON records navigation response, DOM-content-loaded and load timings; JavaScript resource count, transfer bytes, and duration; long tasks; layout shifts; event entries over the 16 ms threshold; heap metrics when Chromium exposes `performance.memory`; DOM node count; scroll height; active animated SVG/shimmer candidates; viewport; theme class; direction; and React commit/renderer counts. After the screenshot, the harness also emulates `prefers-reduced-motion: reduce` and applies a temporary 125% root font size, recording whether the media query is honored and the resulting large-font DOM/scroll metrics. The temporary style is removed before the next case.

Observed across the 56 captures in this sandbox run:

| Signal | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| DOM nodes | 44 | 77 | 88 |
| `loadEvent` (ms) | 257.5 | 1,286.95 | 1,835.3 |
| navigation response end (ms) | 39.8 | 1,166.75 | 1,677.3 |
| JavaScript transfer (bytes) | 19,200 | 38,175 | 2,040,366 |
| JavaScript resource duration (ms) | 413.7 | 540.45 | 886.7 |
| React commit signals | 4 | 6 | 6 |
| long-task entries | 0 | 0 | 1 |
| cumulative layout-shift sum | 0 | 0 | 0.00493 |

The reduced-motion media query was honored in all 56 probes. Chromium did not expose a useful `performance.memory` object in this run, so memory is recorded as `null` rather than estimated. Active animation counts, interaction entries, and per-case values are in the JSON files; no bottleneck is declared from these first measurements alone.

## Visual baseline inventory

The PNG files are the baseline artifacts. The per-case JSON files preserve the exact route/view, settings, browser assumptions, screenshot hash, and measurements. The baseline includes light/dark, Arabic/English, RTL/LTR, mobile/desktop, reduced-motion verification, and larger-font metrics. `FlipNumber` and `BorderShimmer` were not rewritten or assumed to be bottlenecks.

A fresh `--compare` run is expected to be reviewed in the same browser environment. In this first run, 6 screenshot hashes differed in protected/fallback cases because asynchronous session guarding and local API fallback changed the rendered shell between captures; this is evidence that authenticated deterministic fixtures are still needed before using those protected screenshots as a hard gate. The public login cases are the stable first visual gate. No optimization was implemented from this result.

## Result and next step

This ticket establishes the reusable measurement and screenshot harness only. It does not prove a performance improvement, and it does not authorize a redesign. The next bounded investigation should make authenticated synthetic fixtures deterministic for the garage, admin, delegate, history, and financial-report surfaces, then repeat this baseline and inspect the largest relevant browser signal before making one small change.
