# RQ project model

RQ is a bilingual Arabic/English garage-management PWA. Production architecture is Cloudflare Pages → Cloudflare Worker using Hono → Firebase Authentication and Firestore.

## Active product model

Garage billing uses prepaid credits only. Admin confirms payment and grants credits through the Worker. Regular vehicle entry consumes credits according to the approved charging rule. Credit grants, debits, restores, referrals, and commissions are transactional, idempotent, and auditable.

A new trial grants exactly 100 trial credits. The old two-free-day behavior is retired. Trial credits are a separate ledger bucket and are not cash revenue.

Monthly vehicle subscribers are a separate garage-owned product. They remain active, but there is no separate subscriber charge. Subscriber eligibility and renewal behavior are server-authoritative and use the canonical credit model.

Delegate commission is 100 EGP exactly once per garage, triggered by that garage’s first successful paid credit grant. Retries, later grants, and legacy recharge events do not create another commission.

## Retired model

Garage-level subscription billing, duration/capacity/weekly/monthly garage packages, old recharge requests, wallet/top-up workflows, the old two-day trial, and legacy commission paths are not active product capabilities. New writes must reject them.

## Engineering authority

The Worker is authoritative for identity, role, garage scope, financial values, subscriber eligibility, counters, reports, and mutations. The browser renders server decisions and may provide optimistic feedback, but it cannot approve money, change balances, or make final eligibility decisions.

Multi-document business changes use Firestore transactions. Retried intents use idempotency keys and request fingerprints. Domain events, activity records, projections, and ledgers must agree through reconciliation.

## UX boundary

Arabic is the sole supported application language. Keep user-facing interface copy Arabic-only and use RTL layout across active roles, screens, dialogs, and shared feedback. Preserve the existing visual design, Egyptian license-plate identity, mobile/desktop layout, and role flows. Keep plate identifiers, PINs, IDs, and numeric entry readable in their appropriate direction. Remove obsolete UI actions only when explicitly authorized; do not redesign active screens.
