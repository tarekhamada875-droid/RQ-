# UI-OPT-01 authenticated browser fixtures

Date: 2026-10-19.

The local browser fixture workflow now exercises the real garage login path instead of setting a protected view through `localStorage`.

## Command

From a clean checkout with dependencies installed:

```bash
npm run ui-fixtures:browser-smoke
npm run ui-fixtures:browser-smoke:admin
npm run ui-fixtures:browser-smoke:delegate
```

The garage harness defaults to mobile. To run the same authenticated fixture at desktop size, use:

```bash
RQ_FIXTURE_VIEWPORT=desktop npm run ui-fixtures:browser-smoke:garage
```

The command starts isolated Auth and Firestore emulators for the `demo-rq-ui-fixtures` project, seeds synthetic records, starts the existing Node/Vite server with emulator bindings, launches headless Chromium, enters the synthetic eight-digit garage PIN through the real keypad, clicks the real login button, waits for the authenticated garage dashboard, and writes:

- `tmp/ui-fixture-smoke/garage-mobile-authenticated.png`
- `tmp/ui-fixture-smoke/garage-mobile-authenticated.json`

The same harness accepts `RQ_FIXTURE_ROLE=admin` or `RQ_FIXTURE_ROLE=delegate` and captures the corresponding authenticated dashboard to `admin-mobile-authenticated.*` or `delegate-mobile-authenticated.*`. The explicit package scripts above are the preferred commands for those roles.

No production Worker, production Firebase project, or production records are used. The emulator process is terminated by the harness after capture.

## Browser assumptions

- Chromium headless with device scale factor 1; mobile is 390×844 and desktop is 1440×900.
- Auth emulator on `127.0.0.1:9099`.
- Firestore emulator on `127.0.0.1:8080`, using the `(default)` database.
- App server on `127.0.0.1:4174`.

## Verified interaction

The harness entered the garage fixture PIN through keypad button clicks, submitted the visible Arabic login button, received `200` from `/api/auth/verify-pin`, and reached the garage dashboard with the fixture garage visible. The shared anonymous-auth coordinator prevents the login hook and dashboard session hook from creating two different anonymous users during the view transition.

The frontend explicitly selects the emulator `(default)` Firestore database in emulator mode only. Production continues to use the configured production database ID.

The JSON artifact records the browser identity, fixture identity, viewport, URL, DOM node count, scroll height, navigation timing, login-button-to-dashboard-marker latency, completed resource count, completed API request paths/timings, transfer-size totals, and the active Firestore subscriptions recorded by `listenerTracker`. The tracker diagnostics are exposed to the browser only when `VITE_RQ_USE_EMULATORS=true`; the count is the sum of active tracked Firestore subscription registrations, not an inference from network requests. The Worker-backed system-config subscription is reported separately because it is API-backed rather than a Firestore `onSnapshot` listener. Garage dashboard session-guard and package snapshots are included in the tracker.

The admin and delegate captures were also validated on 2026-10-21. The admin dashboard can still log a non-fatal local-emulator query warning for the garage list (`descending key scans`); authentication and dashboard rendering remain successful. The delegate fixture returns to its dashboard after login and exposes the stable `لوحة المندوب` heading.
