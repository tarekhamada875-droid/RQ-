# UI-OPT-01 garage dashboard baseline

Date: 2026-10-22 (listener-instrumented repeat captures; this updates the initial 2026-10-21 baseline). Environment: local Vite/Node development server, synthetic Auth and Firestore emulators (`demo-rq-ui-fixtures`), headless Chrome 154.0.8037.57, seeded garage fixture. No production services, users, or records were used.

## Method

The authenticated garage fixture ran twice at each viewport, sequentially, with a fresh local emulator and browser profile for each run:

- Mobile: 390 × 844 CSS pixels.
- Desktop: 1440 × 900 CSS pixels.
- Login interaction: real synthetic PIN keypad entry, followed by clicking the visible login button. Elapsed time is measured from that click until the expected dashboard text is observed. The observation loop polls every 50 ms, so this is approximate UI-observation latency, not an exact React commit or input-to-paint timestamp. The measurement is captured before a separate 500 ms settling interval used to read active listeners.
- Navigation metrics are browser Navigation Timing values. Resource counts and transfer sizes are collected from completed browser Resource Timing entries. API request summaries include same-origin `/api/*` resources only; Firestore's SDK transport is not represented by that API list.
- The fixture reads the application's existing `listenerTracker` diagnostics. Tracker diagnostics are exposed only when `VITE_RQ_USE_EMULATORS=true`. The count below is the sum of active, tracked Firestore subscription registrations, not a count inferred from network requests. The Worker-backed system-config subscription is shown separately because it is API-backed, not a Firestore `onSnapshot` registration.
- All four captures reached the expected authenticated garage dashboard. The fixture harness released its app, Chromium, Auth, Firestore, and emulator-hub ports after each run.

## Results

| Viewport | Login click → dashboard text (mean; range) | DOMContentLoaded (mean; range) | Load event (mean; range) | Resources | Transfer size (mean; range) | Active Firestore registrations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile 390 × 844 | 1,372 ms; 1,349–1,394 ms | 2,724 ms; 2,669–2,780 ms | 2,734 ms; 2,680–2,789 ms | 118 in both runs | 6,362,963 bytes; 6,362,957–6,362,969 | 7 in both runs |
| Desktop 1440 × 900 | 1,360 ms; 1,288–1,432 ms | 2,696 ms; 2,609–2,782 ms | 2,706 ms; 2,619–2,792 ms | 118 in both runs | 6,362,959 bytes; 6,362,957–6,362,961 | 7 in both runs |

Both viewports had 110 DOM nodes. The two observed same-origin API requests in each run were `/api/auth/verify-pin` (mobile mean 750 ms, range 722–778 ms; desktop mean 722 ms, range 701–742 ms) and `/api/system-config` (mobile mean 483 ms, range 472–493 ms; desktop mean 483 ms, range 451–514 ms). These are local synthetic-server/emulator timings and must not be interpreted as production network latency.

The active Firestore registrations were identical across all four captures:

- `packages`: 1
- `session_guard/garages/ui-fixture-garage`: 1
- `garages/ui-fixture-garage/active_vehicles`: 1
- `garages/ui-fixture-garage/today_transactions`: 1
- `garages/ui-fixture-garage`: 1
- `garages/ui-fixture-garage/recharge_logs`: 1
- `announcements`: 1

Each run also had one active Worker-backed system-config subscription, reported separately. The tracker reported zero duplicate registrations in every run. The optional subscribers-list registration was not active in this seeded fixture state. Seven is the observed count for this fixture and screen state, not a target or proof that the count is inherently optimal.

## Interpretation and next action

The missing listener measurement is now complete, and the active listener inventory was stable across repeated mobile and desktop captures. This remains a synthetic local baseline, not production performance evidence; it has no real mobile device or network throttling. These measurements do not demonstrate a specific, reproducible user-facing bottleneck that justifies an optimization. Per the UI performance plan, **do not start an optimization task on this evidence alone**. Stop here unless a concrete user-facing performance symptom warrants a more targeted measurement or a separate, explicitly approved production-like test environment.

The JSON and screenshot outputs used for this update were written to temporary local paths `/tmp/rq-garage-complete-{mobile,desktop}-{1,2}/`; they are not committed as bulky artifacts. The fixture instructions and capture schema are documented in `UI-OPT-01-AUTHENTICATED-FIXTURES.md`.
