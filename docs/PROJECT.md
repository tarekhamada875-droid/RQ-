# RQ project model

RQ is an Arabic-only garage-management PWA. Production architecture is Cloudflare Pages → Cloudflare Worker using Hono → Firebase Authentication and Firestore.

## Active product model

Garage billing uses prepaid credits only. Admin confirms payment and grants credits through the Worker. Credit grants must be 50–2,000 EGP per operation (bigger amounts require multiple grants). The EGP-to-credit conversion rate is admin-configurable via `system_config/global.creditRate` (presets: 0.5, 0.8, 1, 2, 10). Default is 1 (1 EGP = 1 credit).

Each garage has a single credit balance, stored as the `credits` field on the garage document. The previous three-bucket model (paid / referral / trial) was collapsed into this single balance on 2026-10-29 by owner decision; the *kind* of every ledger entry is still recorded for audit, but there is only one live balance number. Credits do not expire.

Regular vehicle entry consumes 1 credit per car at check-in. Monthly subscriber check-in is free at check-in; subscriber renewal debits 2 credits per renewal from the single balance.

A new trial grants exactly 100 credits (added to the single balance as a `trial_grant` ledger entry). Trial credits are not cash revenue.

The referral reward is 20 credits, awarded once to the referring garage when the referred garage makes its first qualifying paid grant (≥ 500 EGP). The delegate commission is 100 EGP, awarded on a rolling 30-day recurring basis to the delegate when a garage they onboarded makes a qualifying paid grant (≥ 500 EGP) and no commission has been awarded in the past 30 days. Both fire on the same trigger; smaller first grants do not trigger either. Retries, later grants, and legacy recharge events do not create another commission or referral reward.

Read/write economy (owner decision, 2026-11-14, to stay on the Firestore free tier): garage reports (daily/monthly) and subscriber data load on demand when their screens are opened, not via always-on listeners; delegate and admin request polling runs every 5 minutes (previously 30 seconds); `system_config` is cached in localStorage with a silent fallback when storage is unavailable. Do not reintroduce always-on listeners or fast polling for these views.

Admin revenue (the EGP collected from garages for credits) is tracked separately on each garage doc as `totalAdminRevenue` and aggregated in the admin summary. Garage revenue (money collected from drivers at check-out, plus 2 EGP per subscriber renewal) is tracked separately as `totalRevenue` / `todayRevenue`.

All login PINs are exactly 5 digits. PIN resets are handled out-of-band: the garage owner contacts Admin by phone, and Admin resets the PIN through the Worker. New-garage PINs are generated server-side (`server/pinGeneration.ts`) and delegates never see or set them (2026-11-14); the new garage owner receives the PIN directly.

Admin can apply credit corrections (positive to add, negative to subtract, cannot drive the balance below zero) outside the normal 50–2,000 EGP grant flow, for fixing mistakes. Each correction requires a typed reason and is recorded in the ledger as kind `correction_delta`.

Payment references were removed on 2026-10-29 by owner decision. Credit grants now require only an amount and a reason; the previous per-garage payment-reference uniqueness check and the `payment_reference_markers` collection are no longer used by new grants (legacy markers may still be cleaned up by garage deletion).

## Retired features

The following features have been removed from the product entirely:

