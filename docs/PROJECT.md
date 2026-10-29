# RQ project model

RQ is an Arabic-only garage-management PWA. Production architecture is Cloudflare Pages → Cloudflare Worker using Hono → Firebase Authentication and Firestore.

## Active product model

Garage billing uses prepaid credits only. Admin confirms payment and grants credits through the Worker. Credit grants must be 50–2,000 EGP per operation (bigger amounts require multiple grants). 1 EGP = 1 credit.

Each garage has a single credit balance, stored as the `credits` field on the garage document. The previous three-bucket model (paid / referral / trial) was collapsed into this single balance on 2026-10-29 by owner decision; the *kind* of every ledger entry is still recorded for audit, but there is only one live balance number. Credits do not expire.

Regular vehicle entry consumes 1 credit per car at check-in. Monthly subscriber check-in is free at check-in; subscriber renewal debits 5 credits per renewal from the single balance.

A new trial grants exactly 100 credits (added to the single balance as a `trial_grant` ledger entry). Trial credits are not cash revenue.

The referral reward is 20 credits, awarded once to the referring garage when the referred garage makes its first qualifying paid grant (≥ 500 EGP). The delegate commission is 100 EGP, awarded once to the delegate when a garage they onboarded makes its first qualifying paid grant (≥ 500 EGP). Both fire on the same trigger; smaller first grants do not trigger either. Retries, later grants, and legacy recharge events do not create another commission or referral reward.

Admin revenue (the EGP collected from garages for credits) is tracked separately on each garage doc as `totalAdminRevenue` and aggregated in the admin summary. Garage revenue (money collected from drivers at check-out, plus 5 EGP per subscriber renewal) is tracked separately as `totalRevenue` / `todayRevenue`.

All login PINs are exactly 5 digits. PIN resets are handled out-of-band: the garage owner contacts Admin by phone, and Admin resets the PIN through the Worker.

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

New writes must reject them. The server endpoints for these features no longer exist.

## Engineering authority

The Worker is authoritative for identity, role, garage scope, financial values, subscriber eligibility, counters, reports, and mutations. The browser renders server decisions and may provide optimistic feedback, but it cannot approve money, change balances, or make final eligibility decisions. The browser performs zero direct Firestore writes.

Multi-document business changes use Firestore transactions. Retried intents use idempotency keys and request fingerprints. Domain events, activity records, projections, and ledgers must agree through reconciliation.

Staff deletion performs full revocation: all active sessions are revoked, the session index is invalidated, the Firebase Auth user is deleted, and the staff member's activity history is removed.

Garage deletion is a multi-step process that also cleans up payment reference markers, credit ledger entries, activity logs, staff records, sessions, and private PINs.

## UX boundary

Arabic is the sole supported application language. Keep user-facing interface copy Arabic-only and use RTL layout across active roles, screens, dialogs, and shared feedback. Time is hidden from user-facing screens; server timestamps remain authoritative internally.

Preserve the existing visual design, Egyptian license-plate identity, mobile/desktop layout, and role flows. Keep plate identifiers, PINs, IDs, and numeric entry readable in their appropriate direction.
