# RQ project model

RQ is an Arabic-only garage-management PWA. Production architecture is Cloudflare Pages → Cloudflare Worker using Hono → Firebase Authentication and Firestore.

## Active product model

Garage billing uses prepaid credits only. Admin confirms payment and grants credits through the Worker. Credit grants must be 50–2,000 EGP per operation (bigger amounts require multiple grants). 1 EGP = 1 credit.

Regular vehicle entry consumes 1 credit per car at check-in. Monthly subscriber check-in is free at check-in; subscriber renewal debits 5 paid credits per renewal. Credits debit in allocation order: paid → referral → trial.

A new trial grants exactly 100 trial credits. Trial credits are a separate ledger bucket and are not cash revenue.

Delegate commission is 100 EGP exactly once per garage, triggered by that garage's first qualifying paid credit grant (≥ 500 EGP). Smaller first grants do not trigger commission. Retries, later grants, and legacy recharge events do not create another commission.

Admin revenue (the EGP collected from garages for credits) is tracked separately on each garage doc as `totalAdminRevenue` and aggregated in the admin summary. Garage revenue (money collected from drivers at check-out, plus 5 EGP per subscriber renewal) is tracked separately as `totalRevenue` / `todayRevenue`.

All login PINs are exactly 5 digits. Payment references are unique per garage (the same reference may be used by two different garages, but never twice for the same garage).

## Retired features

The following features have been removed from the product entirely:

- Announcements (create, delete, toggle, and garage-dashboard display) — removed.
- Packages / credit-bundle templates — removed. Credit grants use custom amounts only.
- Garage-level subscription billing, duration/capacity/weekly/monthly garage packages.
- Old recharge requests, wallet/top-up workflows, and the old two-day trial.
- Legacy commission paths (recharge-based, no 500 EGP threshold).

New writes must reject them. The server endpoints for these features no longer exist.

## Engineering authority

The Worker is authoritative for identity, role, garage scope, financial values, subscriber eligibility, counters, reports, and mutations. The browser renders server decisions and may provide optimistic feedback, but it cannot approve money, change balances, or make final eligibility decisions. The browser performs zero direct Firestore writes.

Multi-document business changes use Firestore transactions. Retried intents use idempotency keys and request fingerprints. Domain events, activity records, projections, and ledgers must agree through reconciliation.

Staff deletion performs full revocation: all active sessions are revoked, the session index is invalidated, the Firebase Auth user is deleted, and the staff member's activity history is removed.

Garage deletion is a multi-step process that also cleans up payment reference markers, credit ledger entries, activity logs, staff records, sessions, and private PINs.

## UX boundary

Arabic is the sole supported application language. Keep user-facing interface copy Arabic-only and use RTL layout across active roles, screens, dialogs, and shared feedback. Time is hidden from user-facing screens; server timestamps remain authoritative internally.

Preserve the existing visual design, Egyptian license-plate identity, mobile/desktop layout, and role flows. Keep plate identifiers, PINs, IDs, and numeric entry readable in their appropriate direction.
