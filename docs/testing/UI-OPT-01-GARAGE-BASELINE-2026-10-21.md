# UI-OPT-01 garage dashboard baseline

Date: 2026-10-21. Environment: local Vite/Node development server, synthetic Auth and Firestore emulators (`demo-rq-ui-fixtures`), headless Chrome 154.0.8037.57, seeded garage fixture. No production services, users, or records were used.

## Method

The authenticated garage fixture ran twice at each viewport, sequentially, with a fresh local emulator and browser profile for each run:

- Mobile: 390 × 844 CSS pixels.
- Desktop: 1440 × 900 CSS pixels.
- Login interaction: real synthetic PIN keypad entry, followed by clicking the visible login button; elapsed time is measured from that click until the expected dashboard text is observed. The observation loop polls every 50 ms, so this is an approximate UI-observation latency, not an exact React commit or input-to-paint timestamp.
- Navigation metrics are browser Navigation Timing values. Resource counts and transfer sizes are collected from completed browser Resource Timing entries. API request summaries include same-origin `/api/*` resources only; Firestore's SDK transport is not represented by that API list.
- All four captures reached the expected authenticated garage dashboard. The fixture harness released its app, Chromium, Auth, Firestore, and emulator-hub ports after each run.

## Results

| Viewport | Login click → dashboard text (mean; range) | DOMContentLoaded (mean; range) | Load event (mean; range) | Resources | Transfer size (mean) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mobile 390 × 844 | 1,375 ms; 1,342–1,407 ms | 2,772 ms; 2,733–2,811 ms | 2,781 ms; 2,742–2,820 ms | 116 in both runs | 6,359,469 bytes |
| Desktop 1440 × 900 | 1,420 ms; 1,382–1,457 ms | 2,693 ms; 2,663–2,723 ms | 2,702 ms; 2,672–2,733 ms | 116 in both runs | 6,359,463 bytes |

Both viewports had 110 DOM nodes. The two observed same-origin API requests in each run were `/api/auth/verify-pin` and `/api/system-config` (HTTP 200). Their Resource Timing durations were 707–758 ms and 428–531 ms, respectively. These are local synthetic-server/emulator timings and must not be interpreted as production network latency.

An exact active Firestore `onSnapshot` listener count was not instrumented. The capture records it as `null`; request count is not used as a listener-count proxy.

## Interpretation and next action

The four runs are consistent enough to establish a repeatable local fixture baseline, but this setup is not production performance evidence and has no real mobile network/device throttling. The visible measurements do not demonstrate a specific, reproducible user-facing bottleneck that justifies an optimization. Per the UI performance plan, **do not start an optimization task on this evidence alone**. Stop this investigation here unless a concrete user-facing performance symptom warrants a more targeted measurement or a separate, explicitly approved production-like test environment.

The JSON and screenshot outputs used for this summary were written to temporary local paths `/tmp/rq-garage-final-{mobile,desktop}-{1,2}/`; they are not committed as bulky artifacts. The fixture instructions and capture schema are documented in `UI-OPT-01-AUTHENTICATED-FIXTURES.md`.