- Announcements (create, delete, toggle, and garage-dashboard display) — removed.
- Packages / credit-bundle templates — removed. Credit grants use custom amounts only.
- Garage-level subscription billing, duration/capacity/weekly/monthly garage packages.
- Old recharge requests, wallet/top-up workflows, and the old two-day trial.
- Legacy commission paths (recharge-based, no 500 EGP threshold).
- Three-bucket credit balances (`creditBalance: { paid, referral, trial }`) — replaced by the single `credits` field on 2026-10-29. Browser writes to either `credits` or `creditBalance` are denied.
- Payment references on credit grants — removed on 2026-10-29. Grants now require only an amount and a reason.
- Recent-exit warning modal on the garage dashboard — removed 2026-11-14 (#755); check-out completes without the secondary warning step (the modal component file remains but is unwired).

New writes must reject them. The server endpoints for these features no longer exist.

## Engineering authority

The Worker is authoritative for identity, role, garage scope, financial values, subscriber eligibility, counters, reports, and mutations. The browser renders server decisions and may provide optimistic feedback, but it cannot approve money, change balances, or make final eligibility decisions. The browser performs zero direct Firestore writes.

The target BFF boundary is for the browser to use the Worker for all application-data reads and writes. That migration is not yet complete: direct Firestore read listeners and one-shot reads remain in vehicle, garage, delegate, subscriber, staff, activity, and session client code. Replace them feature-by-feature with authenticated, role-scoped Worker routes, preserving current multi-device freshness; do not treat the BFF target as complete until those browser read paths are removed and verified.

For vehicle check-in and check-out, keep transaction controls visibly locked while the request is pending and for at least three seconds through the completion feedback. Do not present a vehicle, counter, credit, or revenue change as successful before Worker confirmation. After a confirmed check-in, animate the committed inside-car count first, then apply the committed credit balance so the five debit arrows follow the count motion; the full feedback sequence must finish before controls unlock. After a confirmed checkout, apply the committed vehicle removal and totals, return from the inside-vehicle list to the main dashboard, and animate the committed inside-car count downward. Realtime snapshots must not revert confirmed transaction values.

Multi-document business changes use Firestore transactions. Retried intents use idempotency keys and request fingerprints. Domain events, activity records, projections, and ledgers must agree through reconciliation.

Staff deletion performs full revocation: all active sessions are revoked, the session index is invalidated, the Firebase Auth user is deleted, and the staff member's activity history is removed.

Garage deletion is a multi-step process that also cleans up payment reference markers, credit ledger entries, activity logs, staff records, sessions, and private PINs.

## UX boundary

Arabic is the sole supported application language. Keep user-facing interface copy Arabic-only and use RTL layout across active roles, screens, dialogs, and shared feedback. Garage-facing dashboard copy uses Egyptian colloquial Arabic rather than Modern Standard Arabic (2026-11-14); keep new garage-facing strings in dialect. Time is hidden from user-facing screens; server timestamps remain authoritative internally.

Preserve the existing visual design, Egyptian license-plate identity, mobile/desktop layout, and role flows. Keep plate identifiers, PINs, IDs, and numeric entry readable in their appropriate direction.

The garage monthly revenue card is deliberately minimal (owner decision, 2026-11-16, #760): a label, the big Arabic-Indic number, and the currency — no decorative icon and no data-coverage note. A regression test (`GarageReportsView.monthly.test.tsx`) enforces this; do not re-add the removed elements.

The credit-debit falling-arrows feedback on the garage balance card always plays, regardless of the device's reduced-motion/animation settings (owner decision, 2026-11-16): do not gate `.credit-debit-arrow` behind `prefers-reduced-motion` or any equivalent JS check. The red balance/border state remains as the non-motion cue.

The debit feedback costume is the "digital rain" look (owner decision, 2026-11-17, picked as option 4 of the debit-looks-v2 demo): each of the five frozen tracks carries an ultra-thin rose light streak (`.credit-debit-rain`) plus a fainter thin companion (`.credit-debit-rain-thin`, `.credit-debit-arrow-thin`) that starts a beat later. The fall keyframes, track positions, and center-out delays did not change, and the red balance/border state is untouched. Do not reintroduce the old arrow icon.

Zooming is disabled product-wide (owner decision, stated twice, reconfirmed 2026-11-21): no pinch-zoom, no double-tap zoom, no wheel/trackpad zoom, on any device or role. The lock in `index.html` is intentional product behavior, not a bug — see AGENTS.md "Permanent owner decisions".
